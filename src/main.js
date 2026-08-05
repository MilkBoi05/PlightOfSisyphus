/**
 * main.js — Boot, input, simulation tick, RAF render loop.
 */

import {
  BASE_MOMENTUM_DECAY,
  VICTORY_SUMMIT,
  ACTIVE_SPEED_DECAY,
  CRACK_WINDOW,
  resolveClick,
  resolvePassive,
  resolveHecateOrb,
  resolveDaedalusShove,
  resolveCrackHit,
  prometheusSkill,
  daedalusSkill,
  spiteFromRun,
  clamp01,
  summitDistanceFor,
  hecateIntervalFor,
  nextCrackInterval,
  randomCrackOffset,
  visualMpsCapped,
  blendVisualSpeedCap,
  VISUAL_MPS_PASSIVE_MAX,
  DISPLAY_METER_SCALE,
} from './game/formulas.js';
import {
  loadState,
  saveState,
  beginNewRun,
  hardResetState,
  getLiveStats,
} from './game/state.js';
import { createRenderer } from './game/render.js';
import { createUI } from './game/ui.js';

const state = loadState();
const canvas = document.getElementById('game-canvas');
const renderer = createRenderer(canvas);

let lastTs = performance.now();
let saveAcc = 0;
let uiAcc = 0;

const ui = createUI(state, {
  onSummitContinue: () => completeSummit(),
  onCastPrometheus: () => castPrometheus(),
  onCastDaedalus: () => castDaedalus(),
  onStateChange: () => {
    ui.refresh();
    saveState(state);
  },
});

let holding = false;
let holdAcc = 0;
let holdPointerId = null;
let lastPointerClientX = null;
let lastPointerClientY = null;

function beginHold(opts = {}) {
  if (state.ui.summitPending) return;
  const stats = getLiveStats(state);
  const canHold = !!stats.holdClick;

  // Crack spots only count for real pointer aim (not Space / auto-hold).
  if (Number.isFinite(opts.clientX) && Number.isFinite(opts.clientY)) {
    tryHitCrack(opts.clientX, opts.clientY);
  }

  // Always push once on press.
  doPush(opts);

  if (!canHold) return;
  holding = true;
  holdAcc = 0;
}

function tryHitCrack(clientX, clientY) {
  const spot = state.run.crackSpot;
  if (!spot || !(spot.life > 0)) return false;
  if (!renderer.hitTestCrackSpot(clientX, clientY, state)) return false;

  const stats = getLiveStats(state);
  const bonus = resolveCrackHit(state, stats);
  const distBefore = state.run.distance;
  applyGains(bonus.distance, bonus.defiance);
  const distGained = state.run.distance - distBefore;

  state.run.crackSpot = null;
  state.run.crackTimer = nextCrackInterval();
  state.run.crackToast = {
    t: 2.2,
    distance: bonus.distance,
    defiance: bonus.defiance,
  };
  state.run.pushPulse = Math.min(1, state.run.pushPulse + 0.85);
  triggerSkillFx('crack');

  if (distGained > 0) {
    const summitDist = summitDistanceFor(state.meta.summits);
    const progress = state.run.distance / summitDist;
    state.run.spinQueue +=
      renderer.rollRadiansForDistance(distGained, progress, summitDist) * 1.6;
    renderer.burstDust(state, { clientX, clientY });
  }

  checkSummit();
  return true;
}

function endHold() {
  holding = false;
  holdAcc = 0;
  holdPointerId = null;
}

// —— Input ——
canvas.addEventListener('pointerdown', (e) => {
  if (state.ui.summitPending) return;
  const onRock = renderer.hitTestBoulder(e.clientX, e.clientY, state);
  holdPointerId = e.pointerId;
  lastPointerClientX = e.clientX;
  lastPointerClientY = e.clientY;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  beginHold({
    strongPulse: onRock,
    clientX: e.clientX,
    clientY: e.clientY,
  });
});

canvas.addEventListener('pointermove', (e) => {
  if (holdPointerId == null || e.pointerId !== holdPointerId) return;
  lastPointerClientX = e.clientX;
  lastPointerClientY = e.clientY;
});

function releaseCanvasHold(e) {
  if (holdPointerId != null && e.pointerId !== holdPointerId) return;
  endHold();
  if (e.pointerId != null) {
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
}

canvas.addEventListener('pointerup', releaseCanvasHold);
canvas.addEventListener('pointercancel', releaseCanvasHold);
canvas.addEventListener('lostpointercapture', () => endHold());

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'KeyE') {
    e.preventDefault();
    beginHold();
  }
  if (e.code === 'KeyQ') {
    e.preventDefault();
    castPrometheus();
  }
  if (e.code === 'KeyF') {
    e.preventDefault();
    castDaedalus();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'KeyE') {
    endHold();
  }
});

window.addEventListener('blur', () => endHold());

window.addEventListener('resize', () => renderer.resize());
// Catches layout-driven size changes (devtools dock, zoom) that skip window resize.
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => renderer.resize()).observe(canvas);
}
renderer.resize();

/**
 * Micro-loop click: Distance + Defiance, build Momentum, spin boulder.
 * Never locks out or penalizes input (GDD §4 / §8).
 */
function doPush(opts = {}) {
  if (state.ui.summitPending) return;

  const stats = getLiveStats(state);
  const result = resolveClick(state, stats);

  const distBefore = state.run.distance;
  applyGains(result.distance, result.defiance);
  const distGained = state.run.distance - distBefore;

  // Track current active push speed (m/s) for Hecate / stats / walk.
  const nowSec = performance.now() / 1000;
  if (distGained > 0) {
    const rawGap = state.run.lastPushTime
      ? nowSec - state.run.lastPushTime
      : 0.2;
    // After a pause, don’t invent a huge m/s from dist / tiny window.
    const gap =
      rawGap > 0.45
        ? 0.4
        : Math.max(0.08, Math.min(1.2, rawGap));
    const speed = distGained / gap;
    const prev = state.run.activePushSpeed || 0;
    const keep = prev < 0.15 ? 0.3 : 0.4;
    let next = prev * keep + speed * (1 - keep);
    // Cold start: cap the first sample so one click can’t claim a sprint.
    if (prev < 0.2) next = Math.min(next, 4);
    state.run.activePushSpeed = next;
  }
  state.run.lastPushTime = nowSec;

  // Momentum build (pure positive)
  state.run.momentum = clamp01(state.run.momentum + stats.momentumBuild);
  state.run.momentumIdleTimer = 0;

  // Visual feedback — soft pulse; spin eases in over the next frames.
  state.run.pushPulse = Math.min(1, state.run.pushPulse + 0.5);
  renderer.burstDust(state, {
    clientX: opts.clientX ?? lastPointerClientX,
    clientY: opts.clientY ?? lastPointerClientY,
  });
  if (distGained > 0) {
    const summitDist = summitDistanceFor(state.meta.summits);
    const progress = state.run.distance / summitDist;
    // Light punch only — sustained roll comes from visualDistance catch-up.
    state.run.spinQueue +=
      renderer.rollRadiansForDistance(distGained, progress, summitDist) * 0.18;
  }
  state.meta.totalClicks += 1;
  state.ui.lastClickFx = performance.now();

  checkSummit();
  ui.refresh();
}

function triggerSkillFx(kind) {
  state.run.skillFx = { kind, t: 1 };
}

function castPrometheus() {
  if (state.ui.summitPending) return false;
  const stats = getLiveStats(state);
  const skill = prometheusSkill(stats.prometheusLevel || 0);
  if (!skill) return false;
  if ((state.run.prometheusCd || 0) > 0) return false;

  state.run.prometheusBuffTimer = skill.duration;
  state.run.prometheusCd = Math.max(12, skill.cooldown + (stats.prometheusCdMod || 0));
  triggerSkillFx('prometheus');
  ui.refresh();
  return true;
}

function castDaedalus() {
  if (state.ui.summitPending) return false;
  const stats = getLiveStats(state);
  const skill = daedalusSkill(stats.daedalusLevel || 0);
  if (!skill) return false;
  if ((state.run.daedalusCd || 0) > 0) return false;

  const result = resolveDaedalusShove(state, stats);
  const distBefore = state.run.distance;
  const visualBefore = state.run.visualDistance ?? distBefore;
  applyGains(result.distance, result.defiance);
  const distGained = state.run.distance - distBefore;

  state.run.daedalusCd = Math.max(18, skill.cooldown + (stats.daedalusCdMod || 0));
  // Full meters/Def bank instantly; only a tiny cosmetic shove on camera.
  state.run.pushPulse = Math.min(1, state.run.pushPulse + 0.22);
  state.run._lastDaedalusGain = distGained;
  state.run._lastDaedalusDef = Math.floor(result.defiance || 0);
  triggerSkillFx('daedalus');

  if (distGained > 0) {
    const summitDist = summitDistanceFor(state.meta.summits);
    const progress = state.run.distance / summitDist;
    const visualNudge = Math.min(1.2, 0.55 + distGained * 0.02);
    state.run.visualDistance = Math.min(state.run.distance, visualBefore + visualNudge);
    // Remaining Device meters stay in slack — camera must not chase them.
    state.run.visualSlack =
      (state.run.visualSlack || 0) + Math.max(0, distGained - visualNudge);
    state.run.spinQueue +=
      renderer.rollRadiansForDistance(visualNudge, progress, summitDist) * 0.7;
    renderer.burstDust(state, {
      clientX: lastPointerClientX,
      clientY: lastPointerClientY,
    });
  }

  checkSummit();
  ui.refresh();
  return true;
}

function applyGains(distance, defiance) {
  const summitDist = summitDistanceFor(state.meta.summits);
  if (distance > 0) {
    state.run.distance = Math.min(summitDist, state.run.distance + distance);
  }
  if (defiance > 0) {
    // Bank the full fractional payout; only whole Defiance is spendable/displayed.
    state.run.defianceRemainder = (state.run.defianceRemainder || 0) + defiance;
    state.run.runDefianceEarned += defiance;
    state.meta.totalDefiance += defiance;
    const gained = Math.floor(state.run.defianceRemainder);
    if (gained > 0) {
      state.run.defianceRemainder -= gained;
      state.run.defiance += gained;
    }
  }
}

function checkSummit() {
  const summitDist = summitDistanceFor(state.meta.summits);
  if (state.run.distance < summitDist || state.ui.summitPending) return;

  state.run.distance = summitDist;
  state.run.visualDistance = summitDist;
  state.run.visualSlack = 0;
  state.run.visualSpeedCap = VISUAL_MPS_PASSIVE_MAX;
  const nextSummit = state.meta.summits + 1;
  const award = spiteFromRun(state.run.runDefianceEarned, nextSummit);
  const kind = nextSummit >= VICTORY_SUMMIT && !state.meta.escaped ? 'victory' : 'review';

  state.ui.summitPending = true;
  state.ui.summitKind = kind;
  state.ui.spiteAward = award;
  ui.showSummit(kind, award, state.meta.summits);
}

function completeSummit() {
  if (!state.ui.summitPending) return;

  const award = state.ui.spiteAward;
  const kind = state.ui.summitKind;

  state.meta.spite += award;
  state.meta.summits += 1;
  if (kind === 'victory') {
    state.meta.escaped = true;
  }

  beginNewRun(state);
  state.ui.summitPending = false;
  state.ui.summitKind = null;
  state.ui.spiteAward = 0;

  saveState(state);
  ui.refresh();
}

/**
 * Simulation step — passive income + momentum decay buffer.
 */
function tick(dt) {
  if (state.ui.summitPending) {
    // Still ease visual pulse / motion during overlay.
    state.run.pushPulse = Math.max(0, state.run.pushPulse - dt * 2);
    easeVisuals(dt);
    return;
  }

  const stats = getLiveStats(state);

  // Hold-to-push auto cadence (Sustained Strain skill).
  if (holding && !state.ui.summitPending) {
    const holdStats = getLiveStats(state);
    if (holdStats.holdClick && holdStats.holdInterval) {
      holdAcc += dt;
      while (holdAcc >= holdStats.holdInterval) {
        holdAcc -= holdStats.holdInterval;
        doPush();
      }
    } else {
      endHold();
    }
  }

  // Current push speed fades as soon as you stop clicking (hold keeps it alive).
  if (state.run.activePushSpeed > 0 && !holding) {
    state.run.activePushSpeed *= Math.exp(-dt * ACTIVE_SPEED_DECAY);
    if (state.run.activePushSpeed < 0.02) state.run.activePushSpeed = 0;
  }

  // Active skills — cooldowns + Prometheus buff window + cast FX fade.
  if ((state.run.prometheusCd || 0) > 0) {
    state.run.prometheusCd = Math.max(0, state.run.prometheusCd - dt);
  }
  if ((state.run.daedalusCd || 0) > 0) {
    state.run.daedalusCd = Math.max(0, state.run.daedalusCd - dt);
  }
  if ((state.run.prometheusBuffTimer || 0) > 0) {
    state.run.prometheusBuffTimer = Math.max(0, state.run.prometheusBuffTimer - dt);
  }
  if (state.run.skillFx) {
    state.run.skillFx.t -= dt * 2.2;
    if (state.run.skillFx.t <= 0) state.run.skillFx = null;
  }
  if (state.run.crackToast) {
    state.run.crackToast.t -= dt;
    if (state.run.crackToast.t <= 0) state.run.crackToast = null;
  }

  // Boulder crack minigame — one weak spot at a time.
  if (state.run.crackSpot) {
    state.run.crackSpot.life -= dt;
    if (state.run.crackSpot.life <= 0) {
      state.run.crackSpot = null;
      state.run.crackTimer = nextCrackInterval();
    }
  } else {
    state.run.crackTimer = (state.run.crackTimer || 0) - dt;
    if (state.run.crackTimer <= 0) {
      const off = randomCrackOffset();
      state.run.crackSpot = {
        nx: off.nx,
        ny: off.ny,
        life: CRACK_WINDOW,
        maxLife: CRACK_WINDOW,
      };
    }
  }

  // Passive: Shades + Hermes background velocity
  const passive = resolvePassive(state, stats, dt);
  let distBefore = state.run.distance;
  applyGains(passive.distance, passive.defiance);
  let distGained = state.run.distance - distBefore;

  // Hecate orbs — periodic anti-gravity spikes
  if (stats.hecateLevel > 0) {
    const hecateIv = hecateIntervalFor(stats);
    state.run.hecateTimer = (state.run.hecateTimer || 0) + dt;
    if (state.run.hecateTimer >= hecateIv) {
      state.run.hecateTimer -= hecateIv;
      const orb = resolveHecateOrb(state, stats);
      distBefore = state.run.distance;
      applyGains(orb.distance, orb.defiance);
      distGained += state.run.distance - distBefore;
      if (orb.distance > 0) {
        state.run.pushPulse = Math.min(1, state.run.pushPulse + 0.35);
      }
    }
  }

  // Stolen Rite — auto-cast skills when ready (true idle).
  if (stats.stolenRite) {
    castPrometheus();
    castDaedalus();
  }

  // Queue roll the same way as clicks (drained smoothly below).
  if (distGained > 0) {
    const summitDist = summitDistanceFor(state.meta.summits);
    const progress = state.run.distance / summitDist;
    // Light punch — main roll tracks visual catch-up in easeVisuals.
    state.run.spinQueue +=
      renderer.rollRadiansForDistance(distGained, progress, summitDist) * 0.12;
  }

  // Momentum: delay buffer, then decay — Cadence can leave a residual floor.
  state.run.momentumIdleTimer += dt;
  if (state.run.momentumIdleTimer > stats.momentumDecayDelay) {
    let next = state.run.momentum - BASE_MOMENTUM_DECAY * dt;
    if (next < 0) next = 0;
    const floor = stats.momentumFloor || 0;
    // Floor only holds once you've built Momentum this run (no free start).
    if (floor > 0 && state.run.momentum > 0) {
      next = Math.max(floor, next);
    }
    state.run.momentum = clamp01(next);
  }

  // Push squash — slower decay so it doesn't pop.
  state.run.pushPulse = Math.max(0, state.run.pushPulse - dt * 2.4);

  easeVisuals(dt);
  checkSummit();
}

/** Ease camera path + boulder roll — smoothed ceiling between 5 passive / 10 active. */
function easeVisuals(dt) {
  if (dt <= 0) return;
  const pushMps = Math.max(0, state.run.activePushSpeed || 0);
  const sincePush =
    performance.now() / 1000 - (state.run.lastPushTime || 0);
  // Cap follows input, not the long activePushSpeed tail — otherwise walk/camera
  // stay at the active ceiling for seconds after you stop clicking.
  const wantActiveCap = holding || sincePush < 0.1;
  state.run.visualSpeedCap = blendVisualSpeedCap(
    state.run.visualSpeedCap,
    wantActiveCap,
    dt
  );
  const cap = state.run.visualSpeedCap;

  const slack = Math.max(0, state.run.visualSlack || 0);
  // Chase real distance minus Device slack — banked Device meters stay off-camera.
  const visualTarget = Math.max(0, state.run.distance - slack);
  const prevVisual = state.run.visualDistance;
  const gap = visualTarget - prevVisual;
  if (gap > 0) {
    const gapMps = gap * 7;
    const realMps = wantActiveCap ? Math.max(gapMps, pushMps) : gapMps;
    const cappedMps = visualMpsCapped(realMps, cap);
    state.run.visualDistance = Math.min(
      visualTarget,
      prevVisual + cappedMps * dt
    );
  }

  // Rolling-without-slip: spin tracks how far the camera actually moved this frame
  // so it eases down with the visual cap instead of dying when clicks stop.
  const visualDelta = Math.max(0, state.run.visualDistance - prevVisual);
  if (visualDelta > 0) {
    const summitDist = summitDistanceFor(state.meta.summits);
    const progress = state.run.visualDistance / Math.max(1, summitDist);
    state.run.boulderRotation += renderer.rollRadiansForDistance(
      visualDelta,
      progress,
      summitDist
    );
  }

  // Extra click punch drains gently when idle so it doesn’t cut out hard.
  const spinRate = wantActiveCap ? 7 : 1.8;
  const spinFollow = 1 - Math.exp(-dt * spinRate);
  const spun = state.run.spinQueue * spinFollow;
  state.run.boulderRotation += spun;
  state.run.spinQueue -= spun;
}

function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  tick(dt);

  saveAcc += dt;
  uiAcc += dt;

  // HUD throttled; faster while a skill buff/FX is up so the status timer reads clean.
  const skillHudHot =
    (state.run.prometheusBuffTimer || 0) > 0 ||
    (state.run.skillFx && state.run.skillFx.t > 0) ||
    (state.run.crackSpot && state.run.crackSpot.life > 0) ||
    (state.run.crackToast && state.run.crackToast.t > 0);
  const uiInterval = skillHudHot ? 0.05 : 0.1;
  if (uiAcc >= uiInterval) {
    uiAcc = 0;
    ui.refresh();
  }
  if (saveAcc >= 5) {
    saveAcc = 0;
    saveState(state);
  }

  renderer.draw(state, dt);
  requestAnimationFrame(frame);
}

ui.refresh();
requestAnimationFrame(frame);

// —— Temporary DEV shortcuts (remove before ship) ——
document.getElementById('debug-restart')?.addEventListener('click', () => {
  state.ui.summitPending = false;
  state.ui.summitKind = null;
  state.ui.spiteAward = 0;
  const overlay = document.getElementById('summit-overlay');
  if (overlay) overlay.hidden = true;
  beginNewRun(state);
  saveState(state);
  ui.refresh();
});

document.getElementById('debug-hard-reset')?.addEventListener('click', () => {
  const ok = window.confirm(
    'Hard reset wipes EVERYTHING — Spite, skills, summits, upgrades, and save data. Continue?'
  );
  if (!ok) return;
  const overlay = document.getElementById('summit-overlay');
  if (overlay) overlay.hidden = true;
  hardResetState(state);
  saveState(state);
  ui.refresh();
});

document.getElementById('debug-skip-100')?.addEventListener('click', () => {
  if (state.ui.summitPending) return;
  const summitDist = summitDistanceFor(state.meta.summits);
  const before = state.run.distance;
  // Button is labelled in displayed meters (+100 m).
  const step = 100 / DISPLAY_METER_SCALE;
  const next = Math.min(summitDist, before + step);
  const gained = next - before;
  if (gained <= 0) return;
  state.run.distance = next;
  state.run.visualDistance = next;
  state.run.visualSlack = 0;
  state.run.spinQueue += renderer.rollRadiansForDistance(gained, next / summitDist, summitDist);
  checkSummit();
  ui.refresh();
});

document.getElementById('debug-summit')?.addEventListener('click', () => {
  if (state.ui.summitPending) return;
  const summitDist = summitDistanceFor(state.meta.summits);
  state.run.distance = summitDist;
  state.run.visualDistance = summitDist;
  state.run.visualSlack = 0;
  state.run.spinQueue = 0;
  checkSummit();
  ui.refresh();
});

function syncAnimTargetFromUi() {
  const sel = document.getElementById('debug-anim-target');
  if (sel) renderer.setAnimDebugTarget(sel.value);
}

function refreshAnimFrameLabel() {
  const el = document.getElementById('debug-anim-frame');
  if (!el) return;
  const info = renderer.getAnimFrameDebug();
  const fmt = (d, prefix) => {
    const name = `${prefix}${String(d.frame).padStart(2, '0')}`;
    return d.locked ? name : `auto(${name})`;
  };
  if (info.target === 'boulder') el.textContent = fmt(info.boulder, 'b');
  else if (info.target === 'sisy') el.textContent = fmt(info.sisy, 's');
  else el.textContent = `${fmt(info.sisy, 's')} ${fmt(info.boulder, 'b')}`;
}

function refreshAnimSpeedLabel() {
  const el = document.getElementById('debug-anim-speed');
  if (!el) return;
  const m = renderer.getAnimSpeedMult();
  el.textContent = `${m}×`;
}

document.getElementById('debug-anim-target')?.addEventListener('change', () => {
  syncAnimTargetFromUi();
  refreshAnimFrameLabel();
});
document.getElementById('debug-anim-prev')?.addEventListener('click', () => {
  syncAnimTargetFromUi();
  renderer.stepAnimFrame(-1);
  refreshAnimFrameLabel();
});
document.getElementById('debug-anim-next')?.addEventListener('click', () => {
  syncAnimTargetFromUi();
  renderer.stepAnimFrame(1);
  refreshAnimFrameLabel();
});
document.getElementById('debug-anim-play')?.addEventListener('click', () => {
  syncAnimTargetFromUi();
  renderer.playAnimFrames();
  refreshAnimFrameLabel();
});
document.getElementById('debug-anim-slower')?.addEventListener('click', () => {
  renderer.nudgeAnimSpeed(-1);
  refreshAnimSpeedLabel();
});
document.getElementById('debug-anim-faster')?.addEventListener('click', () => {
  renderer.nudgeAnimSpeed(1);
  refreshAnimSpeedLabel();
});
const animTargetEl = document.getElementById('debug-anim-target');
if (animTargetEl) {
  animTargetEl.value = renderer.getAnimDebugTarget();
}
// Ensure nothing is left frozen from a prior scrub.
renderer.playAnimFrames();
refreshAnimFrameLabel();
refreshAnimSpeedLabel();
setInterval(refreshAnimFrameLabel, 200);

// Expose for quick console debugging during prototype playtests.
window.__sisyphus = { state, getLiveStats, saveState };
