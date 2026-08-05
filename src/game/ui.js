/**
 * ui.js — HUD dock (Defiance/Spite), meta overlays, summit bindings.
 */

import {
  RUN_UPGRADES,
  SKILL_TREE,
  HADES_LINES,
  upgradeCost,
  formatNumber,
  momentumMultiplier,
  summitDistanceFor,
  displayMeters,
  getPassiveRates,
  getDefiancePerSecond,
  isUpgradeUnlocked,
  isMilestonePurchase,
  prometheusSkill,
  daedalusSkill,
  hecateIntervalFor,
  skillPrereqsMet,
  skillPrereqBlurb,
  altitudePressurePct,
} from './formulas.js';
import {
  buyUpgrade,
  buyUpgradeMax,
  buySkillNode,
  canAffordUpgrade,
  canBuySkillNode,
  getLiveStats,
} from './state.js';

const TOOLTIP_DELAY_MS = 500;

/** Longer gameplay blurbs for hover tips (shop rows stay compact). */
const RUN_UPGRADE_TIPS = {
  callousedHands:
    'Raises Might. Each click shoves farther and earns more Defiance from the push.',
  spikedSandals:
    'Raises Traction. Turns the same Might into more Distance per click and helps idle allies that scale with Traction.',
  chalkedGrip:
    'Raises Grip. Altitude pressure wastes some of each shove as you climb — more Grip means more of the push still counts.',
  steadyRhythm:
    'Raises max Momentum boost. A full Momentum bar multiplies your clicks harder.',
  bloodTithe:
    'Raises base Defiance per meter. Grudge Ledger and Path of Profit multiply this base — buy Tithe to feed the multiplier.',
  grudgeLedger:
    'Multiplies Defiance from every meter. Works on Blood Tithe’s base rate, clicks, idle, and orbs.',
  shades:
    'Summons Shades for flat idle Distance — ranks climb 0.03, 0.06, 0.10, 0.14, 0.19… m/s — plus Defiance labor.',
  hermesSandals:
    'Hermes escorts the climb on the same stepped m/s ranks as Shades (0.03, 0.06, 0.10…). Full rate at full Momentum; fades when you go cold.',
  hecateOrbs:
    'Hecate periodically lobs an anti-gravity orb that spikes Distance (and some Defiance) on a timer.',
  relentlessTempo:
    'While holding click or Space, auto-pushes fire faster. Needs Sustained Strain unlocked.',
  prometheus:
    'Unlocks Fire (Q): a short window where every push deals more Distance and Defiance. Levels: stronger buff, shorter cooldown.',
  daedalus:
    'Unlocks Device (F): a modest Distance shove that also banks 5× your current Defiance/s. Levels: better shove, shorter cooldown.',
};

function skillEffectTip(effect) {
  if (!effect) return '';
  const bits = [];
  if (effect.might) bits.push(`Permanent +${Math.round(effect.might * 100)}% Might — stronger clicks.`);
  if (effect.traction) bits.push(`Permanent +${Math.round(effect.traction * 100)}% Traction — more meters per push.`);
  if (effect.colony) bits.push(`Permanent +${Math.round(effect.colony * 100)}% Colony — stronger Shade Distance & labor Defiance.`);
  if (effect.shadesPower) bits.push(`Shade idle +${Math.round(effect.shadesPower * 100)}% Distance & labor Defiance.`);
  if (effect.hermesPower) bits.push(`Hermes escort speed +${Math.round(effect.hermesPower * 100)}% (stronger with Momentum).`);
  if (effect.grip) bits.push(`Permanent +${Math.round(effect.grip * 100)}% Grip — fights altitude pressure so more of each shove counts.`);
  if (effect.profit) bits.push(`Permanent +${Math.round(effect.profit * 100)}% Profit multiplier — multiplies Defiance per meter.`);
  if (effect.momBoost) bits.push(`+${Math.round(effect.momBoost * 100)}% Momentum boost cap.`);
  if (effect.momBuild) bits.push(`+${Math.round(effect.momBuild * 100)}% Momentum gain per click.`);
  if (effect.momDelay) bits.push(`+${effect.momDelay}s before Momentum starts draining.`);
  if (effect.momFloor) bits.push(`Momentum no longer drains below ${Math.round(effect.momFloor * 100)}% once built.`);
  if (effect.holdClick) bits.push('Unlocks hold-to-push (hold click or Space to auto-shove).');
  if (effect.gripPierce) bits.push(`Cuts altitude pressure — keep ${Math.round(effect.gripPierce * 100)}% more of each high shove.`);
  if (effect.pressureResist) bits.push(`−${Math.round(effect.pressureResist * 100)}% altitude pressure on clicks.`);
  if (effect.runStipend) bits.push(`Each new run starts with +${effect.runStipend} Defiance (does not count toward Spite).`);
  if (effect.hecateIntervalMod) bits.push(`Hecate orbs arrive ${Math.abs(effect.hecateIntervalMod)}s sooner.`);
  if (effect.hecatePower) bits.push(`Hecate orbs deal +${Math.round(effect.hecatePower * 100)}% Distance/Defiance.`);
  if (effect.prometheusPower) bits.push(`Fire buff +${Math.round(effect.prometheusPower * 100)}% stronger.`);
  if (effect.prometheusCdMod) bits.push(`Fire cooldown ${effect.prometheusCdMod}s.`);
  if (effect.daedalusPower) bits.push(`Device shove +${Math.round(effect.daedalusPower * 100)}% farther.`);
  if (effect.daedalusCdMod) bits.push(`Device cooldown ${effect.daedalusCdMod}s.`);
  if (effect.stolenRite) bits.push('Auto-casts Fire and Device whenever they are off cooldown — true idle skills.');
  return bits.join(' ');
}

function treeNodeEffectLabel(effect, fallback = '') {
  if (!effect) return fallback;
  if (effect.might) return `Might +${Math.round(effect.might * 100)}%`;
  if (effect.traction) return `Traction +${Math.round(effect.traction * 100)}%`;
  if (effect.grip) return `Grip +${Math.round(effect.grip * 100)}%`;
  if (effect.colony) return `Colony +${Math.round(effect.colony * 100)}%`;
  if (effect.profit) return `Profit +${Math.round(effect.profit * 100)}%`;
  if (effect.momBoost) return `Momentum +${Math.round(effect.momBoost * 100)}%`;
  if (effect.momBuild) return `Build +${Math.round(effect.momBuild * 100)}%`;
  if (effect.momDelay) return `Buffer +${effect.momDelay}s`;
  if (effect.momFloor) return `Floor ${Math.round(effect.momFloor * 100)}%`;
  if (effect.holdClick) return 'Hold to push';
  if (effect.gripPierce) return `Keep +${Math.round(effect.gripPierce * 100)}%`;
  if (effect.pressureResist) return `Pressure -${Math.round(effect.pressureResist * 100)}%`;
  if (effect.runStipend) return `Start +${effect.runStipend}`;
  if (effect.hecateIntervalMod) return `Orb ${Math.abs(effect.hecateIntervalMod)}s sooner`;
  if (effect.hecatePower) return `Orbs +${Math.round(effect.hecatePower * 100)}%`;
  if (effect.hermesPower) return `Hermes +${Math.round(effect.hermesPower * 100)}%`;
  if (effect.shadesPower) return `Shades +${Math.round(effect.shadesPower * 100)}%`;
  if (effect.prometheusPower || effect.prometheusCdMod) return 'Fire upgrade';
  if (effect.daedalusPower || effect.daedalusCdMod) return 'Device upgrade';
  if (effect.stolenRite) return 'Auto-cast';
  return fallback;
}

export function createUI(state, hooks) {
  const els = {
    distance: document.getElementById('hud-distance'),
    distanceBar: document.getElementById('hud-distance-bar'),
    defiance: document.getElementById('hud-defiance'),
    spite: document.getElementById('hud-spite'),
    momentumPct: document.getElementById('hud-momentum-pct'),
    momentumBar: document.getElementById('hud-momentum-bar'),
    momentumStatus: document.getElementById('hud-momentum-status'),
    hudStats: document.getElementById('hud-stats'),
    shopDock: document.querySelector('.shop-dock'),
    shopDefiance: document.getElementById('shop-defiance'),
    shopSpite: document.getElementById('shop-spite'),
    shopBlurb: document.getElementById('shop-blurb'),
    spiteTreeOverlay: document.getElementById('spite-tree-overlay'),
    spiteTreeBackdrop: document.getElementById('spite-tree-backdrop'),
    spiteTreeClose: document.getElementById('spite-tree-close'),
    spiteTreeViewport: document.getElementById('spite-tree-viewport'),
    spiteTreeWorld: document.getElementById('spite-tree-world'),
    spiteTreeSpite: document.getElementById('spite-tree-spite'),
    btnSettings: document.getElementById('btn-settings'),
    btnStats: document.getElementById('btn-stats'),
    metaOverlay: document.getElementById('meta-overlay'),
    metaBackdrop: document.getElementById('meta-backdrop'),
    metaClose: document.getElementById('meta-close'),
    metaTitle: document.getElementById('meta-title'),
    panelStats: document.getElementById('panel-stats'),
    panelSettings: document.getElementById('panel-settings'),
    overlay: document.getElementById('summit-overlay'),
    summitTitle: document.getElementById('summit-title'),
    summitQuote: document.getElementById('summit-quote'),
    summitReward: document.getElementById('summit-reward'),
    summitContinue: document.getElementById('summit-continue'),
    btnPrometheus: document.getElementById('btn-prometheus'),
    btnDaedalus: document.getElementById('btn-daedalus'),
    prometheusCd: document.getElementById('prometheus-cd'),
    daedalusCd: document.getElementById('daedalus-cd'),
    skillStatus: document.getElementById('skill-status'),
  };

  let openMeta = null; // 'stats' | 'settings' | null
  let spiteTreeOpen = false;
  let spiteSelected = null; // branchId string
  let tipTimer = 0;
  let tipEl = null;
  let tipAnchor = null;
  let spiteChromeBound = false;

  /** Spite tree — 18 nodes matching the prerequisite flowchart. */
  const SPITE_TREE_W = 1280;
  const SPITE_TREE_H = 1400;
  // Wide layout: tight base column, then mid tiers side-by-side (not stacked).
  const SPITE_COL = { base: 150, midA: 420, midB: 700, tip: 1000 };
  const SPITE_ROW0 = 160;
  const SPITE_ROW = 185; // vertical gap between base branches
  const SPITE_NODE_POS = {
    // —— Base unlocks (column) ——
    might: { x: SPITE_COL.base, y: SPITE_ROW0 },
    traction: { x: SPITE_COL.base, y: SPITE_ROW0 + SPITE_ROW },
    grip: { x: SPITE_COL.base, y: SPITE_ROW0 + SPITE_ROW * 2 },
    momentum: { x: SPITE_COL.base, y: SPITE_ROW0 + SPITE_ROW * 3 },
    colony: { x: SPITE_COL.base, y: SPITE_ROW0 + SPITE_ROW * 4 },
    profit: { x: SPITE_COL.base, y: SPITE_ROW0 + SPITE_ROW * 5 },
    hecateInterval: { x: SPITE_COL.base, y: SPITE_ROW0 + SPITE_ROW * 6 },

    // —— Might row: Spark | Cog → Stolen Rite ——
    sparkTheft: { x: SPITE_COL.midA, y: SPITE_ROW0 },
    cogTheft: { x: SPITE_COL.midB, y: SPITE_ROW0 },
    stolenRite: { x: SPITE_COL.tip, y: SPITE_ROW0 },

    // —— Grip fork: Altitude above, Sure Hold below (both from Grip) ——
    altitudeResist: { x: SPITE_COL.midB, y: SPITE_ROW0 + SPITE_ROW * 2 - 160 },
    sureHold: { x: SPITE_COL.midB, y: SPITE_ROW0 + SPITE_ROW * 2 + 35 },

    // —— Momentum row: Strain → Floor ——
    sustainedStrain: { x: SPITE_COL.midA, y: SPITE_ROW0 + SPITE_ROW * 3 },
    echo: { x: SPITE_COL.tip, y: SPITE_ROW0 + SPITE_ROW * 3 },

    // —— Colony row: Hermes | Shades ——
    hermes: { x: SPITE_COL.midA, y: SPITE_ROW0 + SPITE_ROW * 4 },
    shades: { x: SPITE_COL.midB, y: SPITE_ROW0 + SPITE_ROW * 4 },

    // —— Profit row: Stipend ——
    runStipend: { x: SPITE_COL.midA, y: SPITE_ROW0 + SPITE_ROW * 5 },

    // —— Hecate row: Orb Power ——
    hecatePower: { x: SPITE_COL.midA, y: SPITE_ROW0 + SPITE_ROW * 6 },
  };
  const SPITE_BRANCH_SHORT = {
    might: 'Knuckle Dust',
    traction: 'Iron Sole',
    grip: 'Tight Squeeze',
    momentum: 'Second Wind',
    colony: 'Whisper Choir',
    profit: 'Cursed Interest',
    hecateInterval: 'Bewitching Tick',
    sureHold: 'Sure Hold',
    altitudeResist: 'Thin Air',
    sustainedStrain: 'Sustained Strain',
    echo: 'Residual Momentum',
    hermes: 'Gale Step',
    shades: 'Damned Union',
    runStipend: 'Pocket Change',
    hecatePower: 'Celestial Bounty',
    sparkTheft: 'Stolen Fire',
    cogTheft: 'Flywheel',
    stolenRite: 'Stolen Rite',
  };
  const SPITE_BRANCH_COLOR = {
    might: '#e07070',
    traction: '#70a8e0',
    grip: '#e0c070',
    momentum: '#c070e0',
    echo: '#a090d8',
    profit: '#e09050',
    altitudeResist: '#b0a090',
    colony: '#70c090',
    hermes: '#70d0c8',
    shades: '#70c090',
    hecateInterval: '#9080e0',
    hecatePower: '#9080e0',
    sureHold: '#e0c070',
    sustainedStrain: '#c070e0',
    runStipend: '#e09050',
    sparkTheft: '#e080a0',
    cogTheft: '#e080a0',
    stolenRite: '#e080a0',
  };
  const SPITE_BRANCH_ICON = {
    might: '/assets/SkillIcons/muscle-node.png',
    traction: '/assets/SkillIcons/sandal.png',
  };
  const SPITE_LINK_COLOR = '#c9a227';
  /** Node box is taller than the icon square — links aim at the square, not the labels. */
  const SPITE_SQUARE = 86;
  const SPITE_NODE_H = 168;
  const SPITE_SQUARE_Y_OFFSET = SPITE_NODE_H / 2 - SPITE_SQUARE / 2;

  function spiteNodeCenter(branchId) {
    const p = SPITE_NODE_POS[branchId];
    return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
  }

  /** Center of the 86×86 icon/plate (above the text block). */
  function spiteSquareCenter(branchId) {
    const p = spiteNodeCenter(branchId);
    return { x: p.x, y: p.y - SPITE_SQUARE_Y_OFFSET };
  }

  let treePanX = 0;
  let treePanY = 0;
  let treeZoom = 1;
  let treeDragging = false;
  let treeDragMoved = false;
  let treeLastX = 0;
  let treeLastY = 0;

  buildDefianceShop();
  buildSpiteShop();
  buildSettingsPanel();
  bindShopTabs();
  bindMeta();
  bindResponsiveShopScale();

  els.summitContinue.addEventListener('click', () => hooks.onSummitContinue());
  els.btnPrometheus?.addEventListener('click', () => hooks.onCastPrometheus?.());
  els.btnDaedalus?.addEventListener('click', () => hooks.onCastDaedalus?.());

  els.shopDefiance?.addEventListener('scroll', hideShopTooltip, { passive: true });
  els.shopSpite?.addEventListener('scroll', hideShopTooltip, { passive: true });
  window.addEventListener('blur', hideShopTooltip);

  function bindResponsiveShopScale() {
    let frame = 0;

    const update = () => {
      frame = 0;
      if (!els.shopDock || !els.hudStats) return;

      // Measure at full size, then continuously scale to fit between the
      // top-right stats and the bottom edge of the viewport.
      els.shopDock.style.zoom = '1';
      const statsRect = els.hudStats.getBoundingClientRect();
      const dockRect = els.shopDock.getBoundingClientRect();
      const overlapsHorizontally =
        dockRect.right > statsRect.left && dockRect.left < statsRect.right;
      const availableHeight = dockRect.bottom - statsRect.bottom - 12;
      const fitScale = availableHeight / Math.max(1, dockRect.height);
      const scale = overlapsHorizontally
        ? Math.max(0.8, Math.min(1, fitScale))
        : 1;

      els.shopDock.style.zoom = String(scale);
    };

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    window.addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule);
    schedule();
  }

  function ensureTooltip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'shop-tooltip';
    tipEl.hidden = true;
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function hideShopTooltip() {
    if (tipTimer) {
      clearTimeout(tipTimer);
      tipTimer = 0;
    }
    tipAnchor = null;
    if (tipEl) tipEl.hidden = true;
  }

  function placeShopTooltip(anchor) {
    const tip = ensureTooltip();
    const rect = anchor.getBoundingClientRect();
    const pad = 10;
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left - tipRect.width - 12;
    let top = rect.top + rect.height / 2 - tipRect.height / 2;
    if (left < pad) left = rect.right + 12;
    if (left + tipRect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - tipRect.width - pad);
    }
    if (top < pad) top = pad;
    if (top + tipRect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - tipRect.height - pad);
    }
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function showShopTooltip(anchor, { title, stat, body }) {
    const tip = ensureTooltip();
    tipAnchor = anchor;
    tip.innerHTML = `
      <div class="shop-tooltip-name">${title}</div>
      ${stat ? `<div class="shop-tooltip-stat">${stat}</div>` : ''}
      <div class="shop-tooltip-body">${body}</div>
    `;
    tip.hidden = false;
    // Measure after paint so placement uses real size.
    requestAnimationFrame(() => {
      if (tipAnchor === anchor && !tip.hidden) placeShopTooltip(anchor);
    });
  }

  function bindShopTooltip(row, getContent) {
    row.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      hideShopTooltip();
      tipTimer = window.setTimeout(() => {
        tipTimer = 0;
        showShopTooltip(row, getContent());
      }, TOOLTIP_DELAY_MS);
    });
    row.addEventListener('pointerleave', hideShopTooltip);
    row.addEventListener('pointerdown', hideShopTooltip);
    row.addEventListener('focus', () => {
      hideShopTooltip();
      tipTimer = window.setTimeout(() => {
        tipTimer = 0;
        showShopTooltip(row, getContent());
      }, TOOLTIP_DELAY_MS);
    });
    row.addEventListener('blur', hideShopTooltip);
  }
  function bindShopTabs() {
    document.querySelectorAll('.shop-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.shop;
        setShopTab(id);
      });
    });
  }

  function setShopTab(id) {
    document.querySelectorAll('.shop-tab').forEach((t) => {
      const on = t.dataset.shop === id;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    els.shopDefiance.classList.toggle('active', id === 'defiance');
    els.shopDefiance.hidden = id !== 'defiance';
    els.shopSpite.classList.toggle('active', id === 'spite');
    els.shopSpite.hidden = id !== 'spite';
    els.shopBlurb.textContent =
      id === 'defiance' ? 'Resets on summit' : 'Permanent · survives descent';
    hideShopTooltip();
    if (id === 'spite') openSpiteTree();
    else closeSpiteTree();
  }

  function applyTreeTransform() {
    if (!els.spiteTreeWorld) return;
    els.spiteTreeWorld.style.transform = `translate(${treePanX}px, ${treePanY}px) scale(${treeZoom})`;
  }

  function openSpiteTree() {
    if (!els.spiteTreeOverlay) return;
    spiteTreeOpen = true;
    els.spiteTreeOverlay.hidden = false;
    treePanX = 0;
    treePanY = 0;
    refreshSpiteTree();
    // Measure after the overlay is visible so height is real.
    requestAnimationFrame(() => {
      const vp = els.spiteTreeViewport;
      const viewH = Math.max(1, vp?.clientHeight || window.innerHeight * 0.85);
      const pad = 20;
      treeZoom = Math.min(1.45, Math.max(0.55, (viewH - pad) / SPITE_TREE_H));
      applyTreeTransform();
    });
  }

  function closeSpiteTree() {
    if (!els.spiteTreeOverlay) return;
    spiteTreeOpen = false;
    els.spiteTreeOverlay.hidden = true;
    spiteSelected = null;
    hideShopTooltip();
  }

  function bindSpiteTreeChrome() {
    if (spiteChromeBound) return;
    spiteChromeBound = true;
    els.spiteTreeClose?.addEventListener('click', () => setShopTab('defiance'));
    els.spiteTreeBackdrop?.addEventListener('click', () => setShopTab('defiance'));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && spiteTreeOpen) {
        e.preventDefault();
        setShopTab('defiance');
      }
    });

    const vp = els.spiteTreeViewport;
    if (!vp) return;

    vp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      treeDragging = true;
      treeDragMoved = false;
      treeLastX = e.clientX;
      treeLastY = e.clientY;
      vp.classList.add('is-panning');
      vp.setPointerCapture?.(e.pointerId);
    });
    vp.addEventListener('pointermove', (e) => {
      if (!treeDragging) return;
      const dx = e.clientX - treeLastX;
      const dy = e.clientY - treeLastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) treeDragMoved = true;
      treeLastX = e.clientX;
      treeLastY = e.clientY;
      treePanX += dx;
      treePanY += dy;
      applyTreeTransform();
    });
    const endPan = (e) => {
      if (!treeDragging) return;
      treeDragging = false;
      vp.classList.remove('is-panning');
      try {
        vp.releasePointerCapture?.(e.pointerId);
      } catch (_) {
        /* already released */
      }
    };
    vp.addEventListener('pointerup', endPan);
    vp.addEventListener('pointercancel', endPan);
    vp.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        treeZoom = Math.max(0.55, Math.min(1.45, treeZoom * factor));
        applyTreeTransform();
      },
      { passive: false }
    );
  }

  function bindMeta() {
    els.btnStats.addEventListener('click', () => toggleMeta('stats'));
    els.btnSettings.addEventListener('click', () => toggleMeta('settings'));
    els.metaClose.addEventListener('click', () => closeMeta());
    els.metaBackdrop.addEventListener('click', () => closeMeta());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && openMeta) {
        e.preventDefault();
        closeMeta();
      }
    });
  }

  function toggleMeta(kind) {
    if (openMeta === kind) {
      closeMeta();
      return;
    }
    openMeta = kind;
    els.metaOverlay.hidden = false;
    els.metaTitle.textContent = kind === 'stats' ? 'Stats' : 'Settings';
    els.panelStats.hidden = kind !== 'stats';
    els.panelSettings.hidden = kind !== 'settings';
    els.btnStats.setAttribute('aria-pressed', kind === 'stats' ? 'true' : 'false');
    els.btnSettings.setAttribute('aria-pressed', kind === 'settings' ? 'true' : 'false');
    if (kind === 'stats') renderStats(getLiveStats(state));
  }

  function closeMeta() {
    openMeta = null;
    els.metaOverlay.hidden = true;
    els.btnStats.setAttribute('aria-pressed', 'false');
    els.btnSettings.setAttribute('aria-pressed', 'false');
    hideShopTooltip();
  }

  function buildDefianceShop() {
    els.shopDefiance.innerHTML = '';
    const sections = [
      { id: 'active', title: 'Active' },
      { id: 'passive', title: 'Passive' },
      { id: 'skills', title: 'Skills' },
    ];

    for (const section of sections) {
      const wrap = document.createElement('section');
      wrap.className = 'shop-section';
      wrap.dataset.lane = section.id;
      wrap.innerHTML = `<h3 class="shop-section-title">${section.title}</h3>`;

      for (const def of Object.values(RUN_UPGRADES)) {
        if ((def.lane || 'active') !== section.id) continue;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'shop-row';
        row.dataset.upgrade = def.id;
        row.dataset.currency = 'defiance';
        row.innerHTML = `
          <span class="shop-row-main">
            <span class="shop-row-name">${def.name}</span>
            <span class="shop-row-meta" data-role="meta"></span>
          </span>
          <span class="shop-row-cost" data-role="cost">—</span>
        `;
        row.addEventListener('click', (e) => {
          if (e.ctrlKey || e.metaKey) {
            if (buyUpgradeMax(state, def.id) > 0) hooks.onStateChange();
          } else if (buyUpgrade(state, def.id)) {
            hooks.onStateChange();
          }
        });
        bindShopTooltip(row, () => {
          const level = state.run.upgrades[def.id] || 0;
          const milestone = isMilestonePurchase(level);
          const tip = RUN_UPGRADE_TIPS[def.id] || def.desc;
          const buyHint = 'Ctrl+click buys as many as you can afford.';
          return {
            title: def.name,
            stat: def.stat,
            body: milestone
              ? `${tip} Milestone buy: costs more, but this level is worth 1.5× a normal rank. ${buyHint}`
              : `${tip} Every 5th rank is a milestone (1.5× effect, higher cost). ${buyHint}`,
          };
        });
        wrap.appendChild(row);
      }

      els.shopDefiance.appendChild(wrap);
    }
  }

  function buildSpiteShop() {
    if (els.shopSpite) {
      els.shopSpite.innerHTML = `
        <p class="spite-tree-dock-note">
          The Spite skill tree opens fullscreen.<br />
          Rank nodes up · some paths unlock others.
        </p>
      `;
    }

    const world = els.spiteTreeWorld;
    if (!world) return;
    world.innerHTML = '';
    world.style.width = `${SPITE_TREE_W}px`;
    world.style.height = `${SPITE_TREE_H}px`;
    world.style.marginLeft = `${-SPITE_TREE_W / 2}px`;
    world.style.marginTop = `${-SPITE_TREE_H / 2}px`;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('spite-tree-svg');
    svg.setAttribute('viewBox', `0 0 ${SPITE_TREE_W} ${SPITE_TREE_H}`);

    const addLink = (x1, y1, x2, y2, branchId) => {
      const path = document.createElementNS(svgNS, 'path');
      path.classList.add('spite-tree-link');
      if (branchId) path.dataset.branch = branchId;
      // Elbow: out from parent, across, into child.
      const d =
        Math.abs(y1 - y2) < 4
          ? `M ${x1} ${y1} L ${x2} ${y2}`
          : `M ${x1} ${y1} L ${(x1 + x2) / 2} ${y1} L ${(x1 + x2) / 2} ${y2} L ${x2} ${y2}`;
      path.setAttribute('d', d);
      path.setAttribute('stroke', SPITE_LINK_COLOR);
      svg.appendChild(path);
    };

    // Prerequisite edges — attach to square edges, not the full node+text box.
    const sqHalf = SPITE_SQUARE / 2;
    for (const branch of Object.values(SKILL_TREE)) {
      if (!branch.requires?.length) continue;
      const to = spiteSquareCenter(branch.id);
      for (const req of branch.requires) {
        const from = spiteSquareCenter(req.branch);
        addLink(from.x + sqHalf, from.y, to.x - sqHalf, to.y, branch.id);
      }
    }

    for (const branch of Object.values(SKILL_TREE)) {
      const pos = SPITE_NODE_POS[branch.id];
      if (!pos) continue;
      const branchId = branch.id;
      const color = SPITE_BRANCH_COLOR[branchId] || '#c090c0';
      const short = SPITE_BRANCH_SHORT[branchId] || branch.name;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'spite-tree-node has-art';
      btn.dataset.branch = branchId;
      btn.style.left = `${pos.x}px`;
      btn.style.top = `${pos.y}px`;
      btn.style.setProperty('--branch-color', color);
      const iconSrc = SPITE_BRANCH_ICON[branchId];
      const artInner = iconSrc
        ? `<img class="spite-tree-node-icon" data-role="face" src="${iconSrc}" alt="" draggable="false" />`
        : `<span class="spite-tree-node-plate" style="--branch-color:${color}"><span class="spite-tree-node-glyph" data-role="face">${short.slice(0, 1)}</span></span>`;
      btn.innerHTML = `
          <span class="spite-tree-node-art">
            ${artInner}
            <span class="spite-tree-node-lock" data-role="lock" hidden aria-hidden="true">
              <svg viewBox="0 0 16 16" width="36" height="36" aria-hidden="true">
                <rect x="3" y="7" width="10" height="8" rx="1.5" fill="#1a1420" stroke="#f0d080" stroke-width="1.5"/>
                <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="#f0d080" stroke-width="1.5" stroke-linecap="round"/>
                <circle cx="8" cy="11" r="1.2" fill="#f0d080"/>
              </svg>
            </span>
          </span>
          <span class="spite-tree-node-meta">
            <span class="spite-tree-node-title">${short}</span>
            <span class="spite-tree-node-rank" data-role="rank">0/${branch.nodes.length}</span>
            <span class="spite-tree-node-effect" data-role="effect">${branch.stat}</span>
            <span class="spite-tree-node-cost" data-role="cost">—</span>
          </span>
        `;
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (treeDragMoved) return;
        const owned = state.meta.skills[branchId] || 0;
        if (
          owned < branch.nodes.length &&
          canBuySkillNode(state, branchId) &&
          !state.ui.summitPending
        ) {
          if (buySkillNode(state, branchId)) {
            spiteSelected = branchId;
            hooks.onStateChange();
            return;
          }
        }
        selectSpiteBranch(branchId);
      });
      bindShopTooltip(btn, () => {
        const owned = state.meta.skills[branchId] || 0;
        const next = branch.nodes[owned];
        const max = branch.nodes.length;
        const unlocked = skillPrereqsMet(state.meta.skills, branchId);
        if (!unlocked) {
          return {
            title: `${short} · Locked`,
            stat: branch.stat,
            body: `Requires ${skillPrereqBlurb(branchId)}.`,
          };
        }
        if (!next) {
          return {
            title: `${short} · MAX`,
            stat: branch.stat,
            body: 'This path is fully ranked.',
          };
        }
        return {
          title: `${short} · ${owned}/${max}`,
          stat: branch.stat,
          body: `Next: ${next.name} — ${skillEffectTip(next.effect) || next.desc}`,
        };
      });
      world.appendChild(btn);
    }

    world.insertBefore(svg, world.firstChild);
    bindSpiteTreeChrome();
    applyTreeTransform();
  }

  function selectSpiteBranch(branchId) {
    spiteSelected = branchId;
    refreshSpiteTree();
  }

  function refreshSpiteTree() {
    if (els.spiteTreeSpite) {
      els.spiteTreeSpite.textContent = formatNumber(state.meta.spite, 0);
    }
    if (!els.spiteTreeWorld) return;

    for (const branch of Object.values(SKILL_TREE)) {
      const owned = state.meta.skills[branch.id] || 0;
      const max = branch.nodes.length;
      const unlocked = skillPrereqsMet(state.meta.skills, branch.id);
      const can =
        unlocked &&
        owned < max &&
        canBuySkillNode(state, branch.id) &&
        !state.ui.summitPending;
      const maxed = owned >= max;

      els.spiteTreeWorld.querySelectorAll(`[data-branch="${branch.id}"]`).forEach((el) => {
        if (el.classList?.contains('spite-tree-link') || el.tagName === 'path') {
          el.classList.toggle('is-owned', owned > 0 || unlocked);
          return;
        }
        if (!el.classList?.contains('spite-tree-node')) return;
        const rankEl = el.querySelector('[data-role="rank"]');
        const effectEl = el.querySelector('[data-role="effect"]');
        const costEl = el.querySelector('[data-role="cost"]');
        const lockEl = el.querySelector('[data-role="lock"]');
        if (rankEl) rankEl.textContent = `${owned}/${max}`;
        const next = branch.nodes[owned];
        if (effectEl) {
          if (next) effectEl.textContent = treeNodeEffectLabel(next.effect, branch.stat);
          else effectEl.textContent = 'Complete';
        }
        if (costEl) {
          if (!unlocked) costEl.textContent = skillPrereqBlurb(branch.id);
          else costEl.textContent = next ? `${next.cost} Sp` : 'MAX';
        }
        if (lockEl) lockEl.hidden = unlocked;
        el.classList.toggle('is-locked', !unlocked);
        el.classList.toggle('is-owned', unlocked && owned > 0 && !maxed);
        el.classList.toggle('is-maxed', maxed);
        el.classList.toggle('is-next', unlocked && !maxed);
        el.classList.toggle('affordable', can);
        el.classList.toggle('is-selected', spiteSelected === branch.id);
        el.disabled = false;
      });
    }
  }

  function buildSettingsPanel() {
    els.panelSettings.innerHTML = `
      <p class="settings-note">Save is automatic. Use these if you want a clean slate.</p>
      <div class="settings-actions">
        <button type="button" id="settings-restart">Restart current run</button>
        <button type="button" id="settings-hard-reset" class="danger">Hard reset (wipe everything)</button>
      </div>
    `;
    els.panelSettings.querySelector('#settings-restart')?.addEventListener('click', () => {
      document.getElementById('debug-restart')?.click();
      closeMeta();
    });
    els.panelSettings.querySelector('#settings-hard-reset')?.addEventListener('click', () => {
      document.getElementById('debug-hard-reset')?.click();
      closeMeta();
    });
  }

  function refresh() {
    const stats = getLiveStats(state);
    const dist = state.run.distance;
    const summitDist = summitDistanceFor(state.meta.summits);
    const pct = Math.min(100, (dist / summitDist) * 100);

    els.distance.textContent = `${formatNumber(displayMeters(dist), 2)} / ${formatNumber(displayMeters(summitDist), 0)} m`;
    els.distanceBar.style.width = pct + '%';
    els.defiance.textContent = formatNumber(state.run.defiance, 0);
    els.spite.textContent = formatNumber(state.meta.spite, 0);

    const momPct = Math.round(state.run.momentum * 100);
    els.momentumPct.textContent = momPct + '%';
    els.momentumBar.style.width = momPct + '%';

    const momMult = momentumMultiplier(state.run.momentum, stats.momentumBoostCap);
    if (state.run.momentum >= 0.999) {
      els.momentumStatus.textContent = `MAX ×${momMult.toFixed(2)}`;
    } else if (state.run.momentumIdleTimer < stats.momentumDecayDelay && state.run.momentum > 0) {
      const left = (stats.momentumDecayDelay - state.run.momentumIdleTimer).toFixed(1);
      els.momentumStatus.textContent = `Buffer ${left}s`;
    } else if (
      stats.momentumFloor > 0 &&
      state.run.momentum > 0 &&
      state.run.momentum <= stats.momentumFloor + 0.001
    ) {
      els.momentumStatus.textContent = `Residual ${Math.round(stats.momentumFloor * 100)}%`;
    } else if (state.run.momentum > 0) {
      els.momentumStatus.textContent = 'Draining…';
    } else {
      els.momentumStatus.textContent = 'Idle';
    }

    const passiveRates = getPassiveRates(state, stats);
    const defiancePerSec = getDefiancePerSecond(state, stats);
    const activeMps = state.run.activePushSpeed || 0;
    const totalMps = activeMps + passiveRates.totalEffective;
    const pressurePct = altitudePressurePct(state, stats);
    const statRows = [
      ['Total speed', `${formatNumber(displayMeters(totalMps), 2)} m/s`],
      ['Passive speed', `${formatNumber(displayMeters(passiveRates.totalEffective), 2)} m/s`],
      ['Defiance/s', `${formatNumber(defiancePerSec, 2)}/s`],
      ['Altitude pressure', `${pressurePct.toFixed(1)}%`],
    ];
    if (els.hudStats) {
      els.hudStats.innerHTML = statRows
        .map(
          ([k, v]) =>
            `<div class="hud-stat"><span class="k">${k}</span><span class="v"><strong>${v}</strong></span></div>`
        )
        .join('');
    }

    // Defiance shop rows
    for (const def of Object.values(RUN_UPGRADES)) {
      const row = els.shopDefiance.querySelector(`[data-upgrade="${def.id}"]`);
      if (!row) continue;
      const level = state.run.upgrades[def.id] || 0;
      const unlocked = isUpgradeUnlocked(state, def);
      const cost = upgradeCost(def, level);
      const affordable = canAffordUpgrade(state, def.id);
      const meta = row.querySelector('[data-role="meta"]');
      const costEl = row.querySelector('[data-role="cost"]');

      row.classList.toggle('is-locked', !unlocked);
      if (!unlocked) {
        meta.textContent = skillGateBlurb(def);
        costEl.textContent = 'Locked';
        row.disabled = true;
        row.classList.remove('affordable', 'is-milestone');
      } else {
        meta.textContent = effectBlurb(def.id, level, stats);
        const milestone = isMilestonePurchase(level);
        const nextLv = level + 1;
        const lvLabel = milestone ? `Lv ${nextLv} ★` : `Lv ${nextLv}`;
        costEl.innerHTML = `${lvLabel} · ${formatNumber(cost, 0)} <img class="currency-icon currency-icon--inline" src="/icon-defiance.png?v=3" width="16" height="16" alt="" draggable="false" aria-hidden="true" />`;
        row.classList.toggle('is-milestone', milestone);
        row.disabled = !affordable || state.ui.summitPending;
        row.classList.toggle('affordable', affordable && !state.ui.summitPending);
      }
    }

    // Radial Spite tree (overlay)
    if (spiteTreeOpen) refreshSpiteTree();

    if (openMeta === 'stats') renderStats(stats);

    refreshSkillButtons(stats);

    els.overlay.hidden = !state.ui.summitPending;
  }

  function refreshSkillButtons(stats) {
    const pLv = stats.prometheusLevel || 0;
    const dLv = stats.daedalusLevel || 0;
    const pSkill = prometheusSkill(pLv);
    const dSkill = daedalusSkill(dLv);
    const pCd = state.run.prometheusCd || 0;
    const dCd = state.run.daedalusCd || 0;
    const buff = state.run.prometheusBuffTimer || 0;
    const fx = state.run.skillFx;

    if (els.btnPrometheus) {
      const ready = !!pSkill && pCd <= 0 && !state.ui.summitPending;
      const fireMult = pSkill
        ? pSkill.pushMult * (1 + (stats.prometheusPower || 0))
        : 0;
      els.btnPrometheus.disabled = !ready;
      els.btnPrometheus.classList.toggle('is-ready', ready);
      els.btnPrometheus.classList.toggle('is-buff', buff > 0);
      els.btnPrometheus.classList.toggle('is-auto', !!stats.stolenRite && !!pSkill);
      els.btnPrometheus.title = pSkill
        ? `Prometheus Fire (Q) — ×${fireMult.toFixed(2)} for ${pSkill.duration.toFixed(1)}s${stats.stolenRite ? ' · AUTO' : ''}`
        : 'Buy Prometheus Fire in Skills';
      if (els.prometheusCd) {
        els.prometheusCd.textContent = !pSkill
          ? '—'
          : pCd > 0
            ? `${Math.ceil(pCd)}s`
            : buff > 0
              ? 'HOT'
              : stats.stolenRite
                ? 'Auto'
                : 'Ready';
      }
    }

    if (els.btnDaedalus) {
      const ready = !!dSkill && dCd <= 0 && !state.ui.summitPending;
      const shove = dSkill
        ? dSkill.shoveMult * (1 + (stats.daedalusPower || 0))
        : 0;
      els.btnDaedalus.disabled = !ready;
      els.btnDaedalus.classList.toggle('is-ready', ready);
      els.btnDaedalus.classList.toggle('is-auto', !!stats.stolenRite && !!dSkill);
        els.btnDaedalus.title = dSkill
        ? `Daedalus' Device (F) — shove ×${shove.toFixed(1)}, +5× Def/s${stats.stolenRite ? ' · AUTO' : ''}`
        : "Buy Daedalus' Device in Skills";
      if (els.daedalusCd) {
        els.daedalusCd.textContent = !dSkill
          ? '—'
          : dCd > 0
            ? `${Math.ceil(dCd)}s`
            : stats.stolenRite
              ? 'Auto'
              : 'Ready';
      }
    }

    if (els.skillStatus) {
      els.skillStatus.classList.remove('is-prometheus', 'is-daedalus', 'is-crack');
      const toast = state.run.crackToast;
      const spot = state.run.crackSpot;
      if (toast && toast.t > 0) {
        els.skillStatus.hidden = false;
        els.skillStatus.classList.add('is-crack');
        els.skillStatus.textContent = `Crack hit — +${formatNumber(displayMeters(toast.distance), 1)} m · +${formatNumber(toast.defiance, 0)} Defiance`;
      } else if (buff > 0 && pSkill) {
        const fireMult = pSkill.pushMult * (1 + (stats.prometheusPower || 0));
        els.skillStatus.hidden = false;
        els.skillStatus.classList.add('is-prometheus');
        els.skillStatus.textContent = `Fire active — pushes ×${fireMult.toFixed(2)} · ${buff.toFixed(1)}s left`;
      } else if (fx && fx.kind === 'daedalus' && fx.t > 0 && dSkill) {
        els.skillStatus.hidden = false;
        els.skillStatus.classList.add('is-daedalus');
        const gained = state.run._lastDaedalusGain || 0;
        const defGained = state.run._lastDaedalusDef || 0;
        els.skillStatus.textContent =
          gained > 0 || defGained > 0
            ? `Device +${formatNumber(displayMeters(gained), 1)} m · +${formatNumber(defGained, 0)} Def`
            : `Device — shove ×${(dSkill.shoveMult * (1 + (stats.daedalusPower || 0))).toFixed(1)}`;
      } else if (spot && spot.life > 0) {
        els.skillStatus.hidden = false;
        els.skillStatus.classList.add('is-crack');
        els.skillStatus.textContent = `Crack open — click the glow · ${spot.life.toFixed(1)}s`;
      } else if (stats.stolenRite && (pSkill || dSkill)) {
        els.skillStatus.hidden = false;
        els.skillStatus.textContent = 'Stolen Rite — auto-casting when ready';
      } else {
        els.skillStatus.hidden = true;
        els.skillStatus.textContent = '';
      }
    }
  }

  function skillGateBlurb(def) {
    const req = def.requiresSkill;
    if (!req) return 'Locked';
    const branch = SKILL_TREE[req.branch];
    if (req.branch === 'sustainedStrain') {
      return 'Requires Sustained Strain';
    }
    const node = branch?.nodes[req.minLevel - 1];
    return `Requires ${node?.name || branch?.name || 'skill'}`;
  }

  function effectBlurb(id, level, stats) {
    switch (id) {
      case 'callousedHands':
        return `Might ×${stats.might.toFixed(2)}`;
      case 'spikedSandals':
        return `Traction ×${stats.traction.toFixed(2)}`;
      case 'shades': {
        const rates = getPassiveRates(state, stats);
        const labor = rates.shadeLaborPerSec || 0;
        return `${formatNumber(displayMeters(rates.shadesEffective), 2)} m/s · ${formatNumber(labor, 1)} Def/s`;
      }
      case 'hermesSandals': {
        const rates = getPassiveRates(state, stats);
        const momPct = Math.round((rates.hermesMomMult || 0) * 100);
        return `${formatNumber(displayMeters(rates.hermesEffective), 2)} m/s (${momPct}% mom)`;
      }
      case 'hecateOrbs': {
        const iv = hecateIntervalFor(stats);
        const t = Math.max(0, iv - (state.run.hecateTimer || 0));
        return `orb in ${t.toFixed(1)}s (${iv.toFixed(1)}s)`;
      }
      case 'chalkedGrip':
        return `Grip ${stats.gripCapacity.toFixed(1)}`;
      case 'steadyRhythm': {
        const cap = 1 + stats.momentumBoostCap;
        return `Momentum ×${cap.toFixed(2)}`;
      }
      case 'bloodTithe':
        return `${formatNumber(stats.defianceFlat, 2)} /m base`;
      case 'grudgeLedger':
        return `×${stats.profitMult.toFixed(2)} → ${formatNumber(stats.profit, 2)}/m`;
      case 'relentlessTempo': {
        const iv = stats.holdInterval;
        return iv ? `hold ${iv.toFixed(2)}s` : 'needs skill';
      }
      case 'prometheus': {
        const skill = prometheusSkill(level);
        if (!skill) return 'Buy to unlock Q';
        const mult = skill.pushMult * (1 + (stats.prometheusPower || 0));
        const cd = Math.max(12, skill.cooldown + (stats.prometheusCdMod || 0));
        return `×${mult.toFixed(2)} / ${skill.duration.toFixed(1)}s · CD ${cd.toFixed(0)}s`;
      }
      case 'daedalus': {
        const skill = daedalusSkill(level);
        if (!skill) return 'Buy to unlock F';
        const yank = skill.shoveMult * (1 + (stats.daedalusPower || 0));
        const cd = Math.max(18, skill.cooldown + (stats.daedalusCdMod || 0));
        return `shove ×${yank.toFixed(1)} · Def ×5/s · CD ${cd.toFixed(0)}s`;
      }
      default:
        return `Lv ${level}`;
    }
  }

  function renderStats(stats) {
    const passiveRates = getPassiveRates(state, stats);
    const activeMps = state.run.activePushSpeed || 0;
    const rows = [
      ['Distance', `${formatNumber(displayMeters(state.run.distance), 2)} / ${formatNumber(displayMeters(summitDistanceFor(state.meta.summits)), 0)} m`],
      ['Defiance (banked)', formatNumber(state.run.defiance, 0)],
      ['Defiance (this run earned)', formatNumber(state.run.runDefianceEarned, 0)],
      ['Spite', formatNumber(state.meta.spite, 0)],
      ['Summits completed', String(state.meta.summits)],
      ['Lifetime clicks', formatNumber(state.meta.totalClicks, 0)],
      ['Lifetime Defiance', formatNumber(state.meta.totalDefiance, 0)],
      ['Might', `×${stats.might.toFixed(3)}`],
      ['Traction', `×${stats.traction.toFixed(3)}`],
      ['Grip Capacity', stats.gripCapacity.toFixed(2)],
      ['Altitude pressure', `${altitudePressurePct(state, stats).toFixed(1)}%`],
      ['Colony Throughput', `${formatNumber(stats.colony, 3)} seed`],
      ['Active Push Speed', `${formatNumber(displayMeters(activeMps), 2)} m/s`],
      ['Idle', `${formatNumber(displayMeters(passiveRates.totalEffective), 2)} m/s`],
      ['Total speed', `${formatNumber(displayMeters(activeMps + passiveRates.totalEffective), 2)} m/s`],
      ['Hermes escort', `Lv ${stats.hermesLevel || 0} → ${formatNumber(displayMeters(passiveRates.hermesEffective), 2)} m/s (${Math.round((passiveRates.hermesMomMult || 0) * 100)}% mom)${stats.hermesPower > 0 ? ` (+${Math.round(stats.hermesPower * 100)}%)` : ''}`],
      ['Shade labor', stats.colony > 0 ? `${formatNumber(passiveRates.shadeLaborPerSec || 0, 2)} Def/s` : 'None'],
      ['Shade power', stats.shadesPower > 0 ? `+${Math.round(stats.shadesPower * 100)}%` : 'None'],
      ['Hecate orbs', stats.hecateLevel > 0 ? `Lv ${stats.hecateLevel} / every ${hecateIntervalFor(stats).toFixed(1)}s` : 'Not purchased'],
      ['Run stipend', stats.runStipend > 0 ? `+${Math.floor(stats.runStipend)} Defiance / run` : 'None'],
      ['Stolen Rite', stats.stolenRite ? 'Auto-casting skills' : 'Locked'],
      ['Defiance / m (base)', formatNumber(stats.defianceFlat, 3)],
      ['Profit multiplier', `×${stats.profitMult.toFixed(3)}`],
      ['Defiance / m (effective)', formatNumber(stats.profit, 3)],
      ['Defiance / s', `${formatNumber(getDefiancePerSecond(state, stats), 2)}/s`],
      ['Hold-to-push', stats.holdClick ? `Every ${stats.holdInterval.toFixed(2)}s while held` : 'Locked (Sustained Strain)'],
      ['Momentum fill', `${Math.round(state.run.momentum * 100)}%`],
      [
        'Momentum floor',
        stats.momentumFloor > 0
          ? `${Math.round(stats.momentumFloor * 100)}% residual (Path of Echo)`
          : 'None',
      ],
      ['Momentum boost cap', `+${(stats.momentumBoostCap * 100).toFixed(1)}%`],
      ['Momentum build / click', formatNumber(stats.momentumBuild, 3)],
      ['Decay delay buffer', `${stats.momentumDecayDelay.toFixed(2)} s`],
      ['Sure Hold', stats.gripPierce > 0 ? `−${(stats.gripPierce * 100).toFixed(0)}% altitude pressure leak` : 'None'],
      [
        'Pressure resist',
        stats.pressureResist > 0
          ? `−${Math.round(stats.pressureResist * 100)}% altitude pressure`
          : 'None',
      ],
      ['New Game+', state.meta.escaped ? 'Active (+50% output)' : 'Locked (summit 5)'],
    ];

    els.panelStats.innerHTML =
      `<p class="panel-intro">Live derived stats. Altitude pressure grows with the mountain, then soft-compresses on huge peaks so late Grip still matters. Path of the Mountain lowers it; Grip and Sure Hold keep more of each shove. Shades and Hermes are also softened by altitude. Distance never goes backward.</p>` +
      rows
        .map(
          ([label, value]) =>
            `<div class="stat-row"><span class="label">${label}</span><span class="value">${value}</span></div>`
        )
        .join('');
  }

  function showSummit(kind, spiteAward, summitIndex) {
    const nextLen = summitDistanceFor(summitIndex + 1);
    if (kind === 'victory') {
      els.summitTitle.textContent = 'Ultimate Defiance';
      els.summitQuote.textContent =
        `"Wait— that wasn't in the employee handbook!" You catch Hades mid-kick and hurl him down Mount Tartarus. Permanent +50% output. The boulder awaits — endlessly.`;
      els.summitReward.textContent = `Victory bonus unlocked · +${spiteAward} Spite · New Game+`;
      els.summitContinue.textContent = 'Begin Endless Ascent';
    } else {
      els.summitTitle.textContent = 'Corporate Performance Review';
      els.summitQuote.textContent = HADES_LINES[summitIndex % HADES_LINES.length];
      els.summitReward.textContent = `Spite awarded: +${spiteAward}  ·  Run upgrades wiped  ·  Hades drops you at the base of a ${formatNumber(displayMeters(nextLen), 0)} m climb`;
      els.summitContinue.textContent = 'Accept Review & Descend';
    }
    refresh();
  }

  return { refresh, showSummit, els };
}
