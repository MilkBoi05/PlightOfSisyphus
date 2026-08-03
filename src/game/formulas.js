/**
 * formulas.js — Pure math for Sisyphus Incremental
 *
 * Six stat bottlenecks (GDD §6.2):
 *   Might, Traction, Grip, Momentum, Colony Throughput, Profit Multiplier
 *
 * Exact numbers are prototype-tuned (GDD §11 open decisions).
 */

export const SUMMIT_DISTANCES = [10_000, 15_000, 25_000, 50_000, 100_000];
/** First-summit length (also default / fallback). */
export const SUMMIT_DISTANCE = SUMMIT_DISTANCES[0];
/**
 * Hades kicks you further down each return.
 * `summitsCompleted` = meta.summits (0 before first clear).
 */
export function summitDistanceFor(summitsCompleted) {
  const idx = Math.max(0, Math.floor(summitsCompleted || 0));
  if (idx >= SUMMIT_DISTANCES.length) {
    return SUMMIT_DISTANCES[SUMMIT_DISTANCES.length - 1];
  }
  return SUMMIT_DISTANCES[idx];
}

/** Active click distance scalar — tuned for a tougher ~1h+ first summit. */
export const CLICK_DISTANCE_MULT = 0.26;
/** Passive distance scalar (idle still viable, just slower). */
export const PASSIVE_DISTANCE_MULT = 0.7;

export const BASE_MOMENTUM_BOOST = 0.1; // +10% at full bar → 1.10x
export const BASE_DECAY_DELAY = 1.0; // seconds before drain
export const BASE_MOMENTUM_BUILD = 1 / 30; // per click toward 1.0 (30 clicks)
export const BASE_MOMENTUM_DECAY = 0.4; // per second after delay (~2.5s full→empty)
export const VICTORY_SUMMIT = 5;
export const HECATE_INTERVAL = 10; // seconds between auto orbs
/** Hermes: fraction of *current* active m/s converted to passive, per level. */
export const HERMES_CONVERT_PER_LEVEL = 0.08;
/** How fast current push speed fades after you stop clicking. */
export const ACTIVE_SPEED_DECAY = 1.6;
/** Base seconds between auto-pushes while holding (before Relentless Tempo). */
export const HOLD_CLICK_BASE_INTERVAL = 1.0;
/** Seconds shaved off hold interval per Relentless Tempo level. */
export const HOLD_CLICK_INTERVAL_PER_LEVEL = 0.12;
export const HOLD_CLICK_MIN_INTERVAL = 0.28;
/** Shades: baseline passive m/s seed per level (before Traction / passives). */
export const SHADES_RATE_PER_LEVEL = 1.8;

/** Run upgrade definitions (reset on summit). `lane`: active push vs idle. */
export const RUN_UPGRADES = {
  callousedHands: {
    id: 'callousedHands',
    name: 'Calloused Hands',
    stat: 'Might',
    lane: 'active',
    desc: 'Raw push power. More Defiance & Distance seed per click.',
    baseCost: 15,
    costMult: 1.95,
  },
  spikedSandals: {
    id: 'spikedSandals',
    name: 'Spiked Sandals',
    stat: 'Traction',
    lane: 'active',
    desc: 'Converts Might into meters more efficiently.',
    baseCost: 90,
    costMult: 1.95,
  },
  chalkedGrip: {
    id: 'chalkedGrip',
    name: 'Chalked Grip',
    stat: 'Grip Capacity',
    lane: 'active',
    desc: 'Raises the soft ceiling so late-mountain push converts better.',
    baseCost: 120,
    costMult: 2.0,
  },
  steadyRhythm: {
    id: 'steadyRhythm',
    name: 'Steady Rhythm',
    stat: 'Momentum',
    lane: 'active',
    desc: 'Raises the max Momentum output boost.',
    baseCost: 140,
    costMult: 2.05,
  },
  grudgeLedger: {
    id: 'grudgeLedger',
    name: 'Grudge Ledger',
    stat: 'Profit Multiplier',
    lane: 'active',
    desc: 'Each meter of progress pays more Defiance.',
    baseCost: 22,
    costMult: 2.0,
  },
  shades: {
    id: 'shades',
    name: 'Shades',
    stat: 'Colony Throughput',
    lane: 'passive',
    desc: 'Damned souls shoulder the rock — baseline passive Distance (m/s) & Defiance.',
    baseCost: 28,
    costMult: 1.95,
  },
  hermesSandals: {
    id: 'hermesSandals',
    name: 'Winged Hermes Sandals',
    stat: 'Idle Velocity',
    lane: 'passive',
    desc: 'Converts a % of your current Active Push Speed into passive background velocity (fades when you stop clicking).',
    baseCost: 130,
    costMult: 2.0,
  },
  hecateOrbs: {
    id: 'hecateOrbs',
    name: "Hecate's Orbs",
    stat: 'Idle Bursts',
    lane: 'passive',
    desc: 'Every 10s Hecate lobs an anti-gravity orb at the boulder — a modest passive speed spike.',
    baseCost: 180,
    costMult: 2.15,
  },
  relentlessTempo: {
    id: 'relentlessTempo',
    name: 'Relentless Tempo',
    stat: 'Hold Push Rate',
    lane: 'active',
    desc: 'Speeds up auto-pushes while you hold click / Space. Requires Sustained Strain.',
    baseCost: 110,
    costMult: 2.05,
    /** Skill gate: Path of Cadence node 2 (Sustained Strain). */
    requiresSkill: { branch: 'momentum', minLevel: 2 },
  },
};

/**
 * Permanent skill tree — 6 branches × 3 nodes.
 * Nodes unlock in order within a branch. Costs are Spite.
 */
export const SKILL_TREE = {
  might: {
    id: 'might',
    name: 'Path of Muscle',
    stat: 'Might',
    nodes: [
      { name: 'Knuckle Dust', desc: '+12% Might', cost: 3, effect: { might: 0.12 } },
      { name: 'Shoulder Iron', desc: '+18% Might', cost: 8, effect: { might: 0.18 } },
      { name: 'Titan Strain', desc: '+25% Might', cost: 18, effect: { might: 0.25 } },
    ],
  },
  traction: {
    id: 'traction',
    name: 'Path of Footing',
    stat: 'Traction',
    nodes: [
      { name: 'Toehold', desc: '+10% Traction', cost: 3, effect: { traction: 0.1 } },
      { name: 'Switchback Step', desc: '+15% Traction', cost: 8, effect: { traction: 0.15 } },
      { name: 'Summit Stride', desc: '+22% Traction', cost: 18, effect: { traction: 0.22 } },
    ],
  },
  colony: {
    id: 'colony',
    name: 'Path of the Damned',
    stat: 'Colony Throughput',
    nodes: [
      { name: 'Whisper Choir', desc: '+15% Colony', cost: 4, effect: { colony: 0.15 } },
      { name: 'Chain Gang', desc: '+25% Colony', cost: 10, effect: { colony: 0.25 } },
      { name: 'Underworld Union', desc: '+35% Colony', cost: 22, effect: { colony: 0.35 } },
    ],
  },
  grip: {
    id: 'grip',
    name: 'Path of Hold',
    stat: 'Grip Capacity',
    nodes: [
      { name: 'Palm Chalk', desc: '+15% Grip', cost: 3, effect: { grip: 0.15 } },
      { name: 'Iron Fingers', desc: '+20% Grip', cost: 9, effect: { grip: 0.2 } },
      { name: 'Unslipping', desc: '+30% Grip', cost: 20, effect: { grip: 0.3 } },
    ],
  },
  momentum: {
    id: 'momentum',
    name: 'Path of Cadence',
    stat: 'Momentum',
    nodes: [
      { name: 'Warm-Up', desc: '+4% boost cap, +10% build', cost: 4, effect: { momBoost: 0.04, momBuild: 0.1 } },
      {
        name: 'Sustained Strain',
        desc: 'Unlock hold-to-push: hold click or Space to auto-push.',
        cost: 10,
        effect: { holdClick: true },
      },
      { name: 'Second Wind', desc: '+0.3s buffer, +12% build', cost: 14, effect: { momDelay: 0.3, momBuild: 0.12 } },
      { name: 'Perpetual Push', desc: '+6% boost cap, +0.4s buffer', cost: 28, effect: { momBoost: 0.06, momDelay: 0.4 } },
    ],
  },
  profit: {
    id: 'profit',
    name: 'Path of Grudge',
    stat: 'Profit Multiplier',
    nodes: [
      { name: 'Petty Ledger', desc: '+12% Profit', cost: 3, effect: { profit: 0.12 } },
      { name: 'Score Settling', desc: '+18% Profit', cost: 8, effect: { profit: 0.18 } },
      { name: 'Eternal Audit', desc: '+28% Profit', cost: 18, effect: { profit: 0.28 } },
    ],
  },
};

/** Hades corporate-review lines (rotating). */
export const HADES_LINES = [
  `"Your summit arrival was 0.3σ below quarterly forecast. Recalibrate your suffering and try again."`,
  `"Noted: you pushed a rock uphill. Congrats on meeting the absolute bare minimum of eternal damnation."`,
  `"I've scheduled a follow-up kick. Please hold all defiance until after the performance improvement plan."`,
  `"Feedback: enthusiasm — high. Results — circular. Same boulder, same mountain, same you."`,
  `"We're cascading alignment on your punishment KPIs. Spoiler: you are the KPI."`,
];

export function upgradeCost(def, level) {
  return Math.floor(def.baseCost * Math.pow(def.costMult, level));
}

/** Aggregate permanent skill multipliers from owned nodes. */
export function skillBonuses(skillLevels) {
  const out = {
    might: 0,
    traction: 0,
    colony: 0,
    grip: 0,
    profit: 0,
    momBoost: 0,
    momBuild: 0,
    momDelay: 0,
    holdClick: false,
  };

  for (const [branchId, branch] of Object.entries(SKILL_TREE)) {
    const owned = skillLevels[branchId] || 0;
    for (let i = 0; i < owned; i++) {
      const effect = branch.nodes[i].effect;
      for (const [k, v] of Object.entries(effect)) {
        if (k === 'holdClick') out.holdClick = out.holdClick || !!v;
        else out[k] = (out[k] || 0) + v;
      }
    }
  }
  return out;
}

/** Whether a run upgrade’s skill gate is satisfied. */
export function isUpgradeUnlocked(state, def) {
  if (!def?.requiresSkill) return true;
  const { branch, minLevel } = def.requiresSkill;
  return (state.meta.skills[branch] || 0) >= minLevel;
}

export function holdClickInterval(state, stats) {
  if (!stats.holdClick) return null;
  const lv = state.run.upgrades.relentlessTempo || 0;
  return Math.max(
    HOLD_CLICK_MIN_INTERVAL,
    HOLD_CLICK_BASE_INTERVAL - lv * HOLD_CLICK_INTERVAL_PER_LEVEL
  );
}

/**
 * Derive live combat stats from run levels + skill tree + meta flags.
 */
export function deriveStats(state) {
  const u = state.run.upgrades;
  const s = skillBonuses(state.meta.skills);
  const ngPlus = state.meta.escaped ? 1.5 : 1; // +50% after victory (GDD §6.1.5)

  const might = (1 + u.callousedHands * 1.0) * (1 + s.might) * ngPlus;
  const traction = (1 + u.spikedSandals * 0.35) * (1 + s.traction);
  const gripCapacity = (4 + u.chalkedGrip * 5.5) * (1 + s.grip);
  const colony = (u.shades * SHADES_RATE_PER_LEVEL) * (1 + s.colony) * ngPlus;
  const profit = (1 + u.grudgeLedger * 0.28) * (1 + s.profit);
  const hermesConvert = (u.hermesSandals || 0) * HERMES_CONVERT_PER_LEVEL;
  const hecateLevel = u.hecateOrbs || 0;
  const holdClick = !!s.holdClick;
  const holdInterval = holdClick
    ? Math.max(
        HOLD_CLICK_MIN_INTERVAL,
        HOLD_CLICK_BASE_INTERVAL - (u.relentlessTempo || 0) * HOLD_CLICK_INTERVAL_PER_LEVEL
      )
    : null;

  const momentumBoostCap = BASE_MOMENTUM_BOOST + u.steadyRhythm * 0.055 + s.momBoost;
  const momentumBuild = BASE_MOMENTUM_BUILD * (1 + s.momBuild);
  const momentumDecayDelay = BASE_DECAY_DELAY + s.momDelay;

  return {
    might,
    traction,
    gripCapacity,
    colony,
    profit,
    hermesConvert,
    hecateLevel,
    holdClick,
    holdInterval,
    momentumBoostCap,
    momentumBuild,
    momentumDecayDelay,
    ngPlus,
  };
}

/**
 * Momentum multiplier: 1.0 at 0% → (1 + boostCap) at 100%.
 * Scales linearly with fill so partial momentum still feels good.
 */
export function momentumMultiplier(fill, boostCap) {
  return 1 + boostCap * clamp01(fill);
}

/**
 * Grip Capacity soft ceiling (GDD §6.2):
 * Distance gain slows smoothly as required throughput rises with altitude
 * and push size, but never goes negative / reverses.
 *
 * efficiency = grip / (grip + pressure)
 * pressure grows with mountain progress and raw push size.
 */
/**
 * Grip soft ceiling for *active* clicks (steep late-mountain).
 */
export function gripEfficiency(rawPush, gripCapacity, distance, summitDistance = SUMMIT_DISTANCE) {
  const altitude = distance / Math.max(1, summitDistance);
  const slopeLoad = 0.55 + Math.pow(altitude, 1.9) * 14;
  const pressure = Math.max(0, rawPush) * slopeLoad;
  const grip = Math.max(0.5, gripCapacity);
  return grip / (grip + pressure);
}

/**
 * Idle softcap — altitude still bites a little, but high Shades/Hermes rates
 * are NOT punished (otherwise the HUD m/s lie and buffs cancel themselves).
 */
export function idleEfficiency(distance, summitDistance = SUMMIT_DISTANCE) {
  const altitude = distance / Math.max(1, summitDistance);
  // 1.0 at base → ~0.62 at summit
  return 1 / (1 + Math.pow(altitude, 1.65) * 0.6);
}

/** Raw + effective passive rates for sim + UI. */
export function getPassiveRates(state, stats) {
  const current = Math.max(0, state.run.activePushSpeed || 0);
  const hermesRaw = current * Math.max(0, stats.hermesConvert || 0);
  const shadesRaw = Math.max(0, stats.colony) * stats.traction * PASSIVE_DISTANCE_MULT;
  const summitDist = summitDistanceFor(state.meta.summits);
  const eff = idleEfficiency(state.run.distance, summitDist);
  return {
    shadesRaw,
    hermesRaw,
    efficiency: eff,
    shadesEffective: shadesRaw * eff,
    hermesEffective: hermesRaw * eff,
    totalEffective: (shadesRaw + hermesRaw) * eff,
  };
}

/**
 * Resolve one active click into distance + defiance gains.
 * Returns components for UI feedback (never negative distance).
 */
export function resolveClick(state, stats) {
  const summitDist = summitDistanceFor(state.meta.summits);
  const momMult = momentumMultiplier(state.run.momentum, stats.momentumBoostCap);
  const seed = stats.might * momMult;
  const rawDistance = seed * stats.traction * CLICK_DISTANCE_MULT;
  const efficiency = gripEfficiency(rawDistance, stats.gripCapacity, state.run.distance, summitDist);
  const distance = Math.max(0, rawDistance * efficiency);
  const rawDefiance = distance * stats.profit * 0.5 + seed * 0.15 * stats.profit;
  // Every active push grants at least 1 Defiance.
  const defiance = Math.max(1, rawDefiance);

  return { distance, defiance, momMult, efficiency, seed };
}

/**
 * Passive tick: Shades (baseline m/s) + Hermes (current-push → background velocity).
 */
export function resolvePassive(state, stats, dt) {
  if (dt <= 0) return { distance: 0, defiance: 0 };

  const rates = getPassiveRates(state, stats);
  if (rates.shadesRaw <= 0 && rates.hermesRaw <= 0) {
    return { distance: 0, defiance: 0 };
  }

  const distance = Math.max(0, rates.totalEffective * dt);
  const defiance =
    distance * stats.profit * 0.5 + stats.colony * 0.08 * stats.profit * dt;
  return {
    distance,
    defiance,
    shadesRate: rates.shadesEffective,
    hermesRate: rates.hermesEffective,
    efficiency: rates.efficiency,
  };
}

/**
 * Hecate anti-gravity orb — small spike, not a teleport.
 * Deliberately ignores Colony so Shades buffs don't explode orb size.
 */
export function resolveHecateOrb(state, stats) {
  const level = stats.hecateLevel || 0;
  if (level <= 0) return { distance: 0, defiance: 0 };

  const summitDist = summitDistanceFor(state.meta.summits);
  const current = Math.max(0, state.run.activePushSpeed || 0);
  // ~3–20m across early levels; stays a nudge, not a teleport.
  const raw = (1.5 + level * 1.15 + current * 0.04) * stats.traction;
  const efficiency = idleEfficiency(state.run.distance, summitDist);
  const distance = Math.max(0, raw * efficiency);
  const defiance = distance * stats.profit * 0.5;
  return { distance, defiance };
}

/**
 * Spite payout from a finished run's total Defiance earned.
 * Uses √ so long climbs don't explode linearly, but the coefficient must stay
 * low — full skill tree costs ~193, so a first clear should only buy a few nodes.
 * (Old 0.65 paid ~155 on a 10k run.)
 */
export function spiteFromRun(runDefianceEarned, summitCount) {
  const d = Math.max(0, runDefianceEarned);
  const base = Math.floor(Math.sqrt(d) * 0.08);
  const bonus = Math.floor(summitCount * 0.5);
  return Math.max(1, base + bonus);
}

export function formatNumber(n, digits = 1) {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(Math.max(digits, 1)) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(Math.max(digits, 1)) + 'M';
  if (abs >= 1e4) return (n / 1e3).toFixed(Math.max(digits, 1)) + 'K';
  if (digits === 0) return Math.round(n).toLocaleString();
  if (abs >= 100) return Math.floor(n).toLocaleString();
  if (abs >= 10) return n.toFixed(1);
  return n.toFixed(Math.min(digits, 2));
}

export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
