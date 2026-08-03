/**
 * ui.js — HUD dock (Defiance/Spite), meta overlays, summit bindings.
 */

import {
  RUN_UPGRADES,
  SKILL_TREE,
  HADES_LINES,
  HECATE_INTERVAL,
  upgradeCost,
  formatNumber,
  momentumMultiplier,
  summitDistanceFor,
  getPassiveRates,
  isUpgradeUnlocked,
} from './formulas.js';
import {
  buyUpgrade,
  buySkillNode,
  canAffordUpgrade,
  canBuySkillNode,
  getLiveStats,
} from './state.js';

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
    shopDefiance: document.getElementById('shop-defiance'),
    shopSpite: document.getElementById('shop-spite'),
    shopBlurb: document.getElementById('shop-blurb'),
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
  };

  let openMeta = null; // 'stats' | 'settings' | null

  buildDefianceShop();
  buildSpiteShop();
  buildSettingsPanel();
  bindShopTabs();
  bindMeta();

  els.summitContinue.addEventListener('click', () => hooks.onSummitContinue());

  function bindShopTabs() {
    document.querySelectorAll('.shop-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.shop;
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
      });
    });
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
  }

  function buildDefianceShop() {
    els.shopDefiance.innerHTML = '';
    const sections = [
      { id: 'active', title: 'Active' },
      { id: 'passive', title: 'Passive' },
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
        row.addEventListener('click', () => {
          if (buyUpgrade(state, def.id)) hooks.onStateChange();
        });
        wrap.appendChild(row);
      }

      els.shopDefiance.appendChild(wrap);
    }
  }

  function buildSpiteShop() {
    els.shopSpite.innerHTML = '';

    for (const branch of Object.values(SKILL_TREE)) {
      const wrap = document.createElement('div');
      wrap.className = 'branch-block';
      wrap.dataset.branch = branch.id;
      wrap.innerHTML = `
        <div class="branch-head">
          <div class="branch-title">${branch.name}</div>
          <div class="branch-sub">${branch.stat}</div>
        </div>
      `;

      branch.nodes.forEach((node, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'shop-row';
        row.dataset.nodeIndex = String(index);
        row.dataset.currency = 'spite';
        row.innerHTML = `
          <span class="shop-row-main">
            <span class="shop-row-name">${index + 1}. ${node.name}</span>
            <span class="shop-row-meta">${node.desc}</span>
          </span>
          <span class="shop-row-cost" data-role="cost">${node.cost} Spite</span>
        `;
        row.addEventListener('click', () => {
          if (state.meta.skills[branch.id] !== index) return;
          if (buySkillNode(state, branch.id)) hooks.onStateChange();
        });
        wrap.appendChild(row);
      });

      els.shopSpite.appendChild(wrap);
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

    els.distance.textContent = `${formatNumber(dist, 1)} / ${formatNumber(summitDist, 0)} m`;
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
    } else if (state.run.momentum > 0) {
      els.momentumStatus.textContent = 'Draining…';
    } else {
      els.momentumStatus.textContent = 'Idle';
    }

    const passiveRates = getPassiveRates(state, stats);
    let passiveValue = `${formatNumber(passiveRates.totalEffective, 2)}/s`;
    if (stats.hecateLevel > 0) {
      passiveValue += ` · Hec Lv ${stats.hecateLevel}`;
    }
    const statRows = [
      ['Might', `×${stats.might.toFixed(2)}`],
      ['Traction', `×${stats.traction.toFixed(2)}`],
      ['Grip', stats.gripCapacity.toFixed(1)],
      ['Profit', `×${stats.profit.toFixed(2)}`],
      ['Momentum', `×${momMult.toFixed(2)}`],
      ['Passive', passiveValue],
    ];
    if (stats.holdClick) {
      statRows.push(['Hold', `${stats.holdInterval.toFixed(2)}s`]);
    }
    if (state.meta.escaped) {
      statRows.push(['NG+', '×1.50']);
    }
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
        row.classList.remove('affordable');
      } else {
        meta.textContent = `Lv ${level} · ${effectBlurb(def.id, level, stats)}`;
        costEl.textContent = `${formatNumber(cost, 0)} Def`;
        row.disabled = !affordable || state.ui.summitPending;
        row.classList.toggle('affordable', affordable && !state.ui.summitPending);
      }
    }

    // Spite shop rows
    for (const branch of Object.values(SKILL_TREE)) {
      const wrap = els.shopSpite.querySelector(`[data-branch="${branch.id}"]`);
      if (!wrap) continue;
      const owned = state.meta.skills[branch.id] || 0;
      wrap.querySelectorAll('.shop-row').forEach((row, index) => {
        const isOwned = index < owned;
        const isNext = index === owned;
        const cost = branch.nodes[index].cost;
        const costEl = row.querySelector('[data-role="cost"]');
        row.classList.toggle('owned', isOwned);
        row.classList.toggle('affordable', false);
        if (isOwned) {
          costEl.textContent = 'Owned';
          row.disabled = true;
        } else if (isNext) {
          costEl.textContent = `${cost} Spite`;
          const can = canBuySkillNode(state, branch.id) && !state.ui.summitPending;
          row.disabled = !can;
          row.classList.toggle('affordable', can);
        } else {
          costEl.textContent = 'Locked';
          row.disabled = true;
        }
      });
    }

    if (openMeta === 'stats') renderStats(stats);

    els.overlay.hidden = !state.ui.summitPending;
  }

  function skillGateBlurb(def) {
    const req = def.requiresSkill;
    if (!req) return 'Locked';
    const branch = SKILL_TREE[req.branch];
    const node = branch?.nodes[req.minLevel - 1];
    return `Requires ${node?.name || 'skill'}`;
  }

  function effectBlurb(id, level, stats) {
    switch (id) {
      case 'callousedHands':
        return `Might ×${stats.might.toFixed(2)}`;
      case 'spikedSandals':
        return `Traction ×${stats.traction.toFixed(2)}`;
      case 'shades': {
        const rates = getPassiveRates(state, stats);
        return `${formatNumber(rates.shadesEffective, 2)} m/s`;
      }
      case 'hermesSandals': {
        const rates = getPassiveRates(state, stats);
        return `${formatNumber(rates.hermesEffective, 2)} m/s`;
      }
      case 'hecateOrbs': {
        const t = Math.max(0, HECATE_INTERVAL - (state.run.hecateTimer || 0));
        return `orb in ${t.toFixed(1)}s`;
      }
      case 'chalkedGrip':
        return `Grip ${stats.gripCapacity.toFixed(1)}`;
      case 'steadyRhythm': {
        const cap = 1 + stats.momentumBoostCap;
        return `cap ×${cap.toFixed(2)}`;
      }
      case 'grudgeLedger':
        return `Profit ×${stats.profit.toFixed(2)}`;
      case 'relentlessTempo': {
        const iv = stats.holdInterval;
        return iv ? `hold ${iv.toFixed(2)}s` : 'needs skill';
      }
      default:
        return `Lv ${level}`;
    }
  }

  function renderStats(stats) {
    const rows = [
      ['Distance', `${formatNumber(state.run.distance, 1)} / ${formatNumber(summitDistanceFor(state.meta.summits), 0)} m`],
      ['Defiance (banked)', formatNumber(state.run.defiance, 0)],
      ['Defiance (this run earned)', formatNumber(state.run.runDefianceEarned, 0)],
      ['Spite', formatNumber(state.meta.spite, 0)],
      ['Summits completed', String(state.meta.summits)],
      ['Lifetime clicks', formatNumber(state.meta.totalClicks, 0)],
      ['Lifetime Defiance', formatNumber(state.meta.totalDefiance, 0)],
      ['Might', `×${stats.might.toFixed(3)}`],
      ['Traction', `×${stats.traction.toFixed(3)}`],
      ['Grip Capacity', stats.gripCapacity.toFixed(2)],
      ['Colony Throughput', `${formatNumber(stats.colony, 3)} seed`],
      ['Active Push Speed', `${formatNumber(state.run.activePushSpeed || 0, 2)} m/s`],
      ['Idle (effective)', `${formatNumber(getPassiveRates(state, stats).totalEffective, 2)} m/s`],
      ['Hermes idle share', `${((stats.hermesConvert || 0) * 100).toFixed(0)}% → ${formatNumber(getPassiveRates(state, stats).hermesEffective, 2)} m/s`],
      ['Hecate orbs', stats.hecateLevel > 0 ? `Lv ${stats.hecateLevel} / every ${HECATE_INTERVAL}s` : 'Not purchased'],
      ['Profit Multiplier', `×${stats.profit.toFixed(3)}`],
      ['Hold-to-push', stats.holdClick ? `Every ${stats.holdInterval.toFixed(2)}s while held` : 'Locked (Sustained Strain)'],
      ['Momentum fill', `${Math.round(state.run.momentum * 100)}%`],
      ['Momentum boost cap', `+${(stats.momentumBoostCap * 100).toFixed(1)}%`],
      ['Momentum build / click', formatNumber(stats.momentumBuild, 3)],
      ['Decay delay buffer', `${stats.momentumDecayDelay.toFixed(2)} s`],
      ['New Game+', state.meta.escaped ? 'Active (+50% output)' : 'Locked (summit 5)'],
    ];

    els.panelStats.innerHTML =
      `<p class="panel-intro">Live derived stats. Grip soft-caps Distance conversion; Distance never decreases.</p>` +
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
      els.summitReward.textContent = `Spite awarded: +${spiteAward}  ·  Run upgrades wiped  ·  Hades drops you at the base of a ${formatNumber(nextLen, 0)} m climb`;
      els.summitContinue.textContent = 'Accept Review & Descend';
    }
    refresh();
  }

  return { refresh, showSummit, els };
}
