/**
 * render.js — Tracking camera + crisp pixel-art climb scene.
 *
 * Hill is a 256×256 repeatable strip (hill-tile.png). Rock fills under the
 * path. Measured seam: right-neighbor at (+256, +128) (path descends L→R).
 * Climbing uphill is the opposite way (left + up). Hill is drawn at 2× the
 * boulder’s source-pixel scale so the denser rock art reads chunkier.
 *
 * CRITICAL: imageSmoothingEnabled = false so pixel art stays sharp.
 */

import { summitDistanceFor } from './formulas.js';

const SISYPHUS_SRC = '/sisyphus.png';
const BOULDER_SRC = '/boulder.png';
const BACKGROUND_SRC = '/background.png?v=4';
const HILL_TILE_SRC = '/hill-tile.png';

const ART_W = 1536;
const ART_H = 864;

/**
 * Actor sizes as a fraction of canvas height.
 * Boulder is sized independently; Sisyphus stays at 75% of the *previous*
 * boulder size so enlarging the rock does not enlarge him.
 */
const BOULDER_HEIGHT_RATIO = 0.6035; // 0.71 × 0.85
const BOULDER_MIN = 302;
const SISY_HEIGHT_RATIO = 0.3876; // 0.456 × 0.85
const SISY_MIN = 194;

/** Screen center = where Sisyphus’s palms meet the boulder. */
const CONTACT_X_RATIO = 0.5;
const CONTACT_Y_RATIO = 0.5;
/** Nudge the whole climb scene down so the underfill doesn’t peek. */
const SCENE_Y_NUDGE = 70;
/** Extra actor-only offset (hill stays put) — right + down on the tile face. */
const ACTOR_OFFSET_X = 90;
const ACTOR_OFFSET_Y = 70;

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
const TILE_STEP_Y = 128;
/** Walking-surface Y at left edge (tan path top ≈ 3px). */
const PATH_Y_LEFT = 4;
/** Boulder PNG size — baseline for shared pixel sizing. */
const BOULDER_NATIVE = 256;
/** Hill art is denser; multiply so each source px reads chunkier on screen. */
const HILL_SCALE_MULT = 2;
/** Lead-in tiles past the start (downslope) so actors aren’t hanging off the strip. */
const EXTRA_BASE_TILES = 2;

/** Distant underworld peaks scroll slower than the climb path. */
const BG_PARALLAX = 0.18;
const BG_PARALLAX_X = 0.12;

const UNDERFILL = '#241830';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const sisyphus = loadImageKeyed(SISYPHUS_SRC, 18);
  const boulder = loadImageKeyed(BOULDER_SRC, 12);
  const background = loadImage(BACKGROUND_SRC);
  // Tile has rock on one corner, so force-key near-black instead of corner detect.
  const hillTile = loadImageKeyed(HILL_TILE_SRC, 14, { forceKey: true });

  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  let boulderDraw = BOULDER_MIN;
  let sisyDraw = SISY_MIN;

  /** Smoothed camera offset (world → screen). */
  let camSmoothX = 0;
  let camSmoothY = 0;
  let camInitialized = false;

  /** Brown dust kicked up on push (screen-space). */
  const dust = [];
  const DUST_COLORS = ['#6b4423', '#8a5a2b', '#a07040', '#5c3a22', '#7a5230'];

  function burstDust(state, opts = {}) {
    if (cssW < 2 || cssH < 2) return;
    const summitDist = summitDistanceFor(state.meta.summits);
    const progress = Math.min(
      1,
      Math.max(0, (state.run.visualDistance ?? state.run.distance) / summitDist)
    );
    const cam = computeCamera(progress, { smooth: true });

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

    const count = 14 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const speed = 60 + Math.random() * 160;
      // Random spray in all directions (left, right, up, down).
      const angle = Math.random() * Math.PI * 2;
      const life = 0.4 + Math.random() * 0.45;
      dust.push({
        x: ox + (Math.random() - 0.5) * 18,
        y: oy + (Math.random() - 0.5) * 14,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 8,
        color: DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0],
      });
    }
    if (dust.length > 96) dust.splice(0, dust.length - 96);
  }

  function updateDust(dt) {
    for (let i = dust.length - 1; i >= 0; i--) {
      const p = dust[i];
      p.life -= dt;
      if (p.life <= 0) {
        dust.splice(i, 1);
        continue;
      }
      p.vy += 260 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.8);
    }
  }

  function drawDust(c) {
    c.save();
    c.imageSmoothingEnabled = false;
    for (const p of dust) {
      const a = Math.max(0, p.life / p.maxLife);
      c.globalAlpha = a * a;
      c.fillStyle = p.color;
      c.fillRect((p.x | 0), (p.y | 0), p.size, p.size);
    }
    c.restore();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.floor(rect.width));
    cssH = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    boulderDraw = Math.max(BOULDER_MIN, Math.round(cssH * BOULDER_HEIGHT_RATIO));
    sisyDraw = Math.max(SISY_MIN, Math.round(cssH * SISY_HEIGHT_RATIO));
    camInitialized = false;
  }

  /** Chunky hill pixels (denser art than the boulder, so scale up harder). */
  function tileScale() {
    return Math.max(2, (boulderDraw / BOULDER_NATIVE) * HILL_SCALE_MULT);
  }

  /**
   * World space: tile 0 (base) top-left at (0,0).
   * Higher tile index = further uphill (left + up).
   */
  function hillMetrics() {
    const s = tileScale();
    const tile = TILE_NATIVE * s;
    const stepX = TILE_STEP_X * s;
    const stepY = TILE_STEP_Y * s;
    const upX = -stepX;
    const upY = -stepY;
    const pathYLeft = PATH_Y_LEFT * s;

    const span = Math.max(cssW, cssH) * 14;
    const perTile = Math.hypot(stepX, stepY);
    const n = Math.max(28, Math.ceil(span / perTile));

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
    const m = hillMetrics();

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
        const lerp = 0.1;
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

    return {
      along: { x: gx, y: gy },
      angle: Math.atan2(ty, tx),
      groundAngle,
      bx,
      by,
      sx,
      sy,
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
   * Distant painted backdrop (high-res). Cover the viewport height with
   * smoothed scaling — keeps atmosphere clean while sprites stay nearest-neighbor.
   * Horizontal parallax shifts within the image when it's wide enough; otherwise tiles.
   */
  function drawTiledBackground(cam) {
    if (!imageReady(background)) return;
    const w = cssW;
    const h = cssH;
    const imgW = background.naturalWidth || ART_W;
    const imgH = background.naturalHeight || ART_H;
    if (imgW < 2 || imgH < 2) return;

    const scale = h / imgH;
    const drawW = imgW * scale;
    const drawH = h;

    const scrollX = cam.worldXOffset * BG_PARALLAX_X;

    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';

    if (drawW >= w) {
      const maxShift = drawW - w;
      const shift = ((scrollX % (maxShift + 1)) + (maxShift + 1)) % (maxShift + 1);
      ctx.drawImage(background, -shift, 0, drawW, drawH);
    } else {
      const offsetX = ((scrollX % drawW) + drawW) % drawW;
      for (let x = -offsetX - drawW; x < w + drawW; x += drawW) {
        ctx.drawImage(background, x, 0, drawW, drawH);
      }
    }

    ctx.imageSmoothingEnabled = false;
  }

  function drawTiledHill(cam) {
    const m = cam.metrics;
    const w = cssW;
    const h = cssH;
    const src = spriteSource(hillTile);

    // Solid mass under the path (extends into the lead-in tiles).
    const leadFrac = (m.extraBase + 0.5) / Math.max(1, m.n - 1);
    const a = slopePointOnScreen(-leadFrac, cam, false);
    const b = slopePointOnScreen(1.08, cam, false);
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

    const margin = m.tile * 1.5;
    ctx.imageSmoothingEnabled = false;
    ctx.filter = 'brightness(1.18)';

    // Negative indices = extra tiles before the start (downslope lead-in).
    for (let i = -m.extraBase; i < m.n; i++) {
      const wx = i * m.upX;
      const wy = i * m.upY;
      const sx = cam.originX + wx;
      const sy = cam.originY + wy;
      if (sx + m.tile < -margin || sx > w + margin) continue;
      if (sy + m.tile < -margin || sy > h + margin) continue;
      ctx.drawImage(src, sx, sy, m.tile, m.tile);
    }
    ctx.filter = 'none';
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
    const cam = computeCamera(progress, { smooth: true });
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

    drawBoulder(ctx, boulder, actors.bx, actors.by, state.run.boulderRotation, pulse, actors.boulderDraw);
    drawSisyphus(ctx, sisyphus, actors.sx, actors.sy, pulse, actors.sisyDraw, actors.groundAngle);

    updateDust(dt);
    drawDust(ctx);

    const vig = ctx.createRadialGradient(w * 0.4, h * 0.55, h * 0.2, w * 0.5, h * 0.5, h * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(8,6,14,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
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
    const cam = computeCamera(progress, { smooth: false });
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
    const cam = computeCamera(Math.max(0, Math.min(1, progress)), { smooth: false });
    const pathPx = cam.pathLen || 1;
    const r = Math.max(1, cam.boulderR);
    return -((meters / goal) * pathPx) / r;
  }

  return { resize, draw, burstDust, hitTestBoulder, rollRadiansForDistance, canvas, ctx, computeCamera };
}

// —— Helpers ——

function formatMeterLabel(meters) {
  if (meters >= 1000) return Math.round(meters / 1000) + 'km';
  return meters + 'm';
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

function drawBoulder(ctx, img, x, y, rotation, pulse, drawSize = 180) {
  const size = drawSize;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.imageSmoothingEnabled = false;
  ctx.filter = 'brightness(1.2)';

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
  const size = drawSize;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(groundAngle);
  ctx.scale(stretch, squash);
  ctx.imageSmoothingEnabled = false;
  ctx.filter = 'brightness(1.22)';

  const src = spriteSource(img);
  if (imageReady(img) || img._keyed) {
    ctx.drawImage(src, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = '#c45c2a';
    ctx.fillRect(-size * 0.25, -size * 0.35, size * 0.5, size * 0.7);
  }

  ctx.restore();
}
