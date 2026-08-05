/**
 * formulas.js — Pure math for Sisyphus Incremental
 *
 * Six stat bottlenecks (GDD §6.2):
 *   Might, Traction, Grip, Momentum, Colony Throughput, Profit Multiplier
 *
 * Exact numbers are prototype-tuned (GDD §11 open decisions).
 */

export const SUMMIT_DISTANCES = [1_000, 10_000, 50_000, 250_000, 1_000_000];
/** First-summit length (also default / fallback). */
export const SUMMIT_DISTANCE = SUMMIT_DISTANCES[0];

/**
 * Cosmetics only — HUD / labels show meters × this.
 * Does not touch sim, softcaps, or Spite. Tune after early-summit playtest.
 */
export const DISPLAY_METER_SCALE = 0.1;

/** Display-only meter/speed value (sim stays on true meters). */
export function displayMeters(n) {
  return (Number.isFinite(n) ? n : 0) * DISPLAY_METER_SCALE;
}

/**
 * Throughput mult per summit band — tuned so a decked full-momentum board
 * clears near: ~5–10m / 30m / 1h / 2h / 3h.
 * Applied to active + softcapped passive (+ skills that grant meters).
 */
export const SUMMIT_PACE_MULTS = [1, 1.35, 2.1, 4.2, 8.5];

/**
 * Hades kicks you further down each return.
 * Early climb is short; later walls lean on Spite + idle.
 * `summitsCompleted` = meta.summits (0 before first clear).
 */
export function summitDistanceFor(summitsCompleted) {
  const idx = Math.max(0, Math.floor(summitsCompleted || 0));
  if (idx >= SUMMIT_DISTANCES.length) {
    return SUMMIT_DISTANCES[SUMMIT_DISTANCES.length - 1];
  }
  return SUMMIT_DISTANCES[idx];
}

/** Pace multiplier for the current mountain length. */
export function summitPaceMult(summitDistance) {
  const d = Math.max(1, summitDistance || SUMMIT_DISTANCE);
  let idx = 0;
  for (let i = 0; i < SUMMIT_DISTANCES.length; i++) {
    if (d + 0.5 >= SUMMIT_DISTANCES[i]) idx = i;
  }
  return SUMMIT_PACE_MULTS[Math.min(idx, SUMMIT_PACE_MULTS.length - 1)];
}

/** Baseline Defiance granted per meter before Blood Tithe. */
export const DEFIANCE_BASE_PER_METER = 1.0;
/** Flat Defiance/m added per Blood Tithe level (then × Ledger / skill). */
export const BLOOD_TITHE_PER_LEVEL = 0.209;
/** Grudge Ledger multiplicative Profit per level. */
export const GRUDGE_LEDGER_PER_LEVEL = 0.5225;
/** Active click distance scalar — Might × Traction seed → meters. */
export const CLICK_DISTANCE_MULT = 0.304;
/** Global distance gain scale (clicks, idle, skills). 0.85 = 15% slower climb. */
export const DISTANCE_GAIN_MULT = 0.85;
/** Passive distance scalar (idle still viable, just slower than active). */
export const PASSIVE_DISTANCE_MULT = 0.4;

/**
 * Hard caps for on-screen climb feel (HUD m/s stays uncapped).
 * Active = clicking / hold; passive = idle catch-up (Shades / Hermes).
 */
export const VISUAL_MPS_ACTIVE_MAX = 10;
export const VISUAL_MPS_PASSIVE_MAX = 5;
/**
 * Camera follow toward earned meters. Exponential softens click jolts.
 * Paired with MAX_VISUAL_HILL_FRAC_PER_SEC so big Might/Traction shoves
 * can't leap a huge slice of the mountain in one frame.
 */
export const VISUAL_FOLLOW_RATE = 3.2;
/** Hard ceiling on camera progress along the hill (fraction of summit / sec). */
export const MAX_VISUAL_HILL_FRAC_PER_SEC = 0.28;
/** How fast the visual ceiling eases up toward active (higher = snappier). */
export const VISUAL_CAP_BLEND_UP = 2.2;
/** How fast the visual ceiling eases down toward passive. */
export const VISUAL_CAP_BLEND_DOWN = 2.8;

/** Clamp real m/s to a ceiling (use smoothed run.visualSpeedCap). */
export function visualMpsCapped(realMps, cap = VISUAL_MPS_ACTIVE_MAX) {
  return Math.min(Math.max(0, realMps), Math.max(0, cap));
}

/** Ease the shared visual ceiling between passive and active max. */
export function blendVisualSpeedCap(currentCap, wantActive, dt) {
  const target = wantActive ? VISUAL_MPS_ACTIVE_MAX : VISUAL_MPS_PASSIVE_MAX;
  let cap = Number.isFinite(currentCap) ? currentCap : VISUAL_MPS_PASSIVE_MAX;
  const rate = target > cap ? VISUAL_CAP_BLEND_UP : VISUAL_CAP_BLEND_DOWN;
  cap += (target - cap) * (1 - Math.exp(-rate * Math.max(0, dt)));
  // Snap when essentially there.
  if (Math.abs(target - cap) < 0.02) return target;
  return cap;
}

export const BASE_MOMENTUM_BOOST = 0.095; // ~+9.5% at full bar
export const BASE_DECAY_DELAY = 1.0; // seconds before drain
export const BASE_MOMENTUM_BUILD = 1 / 30; // per click toward 1.0 (30 clicks)
export const BASE_MOMENTUM_DECAY = 0.4; // per second after delay (~2.5s full→empty)
export const VICTORY_SUMMIT = 5;
export const HECATE_INTERVAL = 10; // seconds between auto orbs
/** How fast current push speed fades after you stop clicking. */
export const ACTIVE_SPEED_DECAY = 1.6;
/** Base seconds between auto-pushes while holding (before Relentless Tempo). */
export const HOLD_CLICK_BASE_INTERVAL = 1.0;
/** Seconds shaved off hold interval per Relentless Tempo level. */
export const HOLD_CLICK_INTERVAL_PER_LEVEL = 0.12;
export const HOLD_CLICK_MIN_INTERVAL = 0.28;
/**
 * m/s added by the k-th rank of a stepped idle upgrade (1-indexed).
 * Pattern: +0.3, +0.3, +0.4, +0.4, +0.5, +0.5, …
 */
export function idleRankIncrement(k) {
  const i = Math.max(1, k | 0);
  return 0.3 + 0.1 * Math.floor((i - 1) / 2);
}

/**
 * Cumulative stepped idle m/s from effective upgrade levels.
 * Lv1=0.3, Lv2=0.6, Lv3=1.0, Lv4=1.4, Lv5=1.9, …
 */
export function idleRankRate(level) {
  const n = Math.max(0, Number(level) || 0);
  const full = Math.floor(n);
  const frac = n - full;
  let total = 0;
  for (let k = 1; k <= full; k++) total += idleRankIncrement(k);
  if (frac > 0) total += idleRankIncrement(full + 1) * frac;
  return total;
}

/** Shades labor: Defiance/sec per Colony seed (× profit mult). */
export const SHADES_LABOR_PER_COLONY = 1.6;
/** Hermes rate at 0 Momentum (escorts the living climb). */
export const HERMES_MOMENTUM_FLOOR = 0.32;

/** Prometheus Fire — active skill tuning (level ≥ 1 unlocks cast). */
export function prometheusSkill(level) {
  const lv = Math.max(0, Number(level) || 0);
  if (lv <= 0) return null;
  return {
    cooldown: Math.max(12, (26 - lv * 2.0) * 1.5),
    duration: 2.8 + lv * 0.35,
    pushMult: 1.4 + lv * 0.12,
  };
}

/** Daedalus Device — active skill tuning. */
export function daedalusSkill(level) {
  const lv = Math.max(0, Number(level) || 0);
  if (lv <= 0) return null;
  return {
    cooldown: Math.max(18, (30 - lv * 1.6) * 1.5),
    /** Multiplier on (Might + Grip) × Traction for the single shove. */
    shoveMult: 0.95 + lv * 0.22,
  };
}

/** Run upgrade definitions (reset on summit). `lane`: active push vs idle. */
export const RUN_UPGRADES = {
  callousedHands: {
    id: 'callousedHands',
    name: 'Calloused Hands',
    stat: 'Might',
    lane: 'active',
    desc: 'Raw push power. More Defiance & Distance seed per click.',
    baseCost: 12,
    costMult: 1.55,
  },
  spikedSandals: {
    id: 'spikedSandals',
    name: 'Spiked Sandals',
    stat: 'Traction',
    lane: 'active',
    desc: 'Converts Might into meters more efficiently.',
    baseCost: 55,
    costMult: 1.58,
  },
  chalkedGrip: {
    id: 'chalkedGrip',
    name: 'Chalked Grip',
    stat: 'Grip Capacity',
    lane: 'active',
    desc: 'Raises Grip so altitude pressure wastes less of each shove as you climb.',
    baseCost: 70,
    costMult: 1.6,
  },
  steadyRhythm: {
    id: 'steadyRhythm',
    name: 'Steady Rhythm',
    stat: 'Momentum',
    lane: 'active',
    desc: 'Raises the max Momentum output boost.',
    baseCost: 80,
    costMult: 1.62,
  },
  bloodTithe: {
    id: 'bloodTithe',
    name: 'Blood Tithe',
    stat: 'Defiance / m',
    lane: 'active',
    desc: 'Raises base Defiance per meter. Multiplied by Grudge Ledger.',
    baseCost: 14,
    costMult: 1.55,
  },
  grudgeLedger: {
    id: 'grudgeLedger',
    name: 'Grudge Ledger',
    stat: 'Profit Multiplier',
    lane: 'active',
    desc: 'Multiplies all Defiance from meters (and Tithe). Stacks with Path of Profit.',
    baseCost: 16,
    costMult: 1.58,
  },
  shades: {
    id: 'shades',
    name: 'Shades',
    stat: 'Colony Throughput',
    lane: 'passive',
    desc: 'Damned souls shoulder the rock — flat base m/s that steps up each rank (0.03 → 0.06 → 0.10 → 0.14 → 0.19…), softened by altitude pressure, plus Defiance labor.',
    baseCost: 20,
    costMult: 1.55,
  },
  hermesSandals: {
    id: 'hermesSandals',
    name: 'Winged Sandals',
    stat: 'Idle Velocity',
    lane: 'passive',
    desc: 'Hermes escorts your climb — same stepped m/s curve as Shades (0.03 → 0.06 → 0.10…), scaled by Momentum and softened by altitude pressure.',
    baseCost: 75,
    costMult: 1.6,
  },
  hecateOrbs: {
    id: 'hecateOrbs',
    name: "Hecate's Orbs",
    stat: 'Idle Bursts',
    lane: 'passive',
    desc: 'Every 10s Hecate lobs an anti-gravity orb at the boulder — a modest passive speed spike.',
    baseCost: 100,
    costMult: 1.65,
  },
  relentlessTempo: {
    id: 'relentlessTempo',
    name: 'Relentless Tempo',
    stat: 'Hold Push Rate',
    lane: 'active',
    desc: 'Speeds up auto-pushes while you hold click / Space. Requires Sustained Strain.',
    baseCost: 65,
    costMult: 1.6,
    /** Skill gate: Sustained Strain (hold-to-push). */
    requiresSkill: { branch: 'sustainedStrain', minLevel: 1 },
  },
  prometheus: {
    id: 'prometheus',
    name: 'Prometheus Fire',
    stat: 'Active Skill',
    lane: 'skills',
    desc: 'Press Q — stolen fire amplifies your pushes for a few seconds. Expensive unlock; long cooldown. Levels: stronger buff, shorter cooldown.',
    baseCost: 5000,
    costMult: 1.75,
  },
  daedalus: {
    id: 'daedalus',
    name: "Daedalus' Device",
    stat: 'Active Skill',
    lane: 'skills',
    desc: 'Press F — modest Distance shove + Defiance equal to 5× your current Def/s. Expensive unlock; long cooldown. Levels: stronger shove, shorter cooldown.',
    baseCost: 7500,
    costMult: 1.75,
  },
};

/**
 * Permanent skill tree — Spite meta.
 * 18 UI nodes / 53 ranks. Branches may list `requires` (all must be met).
 */
export const SKILL_TREE = {
  might: {
    id: 'might',
    name: 'Knuckle Dust',
    stat: 'Might',
    nodes: [
      { name: 'Knuckle Dust', desc: '+12% Might', cost: 6, effect: { might: 0.12 } },
      { name: 'Shoulder Iron', desc: '+18% Might', cost: 16, effect: { might: 0.18 } },
      { name: 'Titan Strain', desc: '+25% Might', cost: 36, effect: { might: 0.25 } },
      { name: 'Boulder Lunge', desc: '+22% Might', cost: 80, effect: { might: 0.22 } },
      { name: 'Atlas Debt', desc: '+30% Might', cost: 170, effect: { might: 0.3 } },
    ],
  },
  traction: {
    id: 'traction',
    name: 'Iron Sole',
    stat: 'Traction',
    nodes: [
      { name: 'Toehold', desc: '+10% Traction', cost: 6, effect: { traction: 0.1 } },
      { name: 'Switchback Step', desc: '+15% Traction', cost: 16, effect: { traction: 0.15 } },
      { name: 'Summit Stride', desc: '+22% Traction', cost: 36, effect: { traction: 0.22 } },
      { name: 'Switchback Mastery', desc: '+18% Traction', cost: 80, effect: { traction: 0.18 } },
      { name: 'No Slip Clause', desc: '+25% Traction', cost: 160, effect: { traction: 0.25 } },
    ],
  },
  grip: {
    id: 'grip',
    name: 'Tight Squeeze',
    stat: 'Grip Capacity',
    nodes: [
      { name: 'Palm Chalk', desc: '+15% Grip', cost: 6, effect: { grip: 0.15 } },
      { name: 'Iron Fingers', desc: '+20% Grip', cost: 18, effect: { grip: 0.2 } },
      { name: 'Unslipping', desc: '+30% Grip', cost: 40, effect: { grip: 0.3 } },
      { name: 'Vice Palm', desc: '+25% Grip', cost: 84, effect: { grip: 0.25 } },
    ],
  },
  momentum: {
    id: 'momentum',
    name: 'Second Wind',
    stat: 'Momentum',
    nodes: [
      { name: 'Warm-Up', desc: '+4% boost cap, +10% build', cost: 8, effect: { momBoost: 0.04, momBuild: 0.1 } },
      { name: 'Second Wind', desc: '+0.3s buffer, +12% build', cost: 28, effect: { momDelay: 0.3, momBuild: 0.12 } },
      { name: 'Perpetual Push', desc: '+6% boost cap, +0.4s buffer', cost: 56, effect: { momBoost: 0.06, momDelay: 0.4 } },
      { name: 'Iron Tempo', desc: '+8% boost cap, +15% build', cost: 150, effect: { momBoost: 0.08, momBuild: 0.15 } },
    ],
  },
  colony: {
    id: 'colony',
    name: 'Whisper Choir',
    stat: 'Colony Throughput',
    nodes: [
      { name: 'Whisper Choir', desc: '+15% Colony', cost: 8, effect: { colony: 0.15 } },
      { name: 'Chain Gang', desc: '+25% Colony', cost: 20, effect: { colony: 0.25 } },
      { name: 'Underworld Union', desc: '+35% Colony', cost: 44, effect: { colony: 0.35 } },
      { name: 'Overtime Shades', desc: '+30% Colony', cost: 90, effect: { colony: 0.3 } },
      { name: 'Damned Dividend', desc: '+40% Colony', cost: 180, effect: { colony: 0.4 } },
    ],
  },
  profit: {
    id: 'profit',
    name: 'Cursed Interest',
    stat: 'Profit Multiplier',
    nodes: [
      { name: 'Petty Ledger', desc: '+18% Profit', cost: 6, effect: { profit: 0.18 } },
      { name: 'Score Settling', desc: '+27% Profit', cost: 16, effect: { profit: 0.27 } },
      { name: 'Eternal Audit', desc: '+42% Profit', cost: 36, effect: { profit: 0.42 } },
      { name: 'Compound Spite', desc: '+33% Profit', cost: 84, effect: { profit: 0.33 } },
      { name: 'Blood Invoice', desc: '+48% Profit', cost: 170, effect: { profit: 0.48 } },
    ],
  },
  hecateInterval: {
    id: 'hecateInterval',
    name: 'Bewitching Tick',
    stat: "Hecate's Orbs",
    nodes: [
      {
        name: 'Quicker Orbs',
        desc: 'Hecate orbs arrive 2.5s sooner',
        cost: 40,
        effect: { hecateIntervalMod: -2.5 },
      },
      {
        name: 'Moon Pace',
        desc: 'Orbs 2s sooner',
        cost: 50,
        effect: { hecateIntervalMod: -2 },
      },
    ],
  },
  sureHold: {
    id: 'sureHold',
    name: 'Sure Hold',
    stat: 'Pressure Pierce',
    requires: [{ branch: 'grip', minLevel: 4 }],
    nodes: [
      {
        name: 'Sure Hold',
        desc: 'Cut altitude pressure — keep 12% more of each high shove',
        cost: 176,
        effect: { gripPierce: 0.12 },
      },
    ],
  },
  altitudeResist: {
    id: 'altitudeResist',
    name: 'Thin Air',
    stat: 'Altitude Pressure',
    requires: [{ branch: 'grip', minLevel: 2 }],
    nodes: [
      {
        name: 'Thin Air',
        desc: '−15% altitude pressure on clicks',
        cost: 60,
        effect: { pressureResist: 0.15 },
      },
      {
        name: 'Lighter Burden',
        desc: '−20% altitude pressure',
        cost: 110,
        effect: { pressureResist: 0.2 },
      },
      {
        name: 'Defy the Grade',
        desc: '−25% altitude pressure',
        cost: 200,
        effect: { pressureResist: 0.25 },
      },
    ],
  },
  sustainedStrain: {
    id: 'sustainedStrain',
    name: 'Sustained Strain',
    stat: 'Hold-to-Push',
    requires: [{ branch: 'momentum', minLevel: 2 }],
    nodes: [
      {
        name: 'Sustained Strain',
        desc: 'Unlock hold-to-push: hold click or Space to auto-push.',
        cost: 20,
        effect: { holdClick: true },
      },
    ],
  },
  echo: {
    id: 'echo',
    name: 'Residual Momentum',
    stat: 'Residual Momentum',
    requires: [{ branch: 'sustainedStrain', minLevel: 1 }],
    nodes: [
      {
        name: 'Echo Step',
        desc: 'Once built, Momentum no longer drains below 20%',
        cost: 50,
        effect: { momFloor: 0.2 },
      },
      {
        name: 'Held Beat',
        desc: 'Residual Momentum floor 35%',
        cost: 110,
        effect: { momFloor: 0.35 },
      },
      {
        name: 'Lingering Drive',
        desc: 'Residual Momentum floor 50%',
        cost: 200,
        effect: { momFloor: 0.5 },
      },
      {
        name: 'Unbroken Pace',
        desc: 'Residual Momentum floor 65%',
        cost: 350,
        effect: { momFloor: 0.65 },
      },
      {
        name: 'Eternal Cadence',
        desc: 'Residual Momentum floor 80%',
        cost: 550,
        effect: { momFloor: 0.8 },
      },
    ],
  },
  hermes: {
    id: 'hermes',
    name: 'Gale Step',
    stat: 'Hermes',
    requires: [{ branch: 'colony', minLevel: 1 }],
    nodes: [
      {
        name: 'Sandal Wind',
        desc: '+30% Hermes idle speed',
        cost: 40,
        effect: { hermesPower: 0.3 },
      },
      {
        name: 'Gale Step',
        desc: '+40% Hermes idle speed',
        cost: 80,
        effect: { hermesPower: 0.4 },
      },
    ],
  },
  shades: {
    id: 'shades',
    name: 'Damned Union',
    stat: 'Shades',
    requires: [{ branch: 'colony', minLevel: 1 }],
    nodes: [
      {
        name: 'Louder Choir',
        desc: '+35% Shade idle Distance & Defiance',
        cost: 45,
        effect: { shadesPower: 0.35 },
      },
      {
        name: 'Chain Hymn',
        desc: '+45% Shade idle Distance & Defiance',
        cost: 85,
        effect: { shadesPower: 0.45 },
      },
    ],
  },
  runStipend: {
    id: 'runStipend',
    name: 'Pocket Change',
    stat: 'Starting Defiance',
    requires: [{ branch: 'profit', minLevel: 1 }],
    nodes: [
      {
        name: 'Pocket Grudge',
        desc: 'Start each run with +40 Defiance (does not count toward Spite)',
        cost: 35,
        effect: { runStipend: 40 },
      },
      {
        name: 'Deeper Pockets',
        desc: 'Stipend +50 Defiance (90 total)',
        cost: 75,
        effect: { runStipend: 50 },
      },
    ],
  },
  hecatePower: {
    id: 'hecatePower',
    name: 'Celestial Bounty',
    stat: "Hecate's Orbs",
    requires: [{ branch: 'hecateInterval', minLevel: 1 }],
    nodes: [
      {
        name: 'Heavier Orbs',
        desc: '+45% Hecate orb Distance & Defiance',
        cost: 55,
        effect: { hecatePower: 0.45 },
      },
      {
        name: 'Moon Weight',
        desc: '+30% orb power',
        cost: 45,
        effect: { hecatePower: 0.3 },
      },
    ],
  },
  sparkTheft: {
    id: 'sparkTheft',
    name: 'Stolen Fire',
    stat: 'Prometheus Fire',
    requires: [{ branch: 'might', minLevel: 2 }],
    nodes: [
      {
        name: 'Embers',
        desc: 'Prometheus Fire +15% power, −2s cooldown',
        cost: 45,
        effect: { prometheusPower: 0.15, prometheusCdMod: -2 },
      },
    ],
  },
  cogTheft: {
    id: 'cogTheft',
    name: 'Flywheel',
    stat: "Daedalus' Device",
    requires: [{ branch: 'might', minLevel: 2 }],
    nodes: [
      {
        name: 'Flywheel',
        desc: "Daedalus' Device +25% shove, −2s cooldown",
        cost: 55,
        effect: { daedalusPower: 0.25, daedalusCdMod: -2 },
      },
    ],
  },
  stolenRite: {
    id: 'stolenRite',
    name: 'Stolen Rite',
    stat: 'Active Skills',
    requires: [
      { branch: 'sparkTheft', minLevel: 1 },
      { branch: 'cogTheft', minLevel: 1 },
    ],
    nodes: [
      {
        name: 'Stolen Rite',
        desc: 'Auto-cast Fire & Device whenever off cooldown (true idle)',
        cost: 150,
        effect: { stolenRite: true },
      },
    ],
  },
};

/** True when every `requires` entry on a branch is satisfied. */
export function skillPrereqsMet(skills, branchId) {
  const branch = SKILL_TREE[branchId];
  if (!branch?.requires?.length) return true;
  return branch.requires.every(
    (r) => (skills[r.branch] || 0) >= (r.minLevel || 1)
  );
}

/** Human-readable prereq blurb for UI. */
export function skillPrereqBlurb(branchId) {
  const branch = SKILL_TREE[branchId];
  if (!branch?.requires?.length) return '';
  return branch.requires
    .map((r) => {
      const parent = SKILL_TREE[r.branch];
      const name = parent?.name || r.branch;
      return `${name} Lv ${r.minLevel}`;
    })
    .join(' + ');
}

/**
 * Map legacy skill saves into the 18-node tree.
 * Pass the raw saved skills object (not merged with defaults).
 */
export function migrateSkills(rawSkills = {}) {
  const s = rawSkills || {};
  const out = Object.fromEntries(Object.keys(SKILL_TREE).map((k) => [k, 0]));

  const newSchema =
    'sustainedStrain' in s ||
    'sureHold' in s ||
    'altitudeResist' in s ||
    'hecateInterval' in s ||
    'sparkTheft' in s ||
    'runStipend' in s ||
    'hermes' in s;

  if (newSchema) {
    for (const id of Object.keys(SKILL_TREE)) {
      out[id] = Math.min(SKILL_TREE[id].nodes.length, Math.max(0, s[id] | 0));
    }
    return out;
  }

  out.might = Math.min(5, s.might | 0);
  out.traction = Math.min(5, s.traction | 0);

  const oldGrip = s.grip | 0;
  out.grip = Math.min(4, oldGrip);
  out.sureHold = oldGrip >= 5 ? 1 : 0;

  const oldMom = s.momentum | 0;
  if (oldMom <= 0) {
    out.momentum = 0;
    out.sustainedStrain = 0;
  } else if (oldMom === 1) {
    out.momentum = 1;
    out.sustainedStrain = 0;
  } else {
    out.sustainedStrain = 1;
    out.momentum = Math.min(4, oldMom - 1);
  }

  out.echo = Math.min(5, s.echo | 0);
  if (out.echo > 0) out.sustainedStrain = 1;

  out.colony = Math.min(5, s.colony | 0);
  out.profit = Math.min(5, s.profit | 0);

  const oldMtn = s.mountain | 0;
  out.runStipend = oldMtn >= 2 ? 2 : oldMtn >= 1 ? 1 : 0;
  out.altitudeResist = oldMtn >= 5 ? 3 : oldMtn >= 4 ? 2 : oldMtn >= 3 ? 1 : 0;

  const oldMsg = s.messengers | 0;
  if (oldMsg >= 3) {
    out.hecateInterval = 2;
    out.hecatePower = 2;
  } else if (oldMsg === 2) {
    out.hecateInterval = 1;
    out.hecatePower = 1;
  } else if (oldMsg === 1) {
    out.hecateInterval = 1;
  }

  const oldAtt = s.attendants | 0;
  if (oldAtt >= 4) {
    out.hermes = 2;
    out.shades = 2;
  } else if (oldAtt === 3) {
    out.hermes = 2;
    out.shades = 1;
  } else if (oldAtt === 2) {
    out.hermes = 1;
    out.shades = 1;
  } else if (oldAtt === 1) {
    out.hermes = 1;
  }

  const oldTheft = s.theft | 0;
  if (oldTheft >= 3) {
    out.sparkTheft = 1;
    out.cogTheft = 1;
    out.stolenRite = 1;
  } else if (oldTheft === 2) {
    out.sparkTheft = 1;
    out.cogTheft = 1;
  } else if (oldTheft === 1) {
    out.sparkTheft = 1;
  }

  return out;
}

/** Hades corporate-review lines (rotating). */
export const HADES_LINES = [
  `"Your summit arrival was 0.3σ below quarterly forecast. Recalibrate your suffering and try again."`,
  `"Noted: you pushed a rock uphill. Congrats on meeting the absolute bare minimum of eternal damnation."`,
  `"I've scheduled a follow-up kick. Please hold all defiance until after the performance improvement plan."`,
  `"Feedback: enthusiasm — high. Results — circular. Same boulder, same mountain, same you."`,
  `"We're cascading alignment on your punishment KPIs. Spoiler: you are the KPI."`,
];

export function upgradeCost(def, level) {
  const lv = Math.max(0, level | 0);
  let cost = def.baseCost * Math.pow(def.costMult, lv);
  // Milestone spikes (Lv 5, 10, …) stay on the curve afterward so the next
  // buy never undercuts the milestone price.
  const spikes = Math.floor((lv + 1) / MILESTONE_EVERY);
  if (spikes > 0) cost *= Math.pow(MILESTONE_COST_MULT, spikes);
  return Math.floor(cost);
}

/** True when buying at `currentLevel` would reach a milestone rank (5, 10, …). */
export function isMilestonePurchase(currentLevel) {
  return (Math.max(0, currentLevel | 0) + 1) % MILESTONE_EVERY === 0;
}

/** Milestone ranks every N purchases. */
export const MILESTONE_EVERY = 5;
/** Milestone purchase effect vs a normal level. */
export const MILESTONE_EFFECT = 1.5;
/** Milestone purchases cost this × the normal curve price. */
export const MILESTONE_COST_MULT = 2.4;

/**
 * Convert purchased upgrade levels into effective levels
 * (milestones count as MILESTONE_EFFECT each).
 */
export function effectiveUpgradeLevels(level) {
  const n = Math.max(0, level | 0);
  const milestones = Math.floor(n / MILESTONE_EVERY);
  const rem = n % MILESTONE_EVERY;
  return milestones * (MILESTONE_EVERY - 1 + MILESTONE_EFFECT) + rem;
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
    momFloor: 0,
    holdClick: false,
    runStipend: 0,
    hecateIntervalMod: 0,
    hecatePower: 0,
    hermesPower: 0,
    shadesPower: 0,
    prometheusPower: 0,
    prometheusCdMod: 0,
    daedalusPower: 0,
    daedalusCdMod: 0,
    stolenRite: false,
    gripPierce: 0,
    pressureResist: 0,
  };

  for (const [branchId, branch] of Object.entries(SKILL_TREE)) {
    const owned = skillLevels[branchId] || 0;
    for (let i = 0; i < owned; i++) {
      const effect = branch.nodes[i]?.effect;
      if (!effect) continue;
      for (const [k, v] of Object.entries(effect)) {
        if (k === 'holdClick' || k === 'stolenRite') out[k] = out[k] || !!v;
        else if (k === 'momFloor') out[k] = Math.max(out[k] || 0, v);
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

  const hands = effectiveUpgradeLevels(u.callousedHands || 0);
  const sandals = effectiveUpgradeLevels(u.spikedSandals || 0);
  const chalk = effectiveUpgradeLevels(u.chalkedGrip || 0);
  const rhythm = effectiveUpgradeLevels(u.steadyRhythm || 0);
  const tithe = effectiveUpgradeLevels(u.bloodTithe || 0);
  const ledger = effectiveUpgradeLevels(u.grudgeLedger || 0);
  const shadesLv = effectiveUpgradeLevels(u.shades || 0);
  const hermesEff = effectiveUpgradeLevels(u.hermesSandals || 0);
  const hecateEff = effectiveUpgradeLevels(u.hecateOrbs || 0);
  const tempo = effectiveUpgradeLevels(u.relentlessTempo || 0);
  const prometheusEff = effectiveUpgradeLevels(u.prometheus || 0);
  const daedalusEff = effectiveUpgradeLevels(u.daedalus || 0);

  const might = (1 + hands * 0.6175) * (1 + s.might) * ngPlus;
  const traction = (1 + sandals * 0.209) * (1 + s.traction);
  const gripCapacity = (4 + chalk * 5.225) * (1 + s.grip);
  const colony = idleRankRate(shadesLv) * (1 + s.colony) * ngPlus;
  const defianceFlat = DEFIANCE_BASE_PER_METER + tithe * BLOOD_TITHE_PER_LEVEL;
  const profitMult =
    (1 + ledger * GRUDGE_LEDGER_PER_LEVEL) * (1 + s.profit);
  /** Effective Defiance per meter (flat × Ledger × Path of Profit). */
  const profit = defianceFlat * profitMult;
  const hermesLevel = hermesEff;
  const hecateLevel = hecateEff;
  const prometheusLevel = prometheusEff;
  const daedalusLevel = daedalusEff;
  const holdClick = !!s.holdClick;
  const holdInterval = holdClick
    ? Math.max(
        HOLD_CLICK_MIN_INTERVAL,
        HOLD_CLICK_BASE_INTERVAL - tempo * HOLD_CLICK_INTERVAL_PER_LEVEL
      )
    : null;

  const momentumBoostCap = BASE_MOMENTUM_BOOST + rhythm * 0.05225 + s.momBoost;
  const momentumBuild = BASE_MOMENTUM_BUILD * (1 + s.momBuild);
  const momentumDecayDelay = BASE_DECAY_DELAY + s.momDelay;
  const momentumFloor = Math.max(0, Math.min(0.8, s.momFloor || 0));

  return {
    might,
    traction,
    gripCapacity,
    colony,
    defianceFlat,
    profitMult,
    profit,
    hermesLevel,
    hecateLevel,
    prometheusLevel,
    daedalusLevel,
    holdClick,
    holdInterval,
    momentumBoostCap,
    momentumBuild,
    momentumDecayDelay,
    momentumFloor,
    ngPlus,
    runStipend: s.runStipend || 0,
    hecateIntervalMod: s.hecateIntervalMod || 0,
    hecatePower: s.hecatePower || 0,
    hermesPower: s.hermesPower || 0,
    shadesPower: s.shadesPower || 0,
    prometheusPower: s.prometheusPower || 0,
    prometheusCdMod: s.prometheusCdMod || 0,
    daedalusPower: s.daedalusPower || 0,
    daedalusCdMod: s.daedalusCdMod || 0,
    stolenRite: !!s.stolenRite,
    gripPierce: s.gripPierce || 0,
    pressureResist: s.pressureResist || 0,
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
 * Shared altitude load for HUD + softcaps.
 * 1.0 = peak of the first summit before compression.
 * Extreme mountains are log-compressed so late Grip still raises the ceiling
 * instead of softcapping movement to near-zero.
 * `pressureResist` (0–0.75) shrinks the mountain’s effective weight.
 */
export function mountainPressureLoad(
  distance,
  summitDistance = SUMMIT_DISTANCE,
  pressureResist = 0
) {
  const altitude = Math.max(0, distance) / Math.max(1, summitDistance);
  const mountainWeight = Math.max(1, summitDistance / SUMMIT_DISTANCES[0]);
  const resist = Math.max(0, Math.min(0.75, pressureResist || 0));
  const raw = Math.pow(altitude, 1.25) * mountainWeight * (1 - resist);
  return compressPressureLoad(raw);
}

/**
 * Keep early-game pressure nearly linear; bend hard past ~200% so
 * mega-summits don't produce five-digit softcap loads.
 */
export function compressPressureLoad(rawLoad) {
  const r = Math.max(0, rawLoad);
  const bend = 2; // stay ~linear through early/mid first-summit peak
  if (r <= bend) return r;
  // log2 growth beyond the bend — raw 10→~5.2, raw 100→~8.6, raw 1000→~12
  return bend + Math.log2(1 + (r - bend));
}

/** Softcap strength vs compressed load (lower = milder movement tax). */
export const ALTITUDE_PRESSURE_SOFTCAP = 0.28;

/**
 * Grip soft ceiling for *active* clicks.
 * Altitude pressure scales with mountain length, then compresses.
 * `pierce` keeps a fraction of each shove; `pressureResist` lowers the load.
 */
export function gripEfficiency(
  rawPush,
  gripCapacity,
  distance,
  summitDistance = SUMMIT_DISTANCE,
  pierce = 0,
  pressureResist = 0
) {
  const load = mountainPressureLoad(distance, summitDistance, pressureResist);
  // Softer slope than before so Lv+ Grip meaningfully raises the m/s ceiling.
  // Asymptotic meters/click ≈ grip / slopeLoad once raw shove is large.
  const slopeLoad = 0.45 + load * 16 * ALTITUDE_PRESSURE_SOFTCAP;
  const pressure = Math.max(0, rawPush) * slopeLoad;
  const grip = Math.max(0.5, gripCapacity);
  const soft = grip / (grip + pressure);
  const p = Math.max(0, Math.min(0.5, pierce || 0));
  return p + soft * (1 - p);
}

/**
 * HUD readout only — display scale is 10% of true load×100
 * (e.g. internal 9.35 → 93.5%, not 935%). Does not affect combat math.
 */
export function altitudePressurePct(state, stats) {
  const summitDist = summitDistanceFor(state.meta.summits);
  const load = mountainPressureLoad(
    state.run.distance,
    summitDist,
    stats?.pressureResist || 0
  );
  return Math.max(0, load) * 10;
}

/** Effective seconds between Hecate orbs (Spite can shorten). */
export function hecateIntervalFor(stats) {
  return Math.max(3.5, HECATE_INTERVAL + (stats?.hecateIntervalMod || 0));
}

/**
 * Idle softcap — Shades, Hermes, and burst idles (Hecate orbs).
 * Milder than active grip tax so AFK helps, but still fades on tall mountains.
 */
export function idleEfficiency(
  distance,
  summitDistance = SUMMIT_DISTANCE,
  pressureResist = 0
) {
  const load = mountainPressureLoad(distance, summitDistance, pressureResist);
  // Gentler than the old 1.1× curve — compressed load already bent the spike.
  return 1 / (1 + load * 0.75 * ALTITUDE_PRESSURE_SOFTCAP);
}

/** Raw + effective passive rates for sim + UI. */
export function getPassiveRates(state, stats) {
  const hermesLevel = Math.max(0, stats.hermesLevel || 0);
  // Same stepped curve as Shades; Momentum scales how much Hermes delivers.
  const hermesBase =
    hermesLevel > 0
      ? idleRankRate(hermesLevel) * (1 + (stats.hermesPower || 0))
      : 0;
  const shadesBase =
    Math.max(0, stats.colony) * (1 + (stats.shadesPower || 0));

  const mom = clamp01(state.run.momentum || 0);
  const hermesMomMult = HERMES_MOMENTUM_FLOOR + (1 - HERMES_MOMENTUM_FLOOR) * mom;

  const shadesRaw = shadesBase;
  const hermesRaw = hermesBase * hermesMomMult;
  const shadeLaborPerSec =
    Math.max(0, stats.colony) *
    SHADES_LABOR_PER_COLONY *
    stats.profitMult *
    (1 + (stats.shadesPower || 0));

  const summitDist = summitDistanceFor(state.meta.summits);
  const efficiency = idleEfficiency(
    state.run.distance,
    summitDist,
    stats.pressureResist || 0
  );
  const pace = summitPaceMult(summitDist);

  return {
    shadesRaw,
    hermesRaw,
    efficiency,
    paceMult: pace,
    shadesEffective: shadesRaw * efficiency * pace,
    hermesEffective: hermesRaw * efficiency * pace,
    totalEffective: (shadesRaw + hermesRaw) * efficiency * pace,
    shadesAfkMult: efficiency,
    hermesMomMult,
    shadeLaborPerSec,
  };
}

/**
 * Live Defiance income estimate (HUD): meters × Def/m + Shade labor.
 * Active push speed covers clicking/hold; passives cover AFK.
 */
export function getDefiancePerSecond(state, stats) {
  const rates = getPassiveRates(state, stats);
  const mps = Math.max(0, state.run.activePushSpeed || 0) + rates.totalEffective;
  const fromMeters = mps * Math.max(0, stats.profit || 0);
  const fromLabor = Math.max(0, rates.shadeLaborPerSec || 0);
  return fromMeters + fromLabor;
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
  const efficiency = gripEfficiency(
    rawDistance,
    stats.gripCapacity,
    state.run.distance,
    summitDist,
    stats.gripPierce || 0,
    stats.pressureResist || 0
  );
  let distance = Math.max(0, rawDistance * efficiency * DISTANCE_GAIN_MULT);
  distance *= summitPaceMult(summitDist);
  let rawDefiance = distance * stats.profit + seed * 0.1425 * stats.profitMult;

  const fire = prometheusSkill(stats.prometheusLevel || 0);
  if (fire && (state.run.prometheusBuffTimer || 0) > 0) {
    const fireMult = fire.pushMult * (1 + (stats.prometheusPower || 0));
    distance *= fireMult;
    rawDefiance *= fireMult;
  }

  // Every active push grants at least 1 Defiance (fractional profit still banks).
  const defiance = Math.max(1, rawDefiance);

  return { distance, defiance, momMult, efficiency, seed };
}

/**
 * Daedalus shove — modest Distance yank; Defiance = 5× current Def/s.
 */
export function resolveDaedalusShove(state, stats) {
  const skill = daedalusSkill(stats.daedalusLevel || 0);
  if (!skill) return { distance: 0, defiance: 0 };

  const lv = Math.max(1, stats.daedalusLevel || 1);
  const summitDist = summitDistanceFor(state.meta.summits);
  const craft = stats.might * 0.4 + stats.gripCapacity * 0.5;
  const raw =
    craft * stats.traction * skill.shoveMult * (1 + (stats.daedalusPower || 0));
  const soft = gripEfficiency(
    raw,
    stats.gripCapacity,
    state.run.distance,
    summitDist,
    stats.gripPierce || 0,
    stats.pressureResist || 0
  );
  // Light pierce — helps mid-slope without ignoring the mountain.
  const pierce = Math.min(0.22, 0.1 + lv * 0.014);
  let distance = Math.max(0, raw * (pierce + soft * (1 - pierce)) * DISTANCE_GAIN_MULT);
  distance *= summitPaceMult(summitDist);
  // Tighter cap — Device is a nudge, not a leap.
  const cap = Math.max(10 + lv * 2.2, summitDist * (0.001 + lv * 0.00022));
  distance = Math.min(distance, cap);

  const defiance = Math.max(1, getDefiancePerSecond(state, stats) * 5);
  return { distance, defiance };
}

/**
 * Passive tick: Shades (flat Distance + labor) + Hermes (Momentum escort).
 */
export function resolvePassive(state, stats, dt) {
  if (dt <= 0) return { distance: 0, defiance: 0 };

  const rates = getPassiveRates(state, stats);
  if (rates.shadesRaw <= 0 && rates.hermesRaw <= 0) {
    return { distance: 0, defiance: 0 };
  }

  // totalEffective already includes summitPaceMult (HUD + sim stay aligned).
  const distance = Math.max(0, rates.totalEffective * dt);
  // Meters still pay Defiance; Shades also bank flat labor Defiance.
  const defiance = distance * stats.profit + rates.shadeLaborPerSec * dt;
  return {
    distance,
    defiance,
    shadesRate: rates.shadesEffective,
    hermesRate: rates.hermesEffective,
    efficiency: rates.efficiency,
  };
}

/**
 * Boulder crack minigame — timed weak spot on the front face.
 * Interval / window are generous; payouts are helpful but capped.
 */
export const CRACK_INTERVAL_MIN = 18;
export const CRACK_INTERVAL_MAX = 25;
export const CRACK_WINDOW = 3.0;
/** Hit radius as a fraction of boulder draw radius. */
export const CRACK_HIT_FRAC = 0.16;

export function nextCrackInterval() {
  return CRACK_INTERVAL_MIN + Math.random() * (CRACK_INTERVAL_MAX - CRACK_INTERVAL_MIN);
}

/** Normalized offset on the boulder disk (front face). */
export function randomCrackOffset() {
  for (let i = 0; i < 16; i++) {
    const nx = (Math.random() * 2 - 1) * 0.7;
    const ny = (Math.random() * 2 - 1) * 0.7;
    if (nx * nx + ny * ny <= 0.7 * 0.7) return { nx, ny };
  }
  return { nx: 0.25, ny: -0.2 };
}

/**
 * Crack-hit payout: scaled from a normal click, then hard-capped
 * so it stays a bonus — not a shop printer.
 */
export function resolveCrackHit(state, stats) {
  const click = resolveClick(state, stats);
  const summitDist = summitDistanceFor(state.meta.summits);

  let distance = click.distance * (5 + Math.random() * 4); // ~5–9×
  const distCap = Math.max(14, summitDist * 0.0045);
  distance = Math.min(distance, distCap);

  let defiance = Math.max(1, click.defiance) * (10 + Math.random() * 8); // ~10–18×
  const defCap = Math.max(28, 18 + stats.might * 6 + stats.profit * 14);
  defiance = Math.min(defiance, defCap);

  return { distance, defiance };
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
  const power = 1 + (stats.hecatePower || 0);
  const raw = (1.5 + level * 1.15 + current * 0.04) * stats.traction * power;
  const efficiency = idleEfficiency(
    state.run.distance,
    summitDist,
    stats.pressureResist || 0
  );
  const distance = Math.max(
    0,
    raw * efficiency * DISTANCE_GAIN_MULT * summitPaceMult(summitDist)
  );
  const defiance = distance * stats.profit;
  return { distance, defiance };
}

/**
 * Spite payout from a finished run's total Defiance earned.
 * First summit targets ~20; later clears pay a bit more base + mild Defiance scaling.
 */
export function spiteFromRun(runDefianceEarned, summitCount) {
  const d = Math.max(0, runDefianceEarned);
  const n = Math.max(1, Math.floor(summitCount || 1));
  // Clear #1 → 16, #2 → 20, #3 → 24, …
  const fromSummit = 12 + n * 4;
  const fromDefiance = Math.floor(Math.sqrt(d) * 0.05 + d / 7000);
  return fromSummit + fromDefiance;
}

export function formatNumber(n, digits = 1) {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  const d = Math.max(0, digits | 0);
  // Integer goals / currency: no forced .0 on K/M/B.
  if (d === 0) {
    if (abs >= 1e9) return Math.round(n / 1e9) + 'B';
    if (abs >= 1e6) return Math.round(n / 1e6) + 'M';
    if (abs >= 1e4) return Math.round(n / 1e3) + 'K';
    return Math.round(n).toLocaleString();
  }
  if (abs >= 1e9) return (n / 1e9).toFixed(d) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(d) + 'M';
  if (abs >= 1e4) return (n / 1e3).toFixed(d) + 'K';
  // Keep requested decimals while climbing (don't strip at 10 / 100).
  if (d >= 2) return n.toFixed(d);
  if (abs >= 100) return Math.floor(n).toLocaleString();
  if (abs >= 10) return n.toFixed(1);
  return n.toFixed(Math.min(d, 2));
}

export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
