/**
 * state.js — Single source of truth for run + meta progression.
 */

import {
  RUN_UPGRADES,
  SKILL_TREE,
  SUMMIT_DISTANCE,
  summitDistanceFor,
  deriveStats,
  upgradeCost,
  isUpgradeUnlocked,
  skillBonuses,
  migrateSkills,
  skillPrereqsMet,
} from './formulas.js';

const SAVE_KEY = 'sisyphus_incremental_v1';

export function createInitialState() {
  return {
    run: {
      distance: 0,
      defiance: 0,
      defianceRemainder: 0, // fractional bank so idle ticks still accumulate whole Defiance
      runDefianceEarned: 0, // total earned this run (for Spite calc)
      momentum: 0, // 0..1
      momentumIdleTimer: 0, // seconds since last click
      boulderRotation: 0, // radians (displayed; fed from spinQueue)
      spinQueue: 0, // pending roll radians to ease in
      visualDistance: 0, // camera path — eases toward distance − Device slack
      /**
       * Meters that count for gameplay but the camera should not chase
       * (e.g. Daedalus Device banks progress without a rocket slide).
       */
      visualSlack: 0,
      /** Smoothed walk/roll m/s ceiling (eases between passive/active max). */
      visualSpeedCap: 5,
      /** Last frame’s camera climb rate (m/s) for walk/roll pacing. */
      lastVisualMps: 0,
      pushPulse: 0, // visual squash/stretch timer
      peakActiveSpeed: 0, // legacy; unused
      activePushSpeed: 0, // current active m/s (Hecate / stats readout)
      lastPushTime: 0, // performance.now()/1000 of last click
      hecateTimer: 0, // seconds toward next Hecate orb
      prometheusCd: 0,
      daedalusCd: 0,
      prometheusBuffTimer: 0,
      skillFx: null, // { kind, t } cast flash for renderer
      /** Timed boulder weak-spot: { nx, ny, life, maxLife } or null. */
      crackSpot: null,
      /** Seconds until next crack appears (when no spot is up). */
      crackTimer: 12,
      /** Brief toast after a successful crack hit. */
      crackToast: null, // { t, distance, defiance }
      upgrades: Object.fromEntries(Object.keys(RUN_UPGRADES).map((k) => [k, 0])),
    },
    meta: {
      spite: 0,
      summits: 0,
      escaped: false, // true after 5th summit victory
      totalDefiance: 0,
      totalClicks: 0,
      skills: Object.fromEntries(Object.keys(SKILL_TREE).map((k) => [k, 0])),
    },
    ui: {
      summitPending: false,
      summitKind: null, // 'review' | 'victory'
      spiteAward: 0,
      lastClickFx: 0,
    },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    const fresh = createInitialState();
    // Shallow-merge with defaults so new fields survive schema bumps.
    const run = {
      ...fresh.run,
      ...parsed.run,
      upgrades: { ...fresh.run.upgrades, ...(parsed.run?.upgrades || {}) },
    };
    // Visual fields aren't saved — start caught up with real distance.
    run.visualDistance = run.distance;
    run.visualSlack = Math.max(0, Number(run.visualSlack) || 0);
    run.lastVisualMps = 0;
    run.spinQueue = 0;
    // Ephemeral crack minigame — never restore mid-spot from save.
    run.crackSpot = null;
    run.crackToast = null;
    if (!(run.crackTimer > 0)) run.crackTimer = 10 + Math.random() * 8;
    // Spendable Defiance is whole; keep fractional bank across sessions.
    run.defiance = Math.floor(run.defiance || 0);
    run.defianceRemainder = Math.max(0, Number(parsed.run?.defianceRemainder) || 0);
    if (run.defianceRemainder >= 1) {
      const extra = Math.floor(run.defianceRemainder);
      run.defianceRemainder -= extra;
      run.defiance += extra;
    }
    run.runDefianceEarned = Number(parsed.run?.runDefianceEarned) || 0;
    return {
      run,
      meta: {
        ...fresh.meta,
        ...parsed.meta,
        skills: migrateSkills(parsed.meta?.skills || {}),
        totalDefiance: Math.floor(parsed.meta?.totalDefiance || 0),
      },
      ui: { ...fresh.ui },
    };
  } catch {
    return createInitialState();
  }
}

export function saveState(state) {
  try {
    const payload = {
      run: {
        distance: state.run.distance,
        defiance: state.run.defiance,
        defianceRemainder: state.run.defianceRemainder || 0,
        runDefianceEarned: state.run.runDefianceEarned,
        momentum: state.run.momentum,
        upgrades: state.run.upgrades,
      },
      meta: state.meta,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function resetRunProgress(state) {
  state.run.distance = 0;
  state.run.defiance = 0;
  state.run.defianceRemainder = 0;
  state.run.runDefianceEarned = 0;
  state.run.momentum = 0;
  state.run.momentumIdleTimer = 0;
  state.run.boulderRotation = 0;
  state.run.spinQueue = 0;
  state.run.visualDistance = 0;
  state.run.visualSlack = 0;
  state.run.visualSpeedCap = 5;
  state.run.lastVisualMps = 0;
  state.run.pushPulse = 0;
  state.run.peakActiveSpeed = 0;
  state.run.activePushSpeed = 0;
  state.run.lastPushTime = 0;
  state.run.hecateTimer = 0;
  state.run.prometheusCd = 0;
  state.run.daedalusCd = 0;
  state.run.prometheusBuffTimer = 0;
  state.run.skillFx = null;
  state.run.crackSpot = null;
  state.run.crackTimer = 10 + Math.random() * 8;
  state.run.crackToast = null;
  for (const key of Object.keys(state.run.upgrades)) {
    state.run.upgrades[key] = 0;
  }
}

/** Grant Pocket Grudge stipend. Does not count toward Spite. */
export function applyRunStipend(state) {
  const amount = Math.floor(skillBonuses(state.meta.skills).runStipend || 0);
  if (amount <= 0) return 0;
  state.run.defiance += amount;
  return amount;
}

/** Full run wipe + stipend (summit continue / restart). */
export function beginNewRun(state) {
  resetRunProgress(state);
  applyRunStipend(state);
}

/** Wipe run + meta + save (full new game). */
export function hardResetState(state) {
  const fresh = createInitialState();
  state.run = fresh.run;
  state.meta = fresh.meta;
  state.ui = fresh.ui;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function canAffordUpgrade(state, upgradeId) {
  const def = RUN_UPGRADES[upgradeId];
  if (!def || !isUpgradeUnlocked(state, def)) return false;
  const level = state.run.upgrades[upgradeId] || 0;
  return state.run.defiance >= upgradeCost(def, level);
}

export function buyUpgrade(state, upgradeId) {
  const def = RUN_UPGRADES[upgradeId];
  if (!def || !isUpgradeUnlocked(state, def)) return false;
  const cost = upgradeCost(def, state.run.upgrades[upgradeId] || 0);
  if (state.run.defiance < cost) return false;
  state.run.defiance -= cost;
  state.run.upgrades[upgradeId] = (state.run.upgrades[upgradeId] || 0) + 1;
  return true;
}

/** Buy as many levels as current Defiance allows (Ctrl/Cmd+click). */
export function buyUpgradeMax(state, upgradeId) {
  let bought = 0;
  while (buyUpgrade(state, upgradeId)) bought += 1;
  return bought;
}

export function canBuySkillNode(state, branchId) {
  const branch = SKILL_TREE[branchId];
  if (!branch) return false;
  if (!skillPrereqsMet(state.meta.skills, branchId)) return false;
  const owned = state.meta.skills[branchId] || 0;
  if (owned >= branch.nodes.length) return false;
  const node = branch.nodes[owned];
  return state.meta.spite >= node.cost;
}

export function buySkillNode(state, branchId) {
  const branch = SKILL_TREE[branchId];
  if (!branch) return false;
  if (!skillPrereqsMet(state.meta.skills, branchId)) return false;
  const owned = state.meta.skills[branchId] || 0;
  if (owned >= branch.nodes.length) return false;
  const node = branch.nodes[owned];
  if (state.meta.spite < node.cost) return false;

  const stipendBefore = skillBonuses(state.meta.skills).runStipend || 0;
  state.meta.spite -= node.cost;
  state.meta.skills[branchId] = owned + 1;
  const stipendAfter = skillBonuses(state.meta.skills).runStipend || 0;
  const stipendGain = Math.floor(stipendAfter - stipendBefore);
  if (stipendGain > 0) state.run.defiance += stipendGain;
  return true;
}

export function getLiveStats(state) {
  return deriveStats(state);
}

export { SUMMIT_DISTANCE, summitDistanceFor, RUN_UPGRADES, SKILL_TREE };
