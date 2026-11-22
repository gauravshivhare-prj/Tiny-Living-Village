/**
 * js/ui.js
 * Owner: User Interface & Experience Specialist
 * 
 * Public API:
 *   - VILLAGE.ui.init(state): Binds DOM elements, buttons, tabs, hotbar, and tickers.
 *   - VILLAGE.ui.update(state, dt): Updates HUD numbers, active villager panel, and event feed.
 *   - VILLAGE.ui.openVillagerPanel(villager): Opens side inspection drawer.
 *   - VILLAGE.ui.closeVillagerPanel(): Closes side drawer.
 *   - VILLAGE.ui.renderVillagerPortrait(canvas, villager): Draws crisp pixel portrait on canvas.
 * 
 * State fields read/written:
 *   - Reads: state.resources, state.day, state.timeOfDay, state.weather, state.villagers, state.log, state.rumors
 *   - Writes: UI DOM elements
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.ui = {
  state: null,
  selectedVillager: null,
  activeTab: 'relationships', // 'relationships', 'beliefs', 'diary'
  selectedDiaryDay: 1,

  // --- Toast System ---
  toasts: [],

  // --- Hover Tooltip ---
  hoveredVillager: null,
  hoverPos: { x: 0, y: 0 },

  // --- Context Menu target ---
  _ctxVillager: null,

  init(state) {
    this.state = state;
    this._bindDomEvents();
    this._bindBusEvents();
    console.log('[VILLAGE.ui] Initialized.');
  },

  _bindDomEvents() {
    // 1. Speed & Control Buttons
    const btnPause = document.getElementById('btnPause');
    const btnSpeed1 = document.getElementById('btnSpeed1');
    const btnSpeed2 = document.getElementById('btnSpeed2');
    const btnSpeed4 = document.getElementById('btnSpeed4');
    const btnMute = document.getElementById('btnMute');
    const btnRumorMap = document.getElementById('btnRumorMap');

    if (btnPause) btnPause.onclick = () => VILLAGE.engine.togglePause();
    if (btnSpeed1) btnSpeed1.onclick = () => VILLAGE.engine.setSpeed(1);
    if (btnSpeed2) btnSpeed2.onclick = () => VILLAGE.engine.setSpeed(2);
    if (btnSpeed4) btnSpeed4.onclick = () => VILLAGE.engine.setSpeed(4);
    if (btnMute) btnMute.onclick = () => VILLAGE.bus.emit('audio:toggle-mute');
    if (btnRumorMap) btnRumorMap.onclick = () => VILLAGE.bus.emit('ui:toggle-rumor-map');

    // 2. Build Bar Hotbar Buttons
    const buildButtons = document.querySelectorAll('.build-btn');
    buildButtons.forEach(btn => {
      btn.onclick = () => {
        const type = btn.dataset.buildType;
        VILLAGE.economy.selectBuildType(type);
      };
    });

    // 3. Side Panel Close & Tabs
    const btnClosePanel = document.getElementById('btnClosePanel');
    if (btnClosePanel) btnClosePanel.onclick = () => this.closeVillagerPanel();

    const tabButtons = document.querySelectorAll('.panel-tab-btn');
    tabButtons.forEach(btn => {
      btn.onclick = () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.dataset.tab;
        this._refreshVillagerTabs();
      };
    });

    // 4. Global Modals / Help
    const btnHelp = document.getElementById('btnHelp');
    if (btnHelp) {
      btnHelp.onclick = () => {
        const tut = document.getElementById('tutorialModal');
        if (tut) tut.style.display = 'flex';
      };
    }

    // 5. Building Info Card buttons
    const btnClose = document.getElementById('cardBtnClose');
    if (btnClose) btnClose.onclick = () => {
      const card = document.getElementById('buildingInfoCard');
      if (card) card.classList.add('hidden');
    };

    const btnDemolish = document.getElementById('cardBtnDemolish');
    if (btnDemolish) btnDemolish.onclick = () => {
      if (this._currentBuilding && VILLAGE.economy && VILLAGE.economy.demolishBuilding) {
        VILLAGE.economy.demolishBuilding(this.state, this._currentBuilding.id);
      }
      const card = document.getElementById('buildingInfoCard');
      if (card) card.classList.add('hidden');
    };

    const btnUpgrade = document.getElementById('cardBtnUpgrade');
    if (btnUpgrade) btnUpgrade.onclick = () => {
      if (this._currentBuilding && VILLAGE.economy && VILLAGE.economy.upgradeBuilding) {
        VILLAGE.economy.upgradeBuilding(this.state, this._currentBuilding.id);
        this._renderBuildingCard(this._currentBuilding);
      }
    };

    // 6. Right-click context menu on canvas
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._closeContextMenu();
        this._closeContextMenu(); // ensure hidden first

        // Find villager at click using world position from bus event (but we have screen coords here)
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const worldPos = VILLAGE.engine.screenToWorld(sx, sy);

        const v = this._findVillagerNear(worldPos.x, worldPos.y, 1.2);

        if (v) {
          this._ctxVillager = v;
          this._showContextMenu(e.clientX, e.clientY);
        }
        // right-click on empty: menu stays hidden (already closed above)
      });

      // Left-click closes context menu
      canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
          this._closeContextMenu();
        }
      });
    }

    // 7. Context menu items
    const ctxInspect = document.getElementById('ctxInspect');
    if (ctxInspect) ctxInspect.onclick = () => {
      if (this._ctxVillager) this.openVillagerPanel(this._ctxVillager);
      this._closeContextMenu();
    };

    const ctxFeed = document.getElementById('ctxFeed');
    if (ctxFeed) ctxFeed.onclick = () => {
      const v = this._ctxVillager;
      if (v && this.state.resources.food >= 5) {
        this.state.resources.food -= 5;
        v.needs.hunger = Math.min(100, (v.needs.hunger || 0) + 30);
        if (VILLAGE.stateModule && VILLAGE.stateModule.addLog) {
          VILLAGE.stateModule.addLog(this.state, `${v.name} was given food by the player.`, 'event', v.id);
        }
        this.showToast('🍞 Fed ' + v.name + '!', 'success', 3000);
      } else if (v) {
        this.showToast('❌ Not enough food! (Need 5)', 'warn', 3000);
      }
      this._closeContextMenu();
    };

    const ctxRest = document.getElementById('ctxRest');
    if (ctxRest) ctxRest.onclick = () => {
      const v = this._ctxVillager;
      if (v) {
        const home = this.state.buildings.find(b => b.id === v.homeId);
        if (home) {
          v.targetX = home.x + 1;
          v.targetY = home.y + 1;
          v.activity = 'Resting';
          this.showToast('😴 ' + v.name + ' is heading home to rest.', 'info', 3000);
        } else {
          v.activity = 'Resting';
          this.showToast('😴 ' + v.name + ' is resting where they stand.', 'info', 3000);
        }
      }
      this._closeContextMenu();
    };

    const ctxRumor = document.getElementById('ctxRumor');
    if (ctxRumor) ctxRumor.onclick = () => {
      const v = this._ctxVillager;
      this._closeContextMenu();
      if (!v) return;
      const rumorText = window.prompt('Whisper a rumor to ' + v.name + ':');
      if (!rumorText || !rumorText.trim()) return;
      // Inject a fake rumor belief into this villager
      const fakeRumor = {
        id: 'rumor_whisper_' + Date.now(),
        subjectId: v.id,
        text: rumorText.trim(),
        versions: [],
        origin: 'player'
      };
      if (!this.state.rumors) this.state.rumors = [];
      this.state.rumors.push(fakeRumor);
      if (!v.beliefs) v.beliefs = [];
      v.beliefs.push({
        rumorId: fakeRumor.id,
        versionText: rumorText.trim(),
        confidence: 80,
        sourceId: null
      });
      this.showToast('💬 Rumor whispered to ' + v.name + '!', 'rumor', 4000);
    };
  },

  _findVillagerNear(worldX, worldY, radiusTiles) {
    if (!this.state || !this.state.villagers) return null;
    const T = VILLAGE.config.TILE_SIZE;
    const radius = radiusTiles * T;
    let best = null;
    let bestDist = radius;
    for (let i = 0; i < this.state.villagers.length; i++) {
      const v = this.state.villagers[i];
      const vx = v.x * T + T / 2;
      const vy = v.y * T + T / 2;
      const dist = Math.hypot(vx - worldX, vy - worldY);
      if (dist < bestDist) {
        bestDist = dist;
        best = v;
      }
    }
    return best;
  },

  _showContextMenu(screenX, screenY) {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;
    menu.classList.remove('hidden');
    // Position near cursor, keeping in viewport
    const menuW = 170;
    const menuH = 160;
    const left = Math.min(screenX, window.innerWidth - menuW - 8);
    const top = Math.min(screenY, window.innerHeight - menuH - 8);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  },

  _closeContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.classList.add('hidden');
    this._ctxVillager = null;
  },

  // Toast Notification System
  showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;

    const container = document.getElementById('toastContainer');
    if (!container) return;

    // Max 4 toasts — evict oldest if over limit
    if (this.toasts.length >= 4) {
      const oldest = this.toasts.shift();
      if (oldest && oldest.parentNode) oldest.parentNode.removeChild(oldest);
    }

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);
    this.toasts.push(toast);

    // After duration, fade out and remove
    setTimeout(() => {
      toast.classList.add('toast-fadeout');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
        const idx = this.toasts.indexOf(toast);
        if (idx !== -1) this.toasts.splice(idx, 1);
      }, 400);
    }, duration);
  },

  _bindBusEvents() {
    VILLAGE.bus.on('villager:selected', (v) => {
      this.openVillagerPanel(v);
    });

    VILLAGE.bus.on('ui:close-modals', () => {
      this.closeVillagerPanel();
      const tut = document.getElementById('tutorialModal');
      if (tut) tut.style.display = 'none';
      const settings = document.getElementById('settingsModal');
      if (settings) settings.style.display = 'none';
      this._closeContextMenu();
    });

    VILLAGE.bus.on('ui:toggle-build-bar', () => {
      const bar = document.getElementById('buildBar');
      if (bar) bar.classList.toggle('hidden');
    });

    VILLAGE.bus.on('economy:build-mode-changed', (data) => {
      const buildButtons = document.querySelectorAll('.build-btn');
      buildButtons.forEach(btn => {
        if (btn.dataset.buildType === data.activeType) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    });

    VILLAGE.bus.on('ui:toggle-rumor-map', () => {
      const btn = document.getElementById('btnRumorMap');
      if (btn) btn.classList.toggle('active', VILLAGE.render.showRumorMap);
    });

    VILLAGE.bus.on('log:added', () => {
      this._updateEventTicker();
    });

    // --- Toast Bus Events ---
    VILLAGE.bus.on('social:feud-started', (data) => {
      const name = (data && data.name) ? data.name : 'Someone';
      const name2 = (data && data.name2) ? data.name2 : 'Another';
      this.showToast('⚔️ ' + name + ' and ' + name2 + ' have started a feud!', 'danger', 5000);
    });

    VILLAGE.bus.on('events:trader-arrived', () => {
      this.showToast('🧳 A traveling trader has arrived at the market!', 'success', 4000);
    });

    VILLAGE.bus.on('events:festival', () => {
      this.showToast('🎪 Festival time! The village celebrates!', 'info', 5000);
    });

    VILLAGE.bus.on('events:night-scare', () => {
      this.showToast('👻 Night scare! Something lurks in the dark...', 'warn', 5000);
    });

    VILLAGE.bus.on('victory:milestone', (data) => {
      const text = (data && data.text) ? data.text : 'Milestone reached!';
      this.showToast('🏆 ' + text, 'success', 6000);
    });

    // --- Hover Tooltip ---
    VILLAGE.bus.on('input:hover', (data) => {
      this.hoverPos = { x: data.screenX, y: data.screenY };
      const v = this._findVillagerNear(data.worldPos.x, data.worldPos.y, 1.2);
      if (v) {
        this.hoveredVillager = v;
        this._showHoverTooltip(v, data.screenX, data.screenY);
      } else {
        this.hoveredVillager = null;
        this._hideHoverTooltip();
      }
    });

    // --- Right-click from engine ---
    VILLAGE.bus.on('input:rightclick', (data) => {
      // handled in contextmenu listener directly on canvas; this is a no-op backup
    });

    // --- Building Info Card ---
    VILLAGE.bus.on('building:clicked', (building) => {
      this._currentBuilding = building;
      this._renderBuildingCard(building);
    });

    // --- Win Goals Panel ---
    VILLAGE.bus.on('victory:goals-updated', (data) => {
      const goals = (data && data.goals) ? data.goals : data;
      this._renderGoals(goals);
    });
  },

  _getMoodEmoji(mood) {
    if (mood > 75) return '😊';
    if (mood > 50) return '😐';
    if (mood > 25) return '😟';
    return '😡';
  },

  _getJobEmoji(job) {
    const map = {
      farmer: '🌾',
      woodcutter: '🪓',
      cook: '🍳',
      trader: '💰',
      miner: '⛏️',
      builder: '🔨'
    };
    return map[job] || '👤';
  },

  _showHoverTooltip(v, screenX, screenY) {
    const tip = document.getElementById('hoverTooltip');
    if (!tip) return;
    const moodEmoji = this._getMoodEmoji(v.needs ? v.needs.mood : 50);
    const jobEmoji = this._getJobEmoji(v.job);
    tip.textContent = jobEmoji + ' ' + v.name + '  ' + moodEmoji;
    tip.classList.remove('hidden');
    // Offset tooltip from cursor
    const tipW = 140;
    const left = Math.min(screenX + 14, window.innerWidth - tipW - 8);
    const top = screenY - 36;
    tip.style.left = left + 'px';
    tip.style.top = Math.max(4, top) + 'px';
  },

  _hideHoverTooltip() {
    const tip = document.getElementById('hoverTooltip');
    if (tip) tip.classList.add('hidden');
  },

  _renderBuildingCard(building) {
    const card = document.getElementById('buildingInfoCard');
    const titleEl = document.getElementById('cardBuildTitle');
    const bodyEl = document.getElementById('cardBuildBody');
    if (!card || !titleEl || !bodyEl) return;

    const typeIcons = {
      house: '🏠', farm: '🌾', well: '⛲', market: '⛺',
      watchtower: '🗼', campfire: '🔥'
    };
    const icon = typeIcons[building.type] || '🏗️';
    titleEl.textContent = icon + ' ' + (building.name || building.type);

    let bodyHtml = '<div class="card-info-row">Type: <strong>' + building.type + '</strong></div>';

    if (building.type === 'farm' || building.type === 'market') {
      const assigned = this.state.villagers.filter(v => v.workplaceId === building.id).length;
      const maxWorkers = building.maxWorkers || 2;
      bodyHtml += '<div class="card-info-row">Workers: <strong>' + assigned + ' / ' + maxWorkers + '</strong></div>';
    }

    if (VILLAGE.economy && VILLAGE.economy.getBuildingProductionRate) {
      const rate = VILLAGE.economy.getBuildingProductionRate(this.state, building.id);
      if (rate !== null && rate !== undefined) {
        bodyHtml += '<div class="card-info-row">Production: <strong>' + rate + '/tick</strong></div>';
      }
    }

    if (building.level) {
      bodyHtml += '<div class="card-info-row">Level: <strong>' + building.level + '</strong></div>';
    }

    bodyEl.innerHTML = bodyHtml;
    card.classList.remove('hidden');
  },

  _renderGoals(goals) {
    const list = document.getElementById('goalsList');
    if (!list) return;
    if (!goals || goals.length === 0) {
      list.innerHTML = '<div class="goal-item goal-pending">⬜ No active goals</div>';
      return;
    }
    list.innerHTML = '';
    goals.forEach(goal => {
      const item = document.createElement('div');
      item.className = 'goal-item ' + (goal.done ? 'goal-done' : 'goal-pending');
      item.textContent = (goal.done ? '✅' : '⬜') + ' ' + (goal.label || goal.text || '');
      list.appendChild(item);
    });
  },

  update(state, dt) {
    // 1. Update HUD Resource Counters
    document.getElementById('resWood').textContent = state.resources.wood;
    document.getElementById('resStone').textContent = state.resources.stone;
    document.getElementById('resFood').textContent = state.resources.food;
    document.getElementById('resEmeralds').textContent = state.resources.emeralds;

    // 2. Day & Clock
    document.getElementById('hudDay').textContent = 'Day ' + state.day;
    document.getElementById('hudTime').textContent = VILLAGE.stateModule.formatGameTime(state.timeOfDay);

    // Weather badge
    const weatherBadge = document.getElementById('hudWeather');
    let weatherEmoji = '☀️ Clear';
    if (state.weather === 'rain') weatherEmoji = '🌧️ Rain';
    else if (state.weather === 'fog') weatherEmoji = '🌫️ Fog';
    else if (state.weather === 'festival') weatherEmoji = '🎪 Festival';
    weatherBadge.textContent = weatherEmoji;

    // Speed button active states
    document.getElementById('btnPause').classList.toggle('active', state.paused);
    document.getElementById('btnSpeed1').classList.toggle('active', !state.paused && state.speed === 1);
    document.getElementById('btnSpeed2').classList.toggle('active', !state.paused && state.speed === 2);
    document.getElementById('btnSpeed4').classList.toggle('active', !state.paused && state.speed === 4);

    // 3. Population count in HUD
    const hudPop = document.getElementById('hudPop');
    if (hudPop && state.villagers) {
      hudPop.textContent = '👥 ' + state.villagers.length;
    }

    // 4. Update Villager Inspector if open
    if (this.selectedVillager) {
      this._updateInspectorContent();
    }
  },

  openVillagerPanel(v) {
    this.selectedVillager = v;
    const panel = document.getElementById('villagerPanel');
    if (!panel) return;
    panel.classList.remove('hidden');

    document.getElementById('vPanelName').textContent = v.name;
    document.getElementById('vPanelJob').textContent = '' + v.job.toUpperCase();
    document.getElementById('vPanelBio').textContent = v.bio || '';

    // Draw Portrait Canvas
    const portraitCanvas = document.getElementById('vPortraitCanvas');
    if (portraitCanvas) {
      this.renderVillagerPortrait(portraitCanvas, v);
    }

    this.selectedDiaryDay = this.state.day;
    this._refreshVillagerTabs();
  },

  closeVillagerPanel() {
    this.selectedVillager = null;
    const panel = document.getElementById('villagerPanel');
    if (panel) panel.classList.add('hidden');
  },

  _updateInspectorContent() {
    const v = this.selectedVillager;
    if (!v) return;

    // Needs Bars
    this._setBar('barHunger', 'valHunger', v.needs.hunger);
    this._setBar('barEnergy', 'valEnergy', v.needs.energy);
    this._setBar('barSocial', 'valSocial', v.needs.social);
    this._setBar('barMood', 'valMood', v.needs.mood);

    // Activity
    document.getElementById('vPanelActivity').textContent = v.activity || 'Idling';
  },

  _setBar(barId, valId, value) {
    const bar = document.getElementById(barId);
    const label = document.getElementById(valId);
    const rounded = Math.round(Math.max(0, Math.min(100, value)));
    if (bar) bar.style.width = rounded + '%';
    if (label) label.textContent = rounded + '%';
  },

  _refreshVillagerTabs() {
    const v = this.selectedVillager;
    if (!v) return;

    const relTab = document.getElementById('tabContentRelationships');
    const beliefTab = document.getElementById('tabContentBeliefs');
    const diaryTab = document.getElementById('tabContentDiary');

    relTab.style.display = (this.activeTab === 'relationships') ? 'block' : 'none';
    beliefTab.style.display = (this.activeTab === 'beliefs') ? 'block' : 'none';
    diaryTab.style.display = (this.activeTab === 'diary') ? 'block' : 'none';

    if (this.activeTab === 'relationships') {
      this._renderRelationshipsList(v);
    } else if (this.activeTab === 'beliefs') {
      this._renderBeliefsList(v);
    } else if (this.activeTab === 'diary') {
      this._renderDiaryView(v);
    }
  },

  _renderRelationshipsList(v) {
    const container = document.getElementById('tabContentRelationships');
    container.innerHTML = '';

    const others = this.state.villagers.filter(o => o.id !== v.id);

    others.forEach(other => {
      const rel = v.relations[other.id] || { affinity: 0, trust: 50, familiarity: 10 };
      const statusLabel = VILLAGE.social.getRelationshipLabel(rel.affinity, rel.trust);

      const card = document.createElement('div');
      card.className = 'relationship-card';

      // Status badge color
      let badgeClass = 'badge-neutral';
      if (statusLabel.includes('Friend')) badgeClass = 'badge-friend';
      else if (statusLabel.includes('Feud') || statusLabel.includes('Enemy')) badgeClass = 'badge-feud';
      else if (statusLabel.includes('Suspicious') || statusLabel.includes('Distrusted')) badgeClass = 'badge-warning';

      card.innerHTML = '<div class="rel-header">' +
        '<div class="rel-avatar" style="background:' + other.color + '"></div>' +
        '<div class="rel-names">' +
          '<span class="rel-name">' + other.name + '</span>' +
          '<span class="rel-job">' + other.job + '</span>' +
        '</div>' +
        '<span class="rel-badge ' + badgeClass + '">' + statusLabel + '</span>' +
        '</div>' +
        '<div class="rel-meters">' +
          '<div class="meter-row">' +
            '<span>Affinity (' + (rel.affinity > 0 ? '+' : '') + Math.round(rel.affinity) + ')</span>' +
            '<div class="meter-track">' +
              '<div class="meter-fill affinity-fill" style="width:' + Math.max(0, Math.min(100, (rel.affinity + 100) / 2)) + '%"></div>' +
            '</div>' +
          '</div>' +
          '<div class="meter-row">' +
            '<span>Trust (' + Math.round(rel.trust) + '%)</span>' +
            '<div class="meter-track">' +
              '<div class="meter-fill trust-fill" style="width:' + Math.max(0, Math.min(100, rel.trust)) + '%"></div>' +
            '</div>' +
          '</div>' +
        '</div>';

      // Click switches inspection to that villager!
      card.onclick = () => {
        this.openVillagerPanel(other);
        const T = VILLAGE.config.TILE_SIZE;
        VILLAGE.engine.focusOn(other.x * T, other.y * T);
      };

      container.appendChild(card);
    });
  },

  _renderBeliefsList(v) {
    const container = document.getElementById('tabContentBeliefs');
    container.innerHTML = '';

    if (!v.beliefs || v.beliefs.length === 0) {
      container.innerHTML = '<p class="empty-state">No rumors or secrets held at the moment.</p>';
      return;
    }

    v.beliefs.forEach(belief => {
      const rumor = this.state.rumors.find(r => r.id === belief.rumorId);
      const subject = rumor ? this.state.villagers.find(o => o.id === rumor.subjectId) : null;
      const source = this.state.villagers.find(o => o.id === belief.sourceId);

      // Provenance chain: Origin -> ... -> Source -> Listener
      let provenance = 'Direct Observation';
      if (rumor && rumor.versions && rumor.versions.length > 0) {
        const hops = rumor.versions.map(ver => {
          const teller = this.state.villagers.find(vl => vl.id === ver.tellerId);
          return teller ? teller.name : 'Unknown';
        });
        provenance = hops.join(' ➔ ');
      }

      const card = document.createElement('div');
      card.className = 'belief-card';
      card.innerHTML =
        '<div class="belief-subject">Regarding: <strong>' + (subject ? subject.name : 'Unknown') + '</strong></div>' +
        '<div class="belief-claim">"' + belief.versionText + '"</div>' +
        '<div class="belief-meta">' +
          '<div>Confidence: <strong>' + belief.confidence + '%</strong></div>' +
          '<div class="provenance-chain">Path: ' + provenance + '</div>' +
        '</div>';
      container.appendChild(card);
    });
  },

  _renderDiaryView(v) {
    const container = document.getElementById('tabContentDiary');
    container.innerHTML = '';

    const controls = document.createElement('div');
    controls.className = 'diary-controls';
    controls.innerHTML =
      '<button id="btnPrevDiary" class="mini-btn">&lt; Day</button>' +
      '<span class="diary-day-title">Day ' + this.selectedDiaryDay + '</span>' +
      '<button id="btnNextDiary" class="mini-btn">Day &gt;</button>';
    container.appendChild(controls);

    document.getElementById('btnPrevDiary').onclick = () => {
      if (this.selectedDiaryDay > 1) {
        this.selectedDiaryDay--;
        this._renderDiaryView(v);
      }
    };
    document.getElementById('btnNextDiary').onclick = () => {
      if (this.selectedDiaryDay < this.state.day) {
        this.selectedDiaryDay++;
        this._renderDiaryView(v);
      }
    };

    // Find diary entry for selected day
    let entry = (v.diary || []).find(d => d.day === this.selectedDiaryDay);

    // If viewing current active day and day hasn't ended yet, compose preview of memories so far
    if (!entry) {
      if (this.selectedDiaryDay === this.state.day) {
        const preview = VILLAGE.memory.generateDailyDiary(v, this.state.day, this.state);
        entry = { day: this.state.day, text: preview };
      }
    }

    const card = document.createElement('div');
    card.className = 'parchment-diary';
    if (entry) {
      card.innerHTML =
        '<div class="diary-header">~ Personal Log of ' + v.name + ' ~</div>' +
        '<div class="diary-body">' + entry.text + '</div>';
    } else {
      card.innerHTML = '<p class="empty-state">No diary records exist for Day ' + this.selectedDiaryDay + '.</p>';
    }
    container.appendChild(card);
  },

  _updateEventTicker() {
    const ticker = document.getElementById('eventTicker');
    if (!ticker || !this.state.log || this.state.log.length === 0) return;

    const latest = this.state.log.slice(0, 5);
    ticker.innerHTML = '';

    latest.forEach(item => {
      const span = document.createElement('span');
      span.className = 'ticker-item type-' + item.type;
      span.textContent = '[' + item.timeString + '] ' + item.text;

      // Click focuses camera on villager involved
      if (item.villagerId) {
        span.onclick = () => {
          const v = this.state.villagers.find(vl => vl.id === item.villagerId);
          if (v) {
            const T = VILLAGE.config.TILE_SIZE;
            VILLAGE.engine.focusOn(v.x * T, v.y * T);
            this.openVillagerPanel(v);
          }
        };
      }

      ticker.appendChild(span);
    });
  },

  renderVillagerPortrait(canvas, v) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = 4;
    ctx.save();
    ctx.scale(scale, scale);

    const cx = canvas.width / (2 * scale);
    const cy = canvas.height / (2 * scale) + 4;

    // Body
    ctx.fillStyle = v.color;
    ctx.fillRect(cx - 6, cy - 4, 12, 10);

    // Head
    ctx.fillStyle = '#ffcc80';
    ctx.fillRect(cx - 5, cy - 12, 10, 8);

    // Hair
    ctx.fillStyle = v.hairColor || '#5d4037';
    ctx.fillRect(cx - 6, cy - 14, 12, 4);
    ctx.fillRect(cx - 6, cy - 11, 2, 4);

    // Eyes
    ctx.fillStyle = '#212121';
    ctx.fillRect(cx - 3, cy - 9, 2, 2);
    ctx.fillRect(cx + 1, cy - 9, 2, 2);

    // Smile / Expression based on mood
    ctx.fillStyle = '#b71c1c';
    if (v.needs.mood > 60) {
      ctx.fillRect(cx - 2, cy - 6, 4, 1);
    } else {
      ctx.fillRect(cx - 2, cy - 5, 4, 1);
    }

    // Hat
    VILLAGE.render._drawVillagerHat(ctx, v, cx, cy - 14);

    ctx.restore();
  }
};
