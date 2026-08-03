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
      visualDistance: 0, // eased along path for camera/actors
      pushPulse: 0, // visual squash/stretch timer
      peakActiveSpeed: 0, // legacy; unused
      activePushSpeed: 0, // current active m/s (Hermes feeds on this)
      lastPushTime: 0, // performance.now()/1000 of last click
      hecateTimer: 0, // seconds toward next Hecate orb
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
    run.spinQueue = 0;
    // Defiance is whole currency only.
    run.defiance = Math.floor(run.defiance || 0);
    run.defianceRemainder = 0;
    run.runDefianceEarned = Math.floor(run.runDefianceEarned || 0);
    return {
      run,
      meta: {
        ...fresh.meta,
        ...parsed.meta,
        skills: { ...fresh.meta.skills, ...(parsed.meta?.skills || {}) },
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
  state.run.pushPulse = 0;
  state.run.peakActiveSpeed = 0;
  state.run.activePushSpeed = 0;
  state.run.lastPushTime = 0;
  state.run.hecateTimer = 0;
  for (const key of Object.keys(state.run.upgrades)) {
    state.run.upgrades[key] = 0;
  }
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

export function canBuySkillNode(state, branchId) {
  const branch = SKILL_TREE[branchId];
  if (!branch) return false;
  const owned = state.meta.skills[branchId] || 0;
  if (owned >= branch.nodes.length) return false;
  const node = branch.nodes[owned];
  return state.meta.spite >= node.cost;
}

export function buySkillNode(state, branchId) {
  const branch = SKILL_TREE[branchId];
  if (!branch) return false;
  const owned = state.meta.skills[branchId] || 0;
  if (owned >= branch.nodes.length) return false;
  const node = branch.nodes[owned];
  if (state.meta.spite < node.cost) return false;
  state.meta.spite -= node.cost;
  state.meta.skills[branchId] = owned + 1;
  return true;
}

export function getLiveStats(state) {
  return deriveStats(state);
}

export { SUMMIT_DISTANCE, summitDistanceFor, RUN_UPGRADES, SKILL_TREE };
