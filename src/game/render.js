/**
 * render.js — Tracking camera + crisp pixel-art climb scene.
 *
 * Hill is a 256×256 repeatable strip (hill-tile.png). Rock fills under the
 * path. Measured seam: right-neighbor at (+256, +130) (path descends L→R).
 * Climbing uphill is the opposite way (left + up). Hill is drawn at 2× the
 * boulder’s source-pixel scale so the denser rock art reads chunkier.
 *
 * CRITICAL: imageSmoothingEnabled = false so pixel art stays sharp.
 */

import {
  summitDistanceFor,
  SUMMIT_DISTANCES,
  CRACK_HIT_FRAC,
  displayMeters,
} from './formulas.js';

const SISYPHUS_SRC = '/sisyphus.png';
/** 12-frame push-walk cycle (0.15s per frame in export). */
const SISY_WALK_SRCS = [
  '/sisyphuswalking/12frame/frame_00_delay-0.15s.png',
  '/sisyphuswalking/12frame/frame_01_delay-0.15s.png',
  '/sisyphuswalking/12frame/frame_02_delay-0.15s.png',
  '/sisyphuswalking/12frame/frame_03_delay-0.15s.png',
  '/sisyphuswalking/12frame/frame_04_delay-0.15s.png',
  '/sisyphuswalking/12frame/frame_05_delay-0.15s.png',
  '/sisyphuswalking/12frame/frame_06_delay-0.15s.png',
  '/sisyphuswalking/12frame/frame_07_delay-0.15s.png',
  '/sisyphuswalking/12frame/frame_08_delay-0.15s.png',
  '/sisyphuswalking/12frame/frame_09_delay-0.15s.png',
  '/sisyphuswalking/12frame/frame_10_delay-0.15s.png',
  '/sisyphuswalking/12frame/frame_11_delay-0.15s.png',
];
const SISY_WALK_FRAME_DT = 0.42;
/**
 * Camera m/s that maps to 1× walk-cycle timing.
 * Higher = fewer steps per meter of hill (feet stop outrunning the ground).
 */
const SISY_WALK_REF_MPS = 4.2;
/** Fastest walk multiplier — keep frames readable on big shoves. */
const SISY_WALK_PACE_MAX = 6;
/** Fraction of measured pace taken instantly when climb starts (1 = full snap). */
const FIRST_SHOVE_PACE_CATCHUP = 0.9;
const BOULDER_SRC = '/boulder.png';
/** Native size of roll frames / boulder PNG (pixels). */
const BOULDER_NATIVE = 128;
/** Hill scale still references the old 256-feel so tiles don’t jump. */
const HILL_SCALE_REF = 256;
/** 16-frame roll (bg removed) with baked lighting. */
const BOULDER_ROLL_SRCS = [
  // frame_00 / frame_13 skipped — bad loop seam / hitch
  '/boulderoll/bgremoved/frame_01.png',
  '/boulderoll/bgremoved/frame_02.png',
  '/boulderoll/bgremoved/frame_03.png',
  '/boulderoll/bgremoved/frame_04.png',
  '/boulderoll/bgremoved/frame_05.png',
  '/boulderoll/bgremoved/frame_06.png',
  '/boulderoll/bgremoved/frame_07.png',
  '/boulderoll/bgremoved/frame_08.png',
  '/boulderoll/bgremoved/frame_09.png',
  '/boulderoll/bgremoved/frame_10.png',
  '/boulderoll/bgremoved/frame_11.png',
  '/boulderoll/bgremoved/frame_12.png',
  '/boulderoll/bgremoved/frame_14.png',
  '/boulderoll/bgremoved/frame_15.png',
];
const BACKGROUND_SRC = '/background.png?v=4';
const HILL_TILE_SRC = '/hill-tile.png';
const HERMES_SANDAL_SRC = '/hermes-sandal.png';
/** Soft cap so late-game Hermes doesn’t flood the scene. */
const HERMES_SANDAL_MAX = 14;

const ART_W = 1536;
const ART_H = 864;

/**
 * Actor sizes as a fraction of canvas height.
 * Boulder is sized independently; Sisyphus stays at 75% of the *previous*
 * boulder size so enlarging the rock does not enlarge him.
 */
const BOULDER_HEIGHT_RATIO = 0.54315; // 0.6035 × 0.9 (zoom out ~10%)
const BOULDER_MIN = 272;
const SISY_HEIGHT_RATIO = 0.34884; // 0.3876 × 0.9
const SISY_MIN = 175;

/** Screen center = where Sisyphus’s palms meet the boulder. */
const CONTACT_X_RATIO = 0.5;
const CONTACT_Y_RATIO = 0.5;
/** Nudge the whole climb scene down so the underfill doesn’t peek. */
const SCENE_Y_NUDGE = 70;
/** Extra actor-only offset (hill stays put) — right + down on the tile face. */
const ACTOR_OFFSET_X = 90;
const ACTOR_OFFSET_Y = 70;
/**
 * Plant Sisyphus on the path: screen down + left (not pure vertical).
 * Walk frames sit higher in the box than the old static pose.
 */
const SISY_STAND_NUDGE = 8;

/**
 * Painted boulder is smaller than its PNG box (transparent padding).
 * Use this fraction of draw-size for seating / hand contact.
 */
const BOULDER_SOLID_FRAC = 0.42;

/**
 * How deep palms dig into the boulder (1 = just kissing the solid radius,
 * lower = more overlap). ~0.9 = light overlap.
 */
const CONTACT_DEPTH = 0.9;

/** Native tile + seam (pixels). Right-neighbor offset from edge sampling. */
const TILE_NATIVE = 256;
const TILE_STEP_X = 256;
const TILE_STEP_Y = 130;
/** Walking-surface Y at left edge (tan path top ≈ 3px). */
const PATH_Y_LEFT = 4;
/** Hill art is denser; multiply so each source px reads chunkier on screen. */
const HILL_SCALE_MULT = 2;
/** Lead-in tiles past the start (downslope) so actors aren’t hanging off the strip. */
const EXTRA_BASE_TILES = 2;
/** Extra tiles past the viewport edge so the strip appears before you arrive. */
const HILL_LOOKAHEAD_TILES = 3;

/** Distant peaks scroll slower than the climb path (horizontal tile drift). */
const BG_PARALLAX_X = 0.12;

const UNDERFILL = '#241830';

/**
 * Visual path length matches meter length vs first summit, so one shove scrolls
 * the same pixels on every run (1M m = 1000× the first mountain’s strip).
 */
function hillPathScaleFor(summitDist) {
  return Math.max(1, summitDist / SUMMIT_DISTANCES[0]);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const sisyphus = loadImageKeyed(SISYPHUS_SRC, 18);
  const sisyWalk = SISY_WALK_SRCS.map((src) => loadImage(src));
  const boulder = loadImageKeyed(BOULDER_SRC, 12);
  const boulderRoll = BOULDER_ROLL_SRCS.map((src) => loadImage(src));
  const background = loadImage(BACKGROUND_SRC);
  // Tile has rock on one corner, so force-key near-black instead of corner detect.
  const hillTile = loadImageKeyed(HILL_TILE_SRC, 14, { forceKey: true });
  const hermesSandal = loadImageKeyed(HERMES_SANDAL_SRC, 16, { forceKey: true });

  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  let boulderDraw = BOULDER_MIN;
  let sisyDraw = SISY_MIN;

  /** Smoothed camera offset (world → screen). */
  let camSmoothX = 0;
  let camSmoothY = 0;
  let camInitialized = false;
  let lastPathScale = -1;

  /** Push-walk cycle — plays while shoving or while visualDistance is catching up. */
  let walkFrame = 0;
  let walkCooldown = 0;
  let walkWasActive = false;
  /** Smoothed pace — avoids a one-click sprint from a jumpy m/s sample. */
  let walkPaceSmooth = 1;
  /** Boulder roll phase in loops (same capped pace as walk). */
  let boulderRollPhase = 0;
  /** DEV: null = animate; otherwise freeze on this frame index. */
  let boulderFrameDebug = null;
  /** DEV: null = animate walk; otherwise freeze on this walk frame. */
  let walkFrameDebug = null;
  /** DEV: which anim the stepper drives — boulder | sisy | both. */
  let animDebugTarget = 'both';
  /** DEV: playback multiplier for roll + walk (0.25 … 2). */
  let animSpeedMult = 1;

  /** Brown dust kicked up on push (screen-space). */
  const dust = [];
  const DUST_COLORS = ['#6b4423', '#8a5a2b', '#a07040', '#5c3a22', '#7a5230'];
  /** Continuous grit while climbing. */
  let gritCarry = 0;
  /** Click-style dust from boulder/path contact while rolling. */
  let boulderDustCarry = 0;
  /** Last walk frame we spawned a shoe-plant burst for. */
  let lastShoePlantFrame = -1;
  /** Short pixel speed lines in the wake. */
  const speedLines = [];
  let speedLineCarry = 0;

  /** Winged Hermes sandals orbiting the boulder (1 per upgrade level). */
  const hermesSandals = [];
  /** Soft white “air” wisps trailing the sandals. */
  const airWisps = [];
  let hermesSandalsSynced = -1;

  /** Click-style dirt spray (shared by push burst, roll, and shoe plants). */
  function spawnDustBurst(ox, oy, opts = {}) {
    const count = opts.count ?? 14 + Math.floor(Math.random() * 6);
    const size = opts.size ?? 8;
    const speedMin = opts.speedMin ?? 60;
    const speedMax = opts.speedMax ?? 220;
    const spreadX = opts.spreadX ?? 18;
    const spreadY = opts.spreadY ?? 14;
    const lifeMin = opts.lifeMin ?? 0.4;
    const lifeMax = opts.lifeMax ?? 0.85;
    const coneDirX = opts.coneDirX;
    const coneDirY = opts.coneDirY;
    const coneSpread = opts.coneSpread ?? Math.PI * 2;

    for (let i = 0; i < count; i++) {
      let angle;
      if (Number.isFinite(coneDirX) && Number.isFinite(coneDirY)) {
        const base = Math.atan2(coneDirY, coneDirX);
        angle = base + (Math.random() - 0.5) * coneSpread;
      } else {
        angle = Math.random() * Math.PI * 2;
      }
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);
      dust.push({
        x: ox + (Math.random() - 0.5) * spreadX,
        y: oy + (Math.random() - 0.5) * spreadY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size,
        color: DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0],
      });
    }
    if (dust.length > 140) dust.splice(0, dust.length - 140);
  }

  function burstDust(state, opts = {}) {
    if (cssW < 2 || cssH < 2) return;
    const summitDist = summitDistanceFor(state.meta.summits);
    const progress = Math.min(
      1,
      Math.max(0, (state.run.visualDistance ?? state.run.distance) / summitDist)
    );
    const cam = computeCamera(progress, { smooth: true, summitDist });

    let ox;
    let oy;
    if (Number.isFinite(opts.x) && Number.isFinite(opts.y)) {
      ox = opts.x;
      oy = opts.y;
    } else if (Number.isFinite(opts.clientX) && Number.isFinite(opts.clientY)) {
      const rect = canvas.getBoundingClientRect();
      ox = opts.clientX - rect.left;
      oy = opts.clientY - rect.top;
    } else {
      const actors = actorPositions(cam, 0);
      ox = actors.sx * 0.55 + actors.bx * 0.45;
      oy = actors.sy + actors.sisyDraw * 0.32;
    }

    spawnDustBurst(ox, oy);
  }

  function updateDust(dt) {
    for (let i = dust.length - 1; i >= 0; i--) {
      const p = dust[i];
      p.life -= dt;
      if (p.life <= 0) {
        dust.splice(i, 1);
        continue;
      }
      p.vy += (p.grav ?? 260) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * (p.drag ?? 1.8));
    }
  }

  function drawDust(c) {
    c.save();
    c.imageSmoothingEnabled = false;
    for (const p of dust) {
      const a = Math.max(0, p.life / p.maxLife);
      c.globalAlpha = a * a * (p.alphaScale ?? 1);
      c.fillStyle = p.color;
      const s = Math.max(1, p.size | 0);
      c.fillRect(p.x | 0, p.y | 0, s, s);
    }
    c.restore();
  }

  /** Dirt peeling off the boulder–path contact corner while rolling. */
  function emitBoulderRollDust(actors, cam, walkPace, dt) {
    const rate = 1.2 + walkPace * 0.9;
    boulderDustCarry += rate * dt;
    const nLen = Math.hypot(cam.nx, cam.ny) || 1;
    // Path contact under the rock.
    const contactX = actors.bx - (cam.nx / nLen) * actors.boulderR * 0.95;
    const contactY = actors.by - (cam.ny / nLen) * actors.boulderR * 0.95;
    // Trailing/right meeting corner, then nudge right + down for the spray origin.
    const ox = contactX - cam.tx * actors.boulderR * 0.22 + 55;
    const oy = contactY - cam.ty * actors.boulderR * 0.22 + 24;

    while (boulderDustCarry >= 1) {
      boulderDustCarry -= 1;
      if (dust.length > 180) break;
      // One piece at a time — sparse kick-up, not a spray hose.
      // Wide mix: some skim short, some sail way out before dropping.
      const speed = 40 + Math.random() * 120;
      const far = Math.random();
      const horiz = 1.2 + far * far * 4.5; // bias toward some very long throws
      const angle = -0.55 + (Math.random() - 0.5) * 1.1;
      const life = 0.7 + Math.random() * 1.1;
      dust.push({
        x: ox + (Math.random() - 0.5) * 6,
        y: oy + (Math.random() - 0.5) * 4,
        vx: Math.cos(angle) * speed * horiz,
        vy: Math.sin(angle) * speed * (0.7 + Math.random() * 0.8),
        life,
        maxLife: life,
        size: 8,
        color: DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0],
        grav: 70 + Math.random() * 120,
        drag: 0.08 + Math.random() * 0.35,
      });
    }
  }

  /** Click-style puff from the back foot on leg plants (frames 0 & 6). */
  function emitShoePlantDust(actors, cam, walkFrame, walking) {
    if (!walking) {
      lastShoePlantFrame = -1;
      return;
    }
    const f = ((walkFrame % 12) + 12) % 12;
    const isPlant = f === 0 || f === 6;
    if (!isPlant || f === lastShoePlantFrame) return;
    lastShoePlantFrame = f;

    const sisy = actors.sisyDraw;
    const ang = actors.groundAngle || 0;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    // Sprite faces left toward the boulder; back foot = sprite-right + downslope.
    const localX = sisy * 0.2;
    const localY = sisy * 0.5;
    const ox =
      actors.sx +
      (localX * cos - localY * sin) -
      cam.tx * sisy * 0.08;
    const oy =
      actors.sy +
      (localX * sin + localY * cos) -
      cam.ty * sisy * 0.08;

    spawnDustBurst(ox, oy, {
      count: 5 + ((Math.random() * 4) | 0),
      size: 6 + ((Math.random() * 3) | 0),
      speedMin: 50,
      speedMax: 160,
      spreadX: 12,
      spreadY: 8,
      lifeMin: 0.3,
      lifeMax: 0.6,
      coneDirX: -cam.tx,
      coneDirY: -cam.ty,
      coneSpread: Math.PI * 1.1,
    });
  }

  function emitClimbGrit(actors, cam, walkPace, activelyPushing, dt) {
    const rate = (activelyPushing ? 10 : 4) * Math.max(0.45, walkPace);
    gritCarry += rate * dt;
    const { tx, ty } = cam;
    const feetX = actors.sx - tx * actors.sisyDraw * 0.08;
    const feetY = actors.sy + actors.sisyDraw * 0.38;
    while (gritCarry >= 1) {
      gritCarry -= 1;
      if (dust.length > 140) break;
      const spread = (Math.random() - 0.5) * actors.sisyDraw * 0.4;
      const ox = feetX - ty * spread + (Math.random() - 0.5) * 8;
      const oy = feetY + tx * spread + (Math.random() - 0.5) * 5;
      const drift = 28 + Math.random() * 55;
      const life = 0.35 + Math.random() * 0.4;
      dust.push({
        x: ox,
        y: oy,
        vx: -tx * drift + (Math.random() - 0.5) * 28,
        vy: -ty * drift + 8 + Math.random() * 30,
        life,
        maxLife: life,
        size: 3 + ((Math.random() * 4) | 0),
        color: DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0],
        grav: 140,
        drag: 2.1,
        alphaScale: activelyPushing ? 1 : 0.85,
      });
    }
  }

  function updateSpeedLines(dt) {
    for (let i = speedLines.length - 1; i >= 0; i--) {
      const L = speedLines[i];
      L.life -= dt;
      if (L.life <= 0) {
        speedLines.splice(i, 1);
        continue;
      }
      L.x += L.vx * dt;
      L.y += L.vy * dt;
    }
  }

  function drawSpeedLines(c) {
    c.save();
    c.imageSmoothingEnabled = false;
    for (const L of speedLines) {
      const a = Math.max(0, L.life / L.maxLife);
      c.globalAlpha = 0.35 + a * 0.55;
      c.fillStyle = L.color;
      const len = Math.max(4, L.len | 0);
      const thick = Math.max(2, L.thick | 0);
      // Step along the slope wake so lines read on a diagonal climb.
      for (let i = 0; i < len; i++) {
        const px = (L.x + L.dirX * i) | 0;
        const py = (L.y + L.dirY * i) | 0;
        c.fillRect(px, py, thick, thick);
      }
    }
    c.restore();
  }

  function emitSpeedLines(actors, cam, walkPace, dt) {
    const u = walkPace / SISY_WALK_PACE_MAX;
    // Show whenever climbing — stronger when pushing hard.
    if (u < 0.12) {
      speedLineCarry = Math.max(0, speedLineCarry - dt * 4);
      return;
    }
    const rate = 10 + u * 22;
    speedLineCarry += rate * dt;
    const { tx, ty } = cam;
    const mag = Math.hypot(tx, ty) || 1;
    const dx = -tx / mag;
    const dy = -ty / mag;
    while (speedLineCarry >= 1) {
      speedLineCarry -= 1;
      if (speedLines.length > 40) break;
      const along = Math.random();
      const baseX = actors.sx * (1 - along) + actors.bx * along;
      const baseY = actors.sy * (1 - along) + actors.by * along;
      const lateral = (Math.random() - 0.5) * actors.boulderR * 1.8;
      const life = 0.18 + Math.random() * 0.22;
      const len = 10 + ((Math.random() * (12 + u * 14)) | 0);
      speedLines.push({
        x: baseX + dx * (6 + Math.random() * 24) - ty * lateral,
        y: baseY + dy * (6 + Math.random() * 24) + tx * lateral,
        vx: dx * (50 + u * 100),
        vy: dy * (50 + u * 100),
        dirX: dx,
        dirY: dy,
        len,
        thick: 2 + ((Math.random() * 2) | 0),
        life,
        maxLife: life,
        color: Math.random() > 0.4 ? '#e8dcc8' : '#b8a890',
      });
    }
  }

  /** Flat pixel ellipse stamped under actors (low-res → nearest upscale). */
  function drawPixelShadow(c, cx, cy, radiusX, radiusY, angle, strength = 1) {
    const rw = Math.max(4, radiusX);
    const rh = Math.max(2, radiusY);
    const stamp = ensureShadowStamp(64, 32);
    c.save();
    c.translate(Math.round(cx), Math.round(cy));
    c.rotate(angle || 0);
    c.globalAlpha = Math.max(0, Math.min(1, strength));
    c.imageSmoothingEnabled = false;
    c.drawImage(stamp, Math.round(-rw), Math.round(-rh), Math.round(rw * 2), Math.round(rh * 2));
    c.restore();
  }

  function drawActorShadows(
    c,
    actors,
    cam,
    walkPace,
    walkFrame = 0,
    walking = false
  ) {
    const paceBoost = 0.85 + 0.2 * Math.min(1, walkPace / SISY_WALK_PACE_MAX);
    // Light from top-left → cast bias toward bottom-right.
    const biasX = 6;
    const biasY = 4;
    const groundAng = actors.groundAngle || 0;
    // Slide downslope so the blob sits under the mass on the diagonal hill.
    const boulderDown = actors.boulderR * 0.36;
    const sisyDown = actors.sisyDraw * 0.24;

    drawPixelShadow(
      c,
      actors.shadowX - cam.tx * boulderDown + biasX,
      actors.shadowY - cam.ty * boulderDown + biasY,
      actors.boulderR * 1.2,
      actors.boulderR * 0.14,
      groundAng,
      0.9 * paceBoost
    );

    // Walk bob: two plants per cycle → brief push downslope on each footfall.
    let sisyBob = 0;
    // Frame 5 (and neighbors): left leg strides past a tight shadow — widen + shift.
    let legWiden = 1;
    let legShift = 0;
    if (walking) {
      const phase = ((walkFrame % 12) / 12) * Math.PI * 4;
      sisyBob = Math.max(0, Math.sin(phase)) * actors.sisyDraw * 0.0375;
      const f = ((walkFrame % 12) + 12) % 12;
      const dist = Math.min(Math.abs(f - 5), Math.abs(f - 5 + 12), Math.abs(f - 5 - 12));
      if (dist === 0) {
        legWiden = 1.06;
        legShift = actors.sisyDraw * 0.02;
      } else if (dist === 1) {
        legWiden = 1.03;
        legShift = actors.sisyDraw * 0.008;
      }
    }
    const sisySlide = sisyDown + sisyBob;
    // Sprite-local left (extended leg) after ground rotation.
    const legX = -Math.cos(groundAng) * legShift;
    const legY = -Math.sin(groundAng) * legShift;
    drawPixelShadow(
      c,
      actors.feetX - cam.tx * sisySlide + biasX + legX,
      actors.feetY - cam.ty * sisySlide + biasY + legY,
      actors.sisyDraw * 0.4 * legWiden,
      actors.sisyDraw * 0.0675,
      groundAng,
      0.72 * paceBoost
    );
  }

  function syncHermesSandals(level) {
    const n = Math.max(0, Math.min(HERMES_SANDAL_MAX, level | 0));
    // Rebuild if motion model changed (hot reload / old sandals).
    if (hermesSandals.length && hermesSandals[0].swoopVer !== 10) {
      hermesSandals.length = 0;
      hermesSandalsSynced = -1;
    }
    if (n === hermesSandalsSynced && hermesSandals.length === n) return;

    while (hermesSandals.length < n) {
      hermesSandals.push({
        swoopVer: 10,
        tilt: 0,
        reach: 0.7,
        lift: 0.22,
        swoopAmp: 0.22,
        swoopSkew: 0,
        swoopPow: 1,
        omega: 1.1,
        t: 0,
        bob: Math.random() * Math.PI * 2,
        bobAmp: 2,
        angVel: 0,
      });
    }
    while (hermesSandals.length > n) hermesSandals.pop();

    for (let i = 0; i < hermesSandals.length; i++) {
      const s = hermesSandals[i];
      const slot = i / Math.max(1, n);
      s.swoopVer = 10;
      // Fan tilts across the upper-front face only (±~35°).
      s.tilt = (slot - 0.5) * 0.9 + (Math.random() - 0.5) * 0.2;
      s.reach = 0.89 + (i % 3) * 0.12 + Math.random() * 0.17;
      // Spread lanes down the boulder face — low / mid / high bands.
      const band = i % 3;
      const bandLift = band === 0 ? 0.52 : band === 1 ? 0.3 : 0.12;
      s.lift = bandLift + (Math.random() - 0.5) * 0.08;
      // How hard it dips through mid-pass (randomized per sandal).
      s.swoopAmp = 0.14 + Math.random() * 0.18;
      // Shift the trough left/right a little so paths aren’t identical.
      s.swoopSkew = (Math.random() - 0.5) * 0.45;
      // >1 = flatter ends / sharper mid dip; <1 = gentler bowl.
      s.swoopPow = 0.85 + Math.random() * 0.55;
      s.bob = Math.random() * Math.PI * 2;
      s.bobAmp = 1.5 + Math.random() * 2.5;
      s.t = slot * Math.PI * 2 + Math.random() * 0.4;
      s.omega = 1.26 + (i % 3) * 0.24 + Math.random() * 0.42;
    }
    hermesSandalsSynced = n;
  }

  function sandalScreenPos(s, actors) {
    const u = Math.sin(s.t); // -1..1 along the pass
    const speedNorm = Math.min(1, Math.abs(Math.cos(s.t)));
    const R = actors.boulderR;

    // Front-face chord: skim left↔right across the upper rock, never behind.
    const halfW = R * s.reach * (1.02 - speedNorm * 0.08);
    const localX = u * halfW;

    // High at the turnarounds → swoop down through the middle → high again.
    const uDip = Math.max(-1, Math.min(1, u - (s.swoopSkew || 0)));
    const dip = Math.pow(1 - uDip * uDip, s.swoopPow || 1);
    const localY =
      -R * s.lift +
      dip * R * (s.swoopAmp || 0.22) -
      Math.sin(s.bob) * (s.bobAmp || 2);

    const cr = Math.cos(s.tilt);
    const sr = Math.sin(s.tilt);
    const ox = localX * cr - localY * sr;
    const oy = localX * sr + localY * cr;

    const pulse = 1 + speedNorm * 0.2;
    const x = actors.bx + ox;
    const y = actors.by + oy;
    const size = R * 0.34 * pulse;
    // Facing follows horizontal travel on the chord.
    const vx = Math.cos(s.t) * s.omega * halfW * cr;
    return { x, y, size, depth: 1, faceRight: vx >= 0, speedNorm };
  }

  function updateHermesSandals(dt, actors, level) {
    syncHermesSandals(level);
    if (hermesSandals.length === 0) {
      airWisps.length = 0;
      return;
    }

    for (const s of hermesSandals) {
      const whip = 0.28 + 0.72 * Math.abs(Math.cos(s.t));
      s.t += s.omega * whip * dt;
      s.angVel = s.omega * Math.cos(s.t) * whip;
      s.bob += dt * (1.3 + Math.abs(s.angVel) * 0.1);

      const pos = sandalScreenPos(s, actors);
      const emitChance = Math.min(1, dt * (3 + pos.speedNorm * 24));
      if (Math.random() < emitChance) {
        const spray = 26 + pos.speedNorm * 65;
        const life = 0.18 + Math.random() * 0.26;
        const face = pos.faceRight ? 1 : -1;
        airWisps.push({
          x: pos.x + (Math.random() - 0.5) * 10,
          y: pos.y + (Math.random() - 0.5) * 8,
          vx: -face * spray * (0.55 + Math.random() * 0.6) + (Math.random() - 0.5) * 18,
          vy: (Math.random() - 0.55) * spray * 0.7 - 5 - Math.random() * 16,
          life,
          maxLife: life,
          size: 2 + ((Math.random() * 2) | 0),
        });
      }
    }

    for (let i = airWisps.length - 1; i >= 0; i--) {
      const p = airWisps[i];
      p.life -= dt;
      if (p.life <= 0) {
        airWisps.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.4);
      p.vy *= Math.exp(-dt * 1.1);
      p.vy -= 12 * dt;
    }
    if (airWisps.length > 90) airWisps.splice(0, airWisps.length - 90);
  }

  function drawAirWisps(c) {
    if (airWisps.length === 0) return;
    c.save();
    c.imageSmoothingEnabled = false;
    for (const p of airWisps) {
      const a = Math.max(0, p.life / p.maxLife);
      c.globalAlpha = a * a * 0.85;
      c.fillStyle = '#f4f7fb';
      c.fillRect((p.x | 0), (p.y | 0), p.size, p.size);
    }
    c.restore();
  }

  function drawHermesSandals(c, actors, front) {
    if (hermesSandals.length === 0) return;
    const src = spriteSource(hermesSandal);
    const ready = imageReady(hermesSandal) || hermesSandal._keyed;
    c.save();
    c.imageSmoothingEnabled = false;
    for (const s of hermesSandals) {
      const pos = sandalScreenPos(s, actors);
      const isFront = pos.depth >= 0;
      if (isFront !== front) continue;

      c.globalAlpha = front ? 0.95 : 0.72;
      c.save();
      c.translate(pos.x | 0, pos.y | 0);
      if (!pos.faceRight) c.scale(-1, 1);
      const half = pos.size / 2;
      if (ready) {
        c.drawImage(src, -half, -half, pos.size, pos.size);
      } else {
        c.fillStyle = '#c9a227';
        c.beginPath();
        c.ellipse(0, 0, half * 0.7, half * 0.35, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
    c.restore();
  }

  function resize() {
    // Layout size comes from CSS (100% of #stage) — never write inline px here,
    // or the canvas locks to its first size and can't shrink with the window.
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.floor(rect.width));
    cssH = Math.max(1, Math.floor(rect.height));
    // Soft pixel budget: keep HiDPI when small, drop DPR as the window grows
    // so fill-rate doesn't explode on big monitors.
    const rawDpr = Math.min(window.devicePixelRatio || 1, 2);
    const MAX_BACKING_PX = 1_600_000; // ~1280×1250 or 1920×833 @1×
    const area = cssW * cssH;
    dpr =
      area * rawDpr * rawDpr > MAX_BACKING_PX
        ? Math.max(1, Math.sqrt(MAX_BACKING_PX / area))
        : rawDpr;

    const bw = Math.floor(cssW * dpr);
    const bh = Math.floor(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }

    boulderDraw = Math.max(BOULDER_MIN, Math.round(cssH * BOULDER_HEIGHT_RATIO));
    sisyDraw = Math.max(SISY_MIN, Math.round(cssH * SISY_HEIGHT_RATIO));
    camInitialized = false;
  }

  /** Chunky hill pixels (denser art than the boulder, so scale up harder). */
  function tileScale() {
    return Math.max(2, (boulderDraw / HILL_SCALE_REF) * HILL_SCALE_MULT);
  }

  /**
   * World space: tile 0 (base) top-left at (0,0).
   * Higher tile index = further uphill (left + up).
   * Path length scales with summit meters (same px/m every run). Tiles are
   * streamed near the camera — `n` is only for path math, not draw cost.
   */
  function hillMetrics(summitDist = SUMMIT_DISTANCES[0]) {
    const s = tileScale();
    const tile = TILE_NATIVE * s;
    const stepX = TILE_STEP_X * s;
    const stepY = TILE_STEP_Y * s;
    const upX = -stepX;
    const upY = -stepY;
    const pathYLeft = PATH_Y_LEFT * s;

    const span = Math.max(cssW, cssH) * 14;
    const perTile = Math.hypot(stepX, stepY);
    const baseTiles = Math.max(28, Math.ceil(span / perTile));
    const pathScale = hillPathScaleFor(summitDist);
    const n = Math.max(2, Math.round((baseTiles - 1) * pathScale) + 1);

    // Base = right edge of tile 0 (lower end of strip).
    // Summit = left edge of tile n-1 (upper end).
    const baseX = stepX;
    const baseY = pathYLeft + stepY;
    const summitX = (n - 1) * upX;
    const summitY = (n - 1) * upY + pathYLeft;
    const pathLen = Math.hypot(summitX - baseX, summitY - baseY) || 1;

    let tx = (summitX - baseX) / pathLen;
    let ty = (summitY - baseY) / pathLen;
    let nx = -ty;
    let ny = tx;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }

    return {
      s,
      tile,
      stepX,
      stepY,
      upX,
      upY,
      pathYLeft,
      n,
      pathScale,
      perTile,
      extraBase: EXTRA_BASE_TILES,
      baseX,
      baseY,
      summitX,
      summitY,
      pathLen,
      tx,
      ty,
      nx,
      ny,
      groundAngle: Math.atan2(-ty, -tx),
    };
  }

  function pathWorld(t, m, clamp = true) {
    const tt = clamp ? Math.max(0, Math.min(1, t)) : t;
    return {
      x: m.baseX + (m.summitX - m.baseX) * tt,
      y: m.baseY + (m.summitY - m.baseY) * tt,
    };
  }

  function computeCamera(progress, opts = {}) {
    const smooth = opts.smooth === true;
    const w = cssW;
    const h = cssH;
    const summitDist = opts.summitDist ?? summitDistanceFor(0);
    const m = hillMetrics(summitDist);

    if (m.pathScale !== lastPathScale) {
      lastPathScale = m.pathScale;
      camInitialized = false;
    }

    const contactX = w * CONTACT_X_RATIO;
    const contactY = h * CONTACT_Y_RATIO + SCENE_Y_NUDGE;
    const solidR = boulderDraw * BOULDER_SOLID_FRAC;

    const path = pathFromContact(contactX, contactY, m.tx, m.ty, m.nx, m.ny, solidR);
    const ridge = pathWorld(progress, m);

    const targetOX = path.x - ridge.x;
    const targetOY = path.y - ridge.y;

    let originX = targetOX;
    let originY = targetOY;

    if (smooth) {
      if (!camInitialized) {
        camSmoothX = targetOX;
        camSmoothY = targetOY;
        camInitialized = true;
      } else {
        const lerp = 0.07;
        camSmoothX += (targetOX - camSmoothX) * lerp;
        camSmoothY += (targetOY - camSmoothY) * lerp;
      }
      originX = camSmoothX;
      originY = camSmoothY;
    }

    const ridge0 = pathWorld(0, m);
    const path0 = pathFromContact(contactX, contactY, m.tx, m.ty, m.nx, m.ny, solidR);
    const worldXOffset = originX - (path0.x - ridge0.x);
    const worldYOffset = originY - (path0.y - ridge0.y);

    return {
      contactX,
      contactY,
      focalX: contactX,
      focalY: contactY,
      progress,
      originX,
      originY,
      worldXOffset,
      worldYOffset,
      sisyDraw,
      boulderDraw,
      tx: m.tx,
      ty: m.ty,
      nx: m.nx,
      ny: m.ny,
      groundAngle: m.groundAngle,
      pathX: path.x,
      pathY: path.y,
      boulderR: solidR,
      metrics: m,
      pathLen: m.pathLen,
      summitDist,
    };
  }

  /** Screen-space point on the climb path at progress t. */
  function slopePointOnScreen(t, cam, clamp = true) {
    const p = pathWorld(t, cam.metrics, clamp);
    return {
      x: cam.originX + p.x,
      y: cam.originY + p.y,
    };
  }

  /**
   * Plant on the *visible* path (after camera), not a separate math target.
   */
  function actorPositions(cam, pulse = 0) {
    const boulderSize = cam.boulderDraw;
    const sisy = cam.sisyDraw;
    const solidR = cam.boulderR;
    const { tx, ty, nx, ny, groundAngle } = cam;
    const bounce = Math.sin(pulse * Math.PI) * 2;

    const ground = slopePointOnScreen(cam.progress, cam);
    const crestLift = solidR * 0.05;
    const gx = ground.x + nx * crestLift + ACTOR_OFFSET_X;
    const gy = ground.y + ny * crestLift + ACTOR_OFFSET_Y;

    const bx = gx + nx * solidR;
    const by = gy + ny * solidR + bounce * 0.1;

    const touchX = bx - tx * (solidR * CONTACT_DEPTH);
    const touchY = by - ty * (solidR * CONTACT_DEPTH);

    const handLocalX = -sisy * 0.47;
    const handLocalY = -sisy * 0.06;
    const cos = Math.cos(groundAngle);
    const sin = Math.sin(groundAngle);

    let sx = touchX - (handLocalX * cos - handLocalY * sin);
    let sy = touchY - (handLocalX * sin + handLocalY * cos) - bounce * 0.25;
    sx += tx * (sisy * 0.02);
    sy += ty * (sisy * 0.02);

    const feetLocalX = -sisy * 0.1;
    const feetLocalY = sisy * 0.46;
    const feetX = sx + (feetLocalX * cos - feetLocalY * sin);
    const feetY = sy + (feetLocalX * sin + feetLocalY * cos);
    const footGroundX = gx - tx * (solidR * 1.15 + sisy * 0.2);
    const footGroundY = gy - ty * (solidR * 1.15 + sisy * 0.2);
    const above = (feetX - footGroundX) * nx + (feetY - footGroundY) * ny;
    sx -= nx * above;
    sy -= ny * above;
    // Settle onto the hill face (down + left on screen).
    const stand = SISY_STAND_NUDGE / Math.SQRT2;
    sx -= stand;
    sy += stand + 5;

    // Feet after final plant — used for contact shadow.
    const feetSX = sx + (feetLocalX * cos - feetLocalY * sin);
    const feetSY = sy + (feetLocalX * sin + feetLocalY * cos);

    return {
      along: { x: gx, y: gy },
      angle: Math.atan2(ty, tx),
      groundAngle,
      bx,
      by,
      sx,
      sy,
      feetX: feetSX,
      feetY: feetSY,
      shadowX: gx,
      shadowY: gy,
      boulderR: solidR,
      sisyDraw: sisy,
      boulderDraw: boulderSize,
      contactX: touchX,
      contactY: touchY,
    };
  }

  /**
   * Distant painted backdrop — one horizontal strip of side-by-side tiles.
   * As you climb, the whole strip drifts upward slowly so the peaks stay
   * behind Sisyphus (no stacked copies above/below).
   */
  function drawTiledBackground(cam) {
    if (!imageReady(background)) return;
    const w = cssW;
    const h = cssH;
    const imgW = background.naturalWidth || ART_W;
    const imgH = background.naturalHeight || ART_H;
    if (imgW < 2 || imgH < 2) return;

    // Slightly taller than the view so we can drift without empty bands.
    const scale = (h * 1.28) / imgH;
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const maxDrift = Math.max(0, drawH - h);

    // Side-by-side only — next tile slides in as you travel.
    const scrollX = -cam.worldXOffset * BG_PARALLAX_X;
    const offsetX = ((scrollX % drawW) + drawW) % drawW;

    // Rise with climb progress so the backdrop stays behind him on the hill.
    const t = Math.max(0, Math.min(1, cam.progress));
    const y = -maxDrift * t;

    ctx.imageSmoothingEnabled = true;
    // Avoid 'high' — expensive bilinear and not needed for this backdrop.

    for (let x = -offsetX - drawW; x < w + drawW; x += drawW) {
      ctx.drawImage(background, x, y, drawW, drawH);
    }

    ctx.imageSmoothingEnabled = false;
  }

  function drawTiledHill(cam) {
    const m = cam.metrics;
    const w = cssW;
    const h = cssH;

    // Underfill only for the visible stretch (full-mountain polys blow up at 1000×).
    const viewSpan = Math.hypot(w, h) * 1.6;
    const dProg = viewSpan / Math.max(1, m.pathLen);
    const a = slopePointOnScreen(cam.progress - dProg, cam, false);
    const b = slopePointOnScreen(cam.progress + dProg, cam, false);
    const deep = Math.max(h, w) * 1.4;
    ctx.fillStyle = UNDERFILL;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x - m.nx * deep, b.y - m.ny * deep);
    ctx.lineTo(a.x - m.nx * deep, a.y - m.ny * deep);
    ctx.closePath();
    ctx.fill();

    if (!imageReady(hillTile) && !hillTile._keyed) return;
    const src = litSpriteSource(hillTile, 1.18);

    const margin = m.tile * 1.5;
    ctx.imageSmoothingEnabled = false;

    // Stream only tiles near the camera + a short look-ahead uphill.
    const iX0 = (w + margin - cam.originX) / m.upX;
    const iX1 = (-margin - m.tile - cam.originX) / m.upX;
    const iY0 = (h + margin - cam.originY) / m.upY;
    const iY1 = (-margin - m.tile - cam.originY) / m.upY;
    let iMin = Math.floor(Math.min(iX0, iX1, iY0, iY1)) - 1;
    let iMax = Math.ceil(Math.max(iX0, iX1, iY0, iY1)) + 1;
    const iAtProgress = cam.progress * Math.max(1, m.n - 1);
    iMax = Math.max(iMax, Math.ceil(iAtProgress) + HILL_LOOKAHEAD_TILES);
    iMin = Math.max(-m.extraBase, iMin);
    iMax = Math.min(m.n - 1, iMax);

    for (let i = iMin; i <= iMax; i++) {
      const sx = cam.originX + i * m.upX;
      const sy = cam.originY + i * m.upY;
      if (sx + m.tile < -margin || sx > w + margin) continue;
      if (sy + m.tile < -margin || sy > h + margin) continue;
      ctx.drawImage(src, sx, sy, m.tile, m.tile);
    }
  }

  function draw(state, dt = 1 / 60) {
    const w = cssW;
    const h = cssH;
    if (w < 2 || h < 2) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const summitDist = summitDistanceFor(state.meta.summits);
    const progress = Math.min(
      1,
      Math.max(0, (state.run.visualDistance ?? state.run.distance) / summitDist)
    );
    const cam = computeCamera(progress, { smooth: true, summitDist });
    const pulse = state.run.pushPulse;
    const actors = actorPositions(cam, pulse);

    ctx.fillStyle = '#0c0a14';
    ctx.fillRect(0, 0, w, h);

    drawTiledBackground(cam);

    // Knock the painted BG back so dark sprites don't melt into it.
    ctx.fillStyle = 'rgba(6, 4, 12, 0.4)';
    ctx.fillRect(0, 0, w, h);

    drawTiledHill(cam);

    // Marker step scales with mountain length (≈10 labels along the climb).
    const markerStep = Math.max(500, Math.round(summitDist / 10 / 500) * 500);
    ctx.fillStyle = 'rgba(232, 226, 214, 0.4)';
    ctx.font = '10px IBM Plex Mono, monospace';
    for (let meter = 0; meter <= summitDist; meter += markerStep) {
      const pt = slopePointOnScreen(meter / summitDist, cam);
      if (pt.x < -40 || pt.x > w + 40 || pt.y < -40 || pt.y > h + 40) continue;
      ctx.fillRect(pt.x - 1, pt.y + 6, 2, 7);
      if (meter > 0 && meter < summitDist) {
        ctx.fillText(formatMeterLabel(meter), pt.x - 12, pt.y + 24);
      }
    }

    const summit = slopePointOnScreen(1, cam);
    if (summit.x > -80 && summit.x < w + 80 && summit.y > -80 && summit.y < h + 80) {
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(summit.x - 4, summit.y - 34, 8, 26);
      ctx.fillStyle = '#e8dcc8';
      ctx.font = 'bold 11px Cinzel, serif';
      ctx.fillText('SUMMIT', summit.x - 14, summit.y - 40);
    }

    const hermesLv = (state.run.upgrades && state.run.upgrades.hermesSandals) || 0;
    updateHermesSandals(dt, actors, hermesLv);

    // Struggle-walk: pace follows the camera’s real m/s (lastVisualMps), not
    // activePushSpeed — that gameplay rate runs ahead of the eased hill scroll.
    const climbMps = Math.max(0, state.run.lastVisualMps || 0);
    const climbing = climbMps > 0.02;
    const shouldWalk = climbing;
    // Exact camera→stride map — no minimum pace (that made feet spin on crawls).
    const walkPaceTarget = climbing
      ? Math.min(SISY_WALK_PACE_MAX, climbMps / SISY_WALK_REF_MPS)
      : 0;

    const prevPace = walkPaceSmooth;
    if (climbing && !walkWasActive) {
      // Climb just started: plant the cycle near the measured camera pace.
      walkCooldown = 0;
      walkPaceSmooth = Math.max(walkPaceSmooth, walkPaceTarget * FIRST_SHOVE_PACE_CATCHUP);
    } else if (walkPaceTarget >= walkPaceSmooth) {
      walkPaceSmooth += (walkPaceTarget - walkPaceSmooth) * Math.min(1, dt * 8);
    } else if (climbing) {
      walkPaceSmooth += (walkPaceTarget - walkPaceSmooth) * Math.min(1, dt * 6);
    } else {
      walkPaceSmooth += (0 - walkPaceSmooth) * Math.min(1, dt * 5);
    }
    walkWasActive = climbing;
    const walkPace = Math.max(0, walkPaceSmooth);

    // Boulder rolls off the same pace as the walk cycle, so the rock never
    // spins faster than he is stepping.
    const paceForAnim = Math.max(0.04, walkPace);
    if (boulderFrameDebug == null && shouldWalk) {
      const rollDt = dt * animSpeedMult;
      const walkCycleSec = (sisyWalk.length * SISY_WALK_FRAME_DT) / paceForAnim;
      boulderRollPhase += (rollDt * BOULDER_TURNS_PER_WALK_CYCLE) / walkCycleSec;
    }

    // If pace rose mid-stride, shorten the remaining frame wait.
    if (walkCooldown > 0 && walkPace > prevPace && prevPace > 0.01) {
      walkCooldown *= prevPace / paceForAnim;
    }

    if (walkCooldown > 0) walkCooldown -= dt * animSpeedMult;
    if (walkFrameDebug == null && shouldWalk && walkCooldown <= 0) {
      walkFrame = (walkFrame + 1) % sisyWalk.length;
      walkCooldown = SISY_WALK_FRAME_DT / paceForAnim;
    }

    const displayWalkFrame =
      walkFrameDebug != null ? walkFrameDebug : walkFrame;
    const sisySprite = imageReady(sisyWalk[displayWalkFrame])
      ? sisyWalk[displayWalkFrame]
      : sisyphus;

    // Hands fall back / push forth with the boulder (Sisy much subtler).
    if (shouldWalk || walkFrameDebug != null) {
      const f = ((displayWalkFrame % 12) + 12) % 12;
      // Two sways per walk loop; highest at frames 4 & 10.
      const stroke = Math.cos(((f - 4) * Math.PI) / 3) * 7.5;
      const sisyStroke = stroke * 0.65;
      actors.bx += cam.tx * stroke;
      actors.by += cam.ty * stroke;
      actors.shadowX += cam.tx * stroke;
      actors.shadowY += cam.ty * stroke;
      actors.sx += cam.tx * sisyStroke;
      actors.sy += cam.ty * sisyStroke;
      actors.feetX += cam.tx * sisyStroke;
      actors.feetY += cam.ty * sisyStroke;
    }

    if (shouldWalk || walkFrameDebug != null) {
      emitShoePlantDust(actors, cam, displayWalkFrame, true);
    } else {
      lastShoePlantFrame = -1;
    }
    if (shouldWalk) {
      const pushingHard = (state.run.activePushSpeed || 0) > 0.05;
      emitClimbGrit(actors, cam, walkPace, pushingHard, dt);
      emitBoulderRollDust(actors, cam, walkPace, dt);
      emitSpeedLines(actors, cam, walkPace, dt);
    } else {
      gritCarry = Math.max(0, gritCarry - dt * 8);
      boulderDustCarry = Math.max(0, boulderDustCarry - dt * 8);
      speedLineCarry = Math.max(0, speedLineCarry - dt * 8);
    }
    updateSpeedLines(dt);

    drawActorShadows(
      ctx,
      actors,
      cam,
      walkPace,
      displayWalkFrame,
      shouldWalk || walkFrameDebug != null
    );
    drawSpeedLines(ctx);
    drawBoulder(
      ctx,
      boulder,
      boulderRoll,
      actors.bx,
      actors.by,
      boulderRollPhase,
      actors.boulderDraw,
      boulderFrameDebug,
      cam.nx,
      cam.ny
    );
    drawCrackSpot(ctx, actors, state.run.crackSpot);
    drawHermesSandals(ctx, actors, true);
    drawAirWisps(ctx);
    drawSisyphus(ctx, sisySprite, actors.sx, actors.sy, pulse, actors.sisyDraw, actors.groundAngle);
    drawSkillFx(ctx, actors, state.run.skillFx);

    updateDust(dt);
    drawDust(ctx);

    const vig = ctx.createRadialGradient(w * 0.4, h * 0.55, h * 0.2, w * 0.5, h * 0.5, h * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(8,6,14,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  function crackScreenPos(actors, spot) {
    if (!spot) return null;
    const r = actors.boulderR;
    return {
      x: actors.bx + spot.nx * r,
      y: actors.by + spot.ny * r,
      hitR: r * CRACK_HIT_FRAC,
    };
  }

  function drawCrackSpot(c, actors, spot) {
    if (!spot || !(spot.life > 0)) return;
    const pos = crackScreenPos(actors, spot);
    if (!pos) return;
    const t = Math.max(0, Math.min(1, spot.life / Math.max(0.01, spot.maxLife || 3)));
    const pulse = 0.85 + Math.sin(performance.now() / 90) * 0.15;
    const rad = pos.hitR * (0.85 + (1 - t) * 0.35) * pulse;

    c.save();
    c.imageSmoothingEnabled = false;
    c.globalAlpha = 0.35 + t * 0.55;
    c.fillStyle = '#e07030';
    c.beginPath();
    c.arc(pos.x, pos.y, rad * 1.15, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.55 + t * 0.4;
    c.fillStyle = '#ffcc66';
    c.beginPath();
    c.arc(pos.x, pos.y, rad * 0.55, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.7 + t * 0.3;
    c.strokeStyle = '#f0e0c0';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(pos.x, pos.y, rad, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  function hitTestCrackSpot(clientX, clientY, state) {
    const spot = state.run.crackSpot;
    if (!spot || !(spot.life > 0)) return false;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const summitDist = summitDistanceFor(state.meta.summits);
    const progress = Math.min(
      1,
      Math.max(0, (state.run.visualDistance ?? state.run.distance) / summitDist)
    );
    const cam = computeCamera(progress, { smooth: false, summitDist });
    const actors = actorPositions(cam, 0);
    const pos = crackScreenPos(actors, spot);
    if (!pos) return false;
    const dx = x - pos.x;
    const dy = y - pos.y;
    const r = pos.hitR * 1.15;
    return dx * dx + dy * dy <= r * r;
  }

  function drawSkillFx(c, actors, fx) {
    if (!fx || !(fx.t > 0)) return;
    const a = Math.max(0, Math.min(1, fx.t));
    c.save();
    c.globalAlpha = a * 0.55;
    if (fx.kind === 'prometheus') {
      c.fillStyle = '#e07030';
      c.beginPath();
      c.arc(actors.bx, actors.by, actors.boulderR * (1.05 + (1 - a) * 0.35), 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = a * 0.35;
      c.fillStyle = '#ffcc66';
      c.beginPath();
      c.arc(actors.bx - actors.boulderR * 0.2, actors.by - actors.boulderR * 0.25, actors.boulderR * 0.35, 0, Math.PI * 2);
      c.fill();
    } else if (fx.kind === 'daedalus') {
      const expand = 0.85 + (1 - a) * 0.9;
      c.strokeStyle = '#d4dde8';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(actors.bx, actors.by, actors.boulderR * expand, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = a * 0.5;
      c.strokeStyle = '#8a96a8';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(actors.bx, actors.by, actors.boulderR * expand * 0.72, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = a * 0.55;
      c.fillStyle = '#e8eef6';
      c.fillRect(actors.bx - 5, actors.by - actors.boulderR * 1.25, 10, actors.boulderR * 0.7);
      c.fillRect(actors.bx - actors.boulderR * 0.55, actors.by - 4, actors.boulderR * 1.1, 8);
    } else if (fx.kind === 'crack') {
      c.fillStyle = '#ffcc66';
      c.beginPath();
      c.arc(actors.bx, actors.by, actors.boulderR * (0.55 + (1 - a) * 0.5), 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = a * 0.4;
      c.fillStyle = '#e07030';
      c.beginPath();
      c.arc(actors.bx, actors.by, actors.boulderR * (0.35 + (1 - a) * 0.25), 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function hitTestBoulder(clientX, clientY, state) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const summitDist = summitDistanceFor(state.meta.summits);
    const progress = Math.min(
      1,
      Math.max(0, (state.run.visualDistance ?? state.run.distance) / summitDist)
    );
    const cam = computeCamera(progress, { smooth: false, summitDist });
    const { bx, by, boulderR } = actorPositions(cam, 0);
    const dx = x - bx;
    const dy = y - by;
    const r = boulderR * 1.15;
    return dx * dx + dy * dy <= r * r;
  }

  /**
   * Rolling-without-slip: θ = s / r, where s is path length in pixels for
   * this many meters. Negative = roll while climbing upslope (leftward).
   */
  function rollRadiansForDistance(meters, progress = 0, summitDist = null) {
    if (!(meters > 0) || cssW < 1 || cssH < 1) return 0;
    const goal = summitDist || summitDistanceFor(0);
    const cam = computeCamera(Math.max(0, Math.min(1, progress)), {
      smooth: false,
      summitDist: goal,
    });
    const pathPx = cam.pathLen || 1;
    const r = Math.max(1, cam.boulderR);
    return -((meters / goal) * pathPx) / r;
  }

  function boulderFrameCount() {
    return boulderRoll.length;
  }

  function getAnimDebugTarget() {
    return animDebugTarget;
  }

  function setAnimDebugTarget(target) {
    const t = String(target || '').trim();
    if (t === 'boulder' || t === 'sisy' || t === 'both') {
      animDebugTarget = t;
    }
    return animDebugTarget;
  }

  function getBoulderFrameDebug() {
    if (boulderFrameDebug == null) {
      return {
        locked: false,
        frame: boulderRollFrameIndex(((boulderRollPhase % 1) + 1) % 1, boulderRoll.length),
        count: boulderRoll.length,
      };
    }
    return { locked: true, frame: boulderFrameDebug, count: boulderRoll.length };
  }

  function getSisyFrameDebug() {
    const n = Math.max(1, sisyWalk.length);
    if (walkFrameDebug == null) {
      return { locked: false, frame: walkFrame % n, count: n };
    }
    return { locked: true, frame: walkFrameDebug % n, count: n };
  }

  function getAnimFrameDebug() {
    return {
      target: animDebugTarget,
      boulder: getBoulderFrameDebug(),
      sisy: getSisyFrameDebug(),
    };
  }

  function stepBoulderFrame(delta = 1) {
    const n = boulderRoll.length;
    if (n <= 0) return getBoulderFrameDebug();
    if (boulderFrameDebug == null) {
      boulderFrameDebug = boulderRollFrameIndex(
        ((boulderRollPhase % 1) + 1) % 1,
        n
      );
    }
    boulderFrameDebug = ((boulderFrameDebug + delta) % n + n) % n;
    return getBoulderFrameDebug();
  }

  function stepSisyFrame(delta = 1) {
    const n = sisyWalk.length;
    if (n <= 0) return getSisyFrameDebug();
    if (walkFrameDebug == null) walkFrameDebug = walkFrame % n;
    walkFrameDebug = ((walkFrameDebug + delta) % n + n) % n;
    walkFrame = walkFrameDebug;
    walkCooldown = 0;
    return getSisyFrameDebug();
  }

  function stepAnimFrame(delta = 1) {
    const t = animDebugTarget;
    // Sisy first so a boulder error can't skip him when target is both.
    if (t === 'sisy' || t === 'both') stepSisyFrame(delta);
    if (t === 'boulder' || t === 'both') stepBoulderFrame(delta);
    return getAnimFrameDebug();
  }

  function playBoulderFrames() {
    if (boulderFrameDebug != null) {
      const n = boulderRoll.length;
      const lastW = BOULDER_ROLL_LAST_FRAME_WEIGHT;
      const total = n - 1 + lastW;
      const mid =
        boulderFrameDebug < n - 1
          ? (boulderFrameDebug + 0.5) / total
          : (n - 1 + lastW * 0.5) / total;
      boulderRollPhase = Math.floor(boulderRollPhase) + mid;
    }
    boulderFrameDebug = null;
    return getBoulderFrameDebug();
  }

  function playSisyFrames() {
    if (walkFrameDebug != null) walkFrame = walkFrameDebug;
    walkFrameDebug = null;
    return getSisyFrameDebug();
  }

  function playAnimFrames() {
    if (animDebugTarget === 'boulder' || animDebugTarget === 'both') {
      playBoulderFrames();
    }
    if (animDebugTarget === 'sisy' || animDebugTarget === 'both') {
      playSisyFrames();
    }
    return getAnimFrameDebug();
  }

  const ANIM_SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2];

  function getBoulderSpeedMult() {
    return animSpeedMult;
  }

  function getAnimSpeedMult() {
    return animSpeedMult;
  }

  function setBoulderSpeedMult(mult) {
    return setAnimSpeedMult(mult);
  }

  function setAnimSpeedMult(mult) {
    const m = Number(mult);
    if (!Number.isFinite(m)) return animSpeedMult;
    animSpeedMult = Math.min(2, Math.max(0.25, m));
    return animSpeedMult;
  }

  function nudgeBoulderSpeed(dir) {
    return nudgeAnimSpeed(dir);
  }

  function nudgeAnimSpeed(dir) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < ANIM_SPEED_STEPS.length; i++) {
      const d = Math.abs(ANIM_SPEED_STEPS[i] - animSpeedMult);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    const next = Math.min(
      ANIM_SPEED_STEPS.length - 1,
      Math.max(0, best + (dir < 0 ? -1 : 1))
    );
    animSpeedMult = ANIM_SPEED_STEPS[next];
    return animSpeedMult;
  }

  return {
    resize,
    draw,
    burstDust,
    hitTestBoulder,
    hitTestCrackSpot,
    rollRadiansForDistance,
    boulderFrameCount,
    getAnimDebugTarget,
    setAnimDebugTarget,
    getAnimFrameDebug,
    getBoulderFrameDebug,
    getSisyFrameDebug,
    stepAnimFrame,
    stepBoulderFrame,
    stepSisyFrame,
    playAnimFrames,
    playBoulderFrames,
    playSisyFrames,
    getBoulderSpeedMult,
    getAnimSpeedMult,
    setBoulderSpeedMult,
    setAnimSpeedMult,
    nudgeBoulderSpeed,
    nudgeAnimSpeed,
    canvas,
    ctx,
    computeCamera,
  };
}

// —— Helpers ——

function formatMeterLabel(meters) {
  const shown = displayMeters(meters);
  if (shown >= 1000) return Math.round(shown / 1000) + 'km';
  return Math.round(shown) + 'm';
}

/** Path point under the boulder from the centered palm contact. */
function pathFromContact(contactX, contactY, tx, ty, nx, ny, solidR) {
  const bx = contactX + tx * (solidR * CONTACT_DEPTH);
  const by = contactY + ty * (solidR * CONTACT_DEPTH);
  const nestle = solidR * 0.08;
  return {
    x: bx - nx * solidR + nx * nestle,
    y: by - ny * solidR + ny * nestle,
  };
}

function loadImage(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img;
}

function imageReady(img) {
  return img && img.complete && img.naturalWidth > 0;
}

function loadImageKeyed(src, threshold = 16, opts = {}) {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const cctx = c.getContext('2d', { willReadFrequently: true });
      cctx.imageSmoothingEnabled = false;
      cctx.drawImage(img, 0, 0);
      const frame = cctx.getImageData(0, 0, c.width, c.height);
      const d = frame.data;
      const corners = [
        0,
        (c.width - 1) * 4,
        (c.height - 1) * c.width * 4,
        ((c.height - 1) * c.width + c.width - 1) * 4,
      ];
      const matteLikely =
        opts.forceKey ||
        corners.every(
          (i) => d[i] < threshold && d[i + 1] < threshold && d[i + 2] < threshold && d[i + 3] > 200
        );
      if (matteLikely) {
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] <= threshold && d[i + 1] <= threshold && d[i + 2] <= threshold) {
            d[i + 3] = 0;
          }
        }
        cctx.putImageData(frame, 0, 0);
        img._keyed = c;
      }
    } catch {
      /* ignore */
    }
  };
  img.src = src;
  return img;
}

function spriteSource(img) {
  return img._keyed || img;
}

/**
 * One-time brightness bake (Canvas filters are brutal every frame).
 * Returns a canvas/image ready to draw without `ctx.filter`.
 */
function litSpriteSource(img, amount) {
  if (!img) return img;
  const src = spriteSource(img);
  const srcTag = img._keyed ? 'k' : 'r';
  if (img._litAmount === amount && img._litTag === srcTag && img._lit) return img._lit;
  const w = src.naturalWidth || src.width || 0;
  const h = src.naturalHeight || src.height || 0;
  if (!(w > 0 && h > 0)) return src;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cctx = c.getContext('2d');
  cctx.imageSmoothingEnabled = false;
  cctx.filter = `brightness(${amount})`;
  cctx.drawImage(src, 0, 0);
  cctx.filter = 'none';
  img._lit = c;
  img._litAmount = amount;
  img._litTag = srcTag;
  return c;
}

/** Boulder revolutions per full walk cycle — keeps roll tied to stride length. */
const BOULDER_TURNS_PER_WALK_CYCLE = 0.55;
/** Last frame hold vs a normal frame (1 = equal). */
const BOULDER_ROLL_LAST_FRAME_WEIGHT = 1;

/** Map [0,1) phase onto frame index; last frame gets a shorter slice. */
function boulderRollFrameIndex(turns, n) {
  if (n <= 1) return 0;
  const lastW = BOULDER_ROLL_LAST_FRAME_WEIGHT;
  const total = n - 1 + lastW;
  let t = (((turns % 1) + 1) % 1) * total;
  for (let i = 0; i < n - 1; i++) {
    if (t < 1) return i;
    t -= 1;
  }
  return n - 1;
}

function drawBoulder(
  ctx,
  fallback,
  rollFrames,
  x,
  y,
  rollPhase,
  drawSize = 180,
  forcedFrame = null,
  nx = 0,
  ny = 1
) {
  const n = rollFrames.length;
  const turns = ((rollPhase % 1) + 1) % 1;
  const frame =
    forcedFrame == null
      ? boulderRollFrameIndex(turns, n)
      : ((forcedFrame % n) + n) % n;
  const img =
    rollFrames[frame] && (imageReady(rollFrames[frame]) || rollFrames[frame]._keyed)
      ? rollFrames[frame]
      : fallback;

  // Pixel-align — fractional translates blur even with smoothing off.
  const size = Math.round(drawSize);
  const dx = Math.round(x);
  const dy = Math.round(y);
  // PNG has transparent padding; solid rock only reaches ~BOULDER_SOLID_FRAC from center.
  // Clip must cut past that padding or you only trim empty pixels.
  const pad = Math.max(0, size * 0.5 - size * BOULDER_SOLID_FRAC);
  const sink = Math.round(pad + 1);
  const nLen = Math.hypot(nx, ny) || 1;
  const ix = -nx / nLen; // into the hill / path
  const iy = -ny / nLen;
  const intoAng = Math.atan2(iy, ix);

  ctx.save();
  ctx.translate(dx, dy);
  // Clip in path space: local +X = into hill — trim padding + 2px of solid.
  ctx.rotate(intoAng);
  ctx.beginPath();
  ctx.rect(-size / 2, -size / 2, size - sink, size);
  ctx.clip();
  ctx.rotate(-intoAng);

  // Mirror so the baked lighting / roll faces the climb direction.
  ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = false;

  const src = spriteSource(img);
  if (imageReady(img) || img._keyed) {
    ctx.drawImage(src, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = '#686b73';
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSisyphus(ctx, img, centerX, centerY, pulse, drawSize = 160, groundAngle = 0) {
  const stretch = 1 + pulse * 0.025;
  const squash = 1 - pulse * 0.018;
  const size = Math.max(1, Math.round(drawSize));

  const src = spriteSource(img);
  const ready = imageReady(img) || img._keyed;
  const shade = ensureSisyShadeCanvas(size, size);
  shade.setTransform(1, 0, 0, 1, 0, 0);
  shade.clearRect(0, 0, size, size);
  shade.imageSmoothingEnabled = false;

  if (ready) {
    // Brightness is prebaked — no per-frame Canvas filter.
    shade.drawImage(litSpriteSource(img, 1.22), 0, 0, size, size);

    // Darken hands → arms (source-atop). Box is 35×45 in native 96px art space.
    shade.globalCompositeOperation = 'source-atop';
    const native = 96;
    const boxW = (size * 35) / native;
    const boxH = (size * 45) / native;
    const boxX = 0;
    const boxY = (size * 12) / native;
    const g = shade.createLinearGradient(boxX, boxY + boxH * 0.45, boxX + boxW, boxY + boxH * 0.4);
    g.addColorStop(0, 'rgba(18, 8, 4, 0.92)');
    g.addColorStop(0.5, 'rgba(24, 10, 5, 0.84)');
    g.addColorStop(1, 'rgba(30, 13, 6, 0)');
    shade.fillStyle = g;
    shade.fillRect(boxX, boxY, boxW, boxH);
    shade.globalCompositeOperation = 'source-over';
  } else {
    shade.fillStyle = '#c45c2a';
    shade.fillRect(size * 0.25, size * 0.15, size * 0.5, size * 0.7);
  }

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(groundAngle);
  ctx.scale(stretch, squash);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(shade.canvas, -size / 2, -size / 2, size, size);
  ctx.restore();
}

/** Offscreen buffer so arm shade can use source-atop without tinting the scene. */
let _sisyShadeCanvas = null;
let _sisyShadeCtx = null;
function ensureSisyShadeCanvas(w, h) {
  if (!_sisyShadeCanvas || _sisyShadeCanvas.width !== w || _sisyShadeCanvas.height !== h) {
    _sisyShadeCanvas = document.createElement('canvas');
    _sisyShadeCanvas.width = w;
    _sisyShadeCanvas.height = h;
    _sisyShadeCtx = _sisyShadeCanvas.getContext('2d');
  }
  return _sisyShadeCtx;
}

/** Tiny stamp for nearest-neighbor contact shadows (built once). */
let _shadowStampCanvas = null;
function ensureShadowStamp(pw, ph) {
  if (_shadowStampCanvas && _shadowStampCanvas.width === pw && _shadowStampCanvas.height === ph) {
    return _shadowStampCanvas;
  }
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  const s = c.getContext('2d');
  // Core sits left of center so falloff stretches longer to the right
  // (light from top-left → cast toward bottom-right).
  const cxp = (pw - 1) * 0.32;
  const cyp = (ph - 1) * 0.5;
  const rxLeft = pw * 0.28;
  const rxRight = pw * 0.58;
  const ry = ph * 0.42;
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const rx = px < cxp ? rxLeft : rxRight;
      const dx = (px - cxp) / rx;
      const dy = (py - cyp) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const ring = Math.min(11, Math.floor(d * 12));
      const t = ring / 11;
      const a = 0.28 + (1 - t) * 0.55;
      const r = 36 - (1 - t) * 20;
      const g = 18 - (1 - t) * 10;
      const b = 10 - (1 - t) * 5;
      s.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`;
      s.fillRect(px, py, 1, 1);
    }
  }
  _shadowStampCanvas = c;
  return c;
}
