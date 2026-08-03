/**
 * main.js — Boot, input, simulation tick, RAF render loop.
 */

import {
  BASE_MOMENTUM_DECAY,
  VICTORY_SUMMIT,
  HECATE_INTERVAL,
  ACTIVE_SPEED_DECAY,
  resolveClick,
  resolvePassive,
  resolveHecateOrb,
  spiteFromRun,
  clamp01,
  summitDistanceFor,
} from './game/formulas.js';
import {
  loadState,
  saveState,
  resetRunProgress,
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

  // Always push once on press.
  doPush(opts);

  if (!canHold) return;
  holding = true;
  holdAcc = 0;
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
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'KeyE') {
    endHold();
  }
});

window.addEventListener('blur', () => endHold());

window.addEventListener('resize', () => renderer.resize());
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

  // Track current active push speed (m/s) for Hermes Sandals.
  const nowSec = performance.now() / 1000;
  if (distGained > 0) {
    const gap = state.run.lastPushTime
      ? Math.max(0.05, Math.min(1.5, nowSec - state.run.lastPushTime))
      : 0.2;
    const speed = distGained / gap;
    // Blend toward latest click rate so it reads as "current", not a sticky peak.
    const prev = state.run.activePushSpeed || 0;
    state.run.activePushSpeed = prev * 0.35 + speed * 0.65;
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
    state.run.spinQueue += renderer.rollRadiansForDistance(distGained, progress, summitDist);
  }
  state.meta.totalClicks += 1;
  state.ui.lastClickFx = performance.now();

  checkSummit();
  ui.refresh();
}

function applyGains(distance, defiance) {
  const summitDist = summitDistanceFor(state.meta.summits);
  if (distance > 0) {
    state.run.distance = Math.min(summitDist, state.run.distance + distance);
  }
  if (defiance > 0) {
    // Whole Defiance only — bank fractions across ticks so idle isn't starved.
    state.run.defianceRemainder = (state.run.defianceRemainder || 0) + defiance;
    const gained = Math.floor(state.run.defianceRemainder);
    if (gained > 0) {
      state.run.defianceRemainder -= gained;
      state.run.defiance += gained;
      state.run.runDefianceEarned += gained;
      state.meta.totalDefiance += gained;
    }
  }
}

function checkSummit() {
  const summitDist = summitDistanceFor(state.meta.summits);
  if (state.run.distance < summitDist || state.ui.summitPending) return;

  state.run.distance = summitDist;
  state.run.visualDistance = summitDist;
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

  resetRunProgress(state);
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

  // Current push speed fades after you stop clicking (Hermes tracks "now", not peak).
  if (state.run.activePushSpeed > 0) {
    const sincePush = performance.now() / 1000 - (state.run.lastPushTime || 0);
    if (sincePush > 0.3) {
      state.run.activePushSpeed *= Math.exp(-dt * ACTIVE_SPEED_DECAY);
      if (state.run.activePushSpeed < 0.02) state.run.activePushSpeed = 0;
    }
  }

  // Passive: Shades + Hermes background velocity
  const passive = resolvePassive(state, stats, dt);
  let distBefore = state.run.distance;
  applyGains(passive.distance, passive.defiance);
  let distGained = state.run.distance - distBefore;

  // Hecate orbs — periodic anti-gravity spikes
  if (stats.hecateLevel > 0) {
    state.run.hecateTimer = (state.run.hecateTimer || 0) + dt;
    if (state.run.hecateTimer >= HECATE_INTERVAL) {
      state.run.hecateTimer -= HECATE_INTERVAL;
      const orb = resolveHecateOrb(state, stats);
      distBefore = state.run.distance;
      applyGains(orb.distance, orb.defiance);
      distGained += state.run.distance - distBefore;
      if (orb.distance > 0) {
        state.run.pushPulse = Math.min(1, state.run.pushPulse + 0.35);
      }
    }
  }

  // Queue roll the same way as clicks (drained smoothly below).
  if (distGained > 0) {
    const summitDist = summitDistanceFor(state.meta.summits);
    const progress = state.run.distance / summitDist;
    state.run.spinQueue += renderer.rollRadiansForDistance(distGained, progress, summitDist);
  }

  // Momentum: delay buffer, then decay. Clicks always allowed.
  state.run.momentumIdleTimer += dt;
  if (state.run.momentumIdleTimer > stats.momentumDecayDelay) {
    state.run.momentum = clamp01(state.run.momentum - BASE_MOMENTUM_DECAY * dt);
  }

  // Push squash — slower decay so it doesn't pop.
  state.run.pushPulse = Math.max(0, state.run.pushPulse - dt * 2.4);

  easeVisuals(dt);
  checkSummit();
}

/** Ease camera path + boulder roll so clicks don't teleport. */
function easeVisuals(dt) {
  const follow = 1 - Math.exp(-dt * 7);
  state.run.visualDistance += (state.run.distance - state.run.visualDistance) * follow;

  const spinFollow = 1 - Math.exp(-dt * 10);
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

  // HUD throttled; canvas every frame for smooth rotation.
  if (uiAcc >= 0.1) {
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
  resetRunProgress(state);
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
  const next = Math.min(summitDist, before + 1000);
  const gained = next - before;
  if (gained <= 0) return;
  state.run.distance = next;
  state.run.visualDistance = next;
  state.run.spinQueue += renderer.rollRadiansForDistance(gained, next / summitDist, summitDist);
  checkSummit();
  ui.refresh();
});

document.getElementById('debug-summit')?.addEventListener('click', () => {
  if (state.ui.summitPending) return;
  const summitDist = summitDistanceFor(state.meta.summits);
  state.run.distance = summitDist;
  state.run.visualDistance = summitDist;
  state.run.spinQueue = 0;
  checkSummit();
  ui.refresh();
});

// Expose for quick console debugging during prototype playtests.
window.__sisyphus = { state, getLiveStats, saveState };
