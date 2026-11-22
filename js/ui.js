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
  },

  update(state, dt) {
    // 1. Update HUD Resource Counters
    document.getElementById('resWood').textContent = state.resources.wood;
    document.getElementById('resStone').textContent = state.resources.stone;
    document.getElementById('resFood').textContent = state.resources.food;
    document.getElementById('resEmeralds').textContent = state.resources.emeralds;

    // 2. Day & Clock
    document.getElementById('hudDay').textContent = `Day ${state.day}`;
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

    // 3. Update Villager Inspector if open
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
    document.getElementById('vPanelJob').textContent = `${v.job.toUpperCase()}`;
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
    if (bar) bar.style.width = `${rounded}%`;
    if (label) label.textContent = `${rounded}%`;
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

      card.innerHTML = `
        <div class="rel-header">
          <div class="rel-avatar" style="background:${other.color}"></div>
          <div class="rel-names">
            <span class="rel-name">${other.name}</span>
            <span class="rel-job">${other.job}</span>
          </div>
          <span class="rel-badge ${badgeClass}">${statusLabel}</span>
        </div>
        <div class="rel-meters">
          <div class="meter-row">
            <span>Affinity (${rel.affinity > 0 ? '+' : ''}${Math.round(rel.affinity)})</span>
            <div class="meter-track">
              <div class="meter-fill affinity-fill" style="width:${Math.max(0, Math.min(100, (rel.affinity + 100) / 2))}%"></div>
            </div>
          </div>
          <div class="meter-row">
            <span>Trust (${Math.round(rel.trust)}%)</span>
            <div class="meter-track">
              <div class="meter-fill trust-fill" style="width:${Math.max(0, Math.min(100, rel.trust))}%"></div>
            </div>
          </div>
        </div>
      `;

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
      card.innerHTML = `
        <div class="belief-subject">Regarding: <strong>${subject ? subject.name : 'Unknown'}</strong></div>
        <div class="belief-claim">"${belief.versionText}"</div>
        <div class="belief-meta">
          <div>Confidence: <strong>${belief.confidence}%</strong></div>
          <div class="provenance-chain">Path: ${provenance}</div>
        </div>
      `;
      container.appendChild(card);
    });
  },

  _renderDiaryView(v) {
    const container = document.getElementById('tabContentDiary');
    container.innerHTML = '';

    const controls = document.createElement('div');
    controls.className = 'diary-controls';
    controls.innerHTML = `
      <button id="btnPrevDiary" class="mini-btn">&lt; Day</button>
      <span class="diary-day-title">Day ${this.selectedDiaryDay}</span>
      <button id="btnNextDiary" class="mini-btn">Day &gt;</button>
    `;
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
      card.innerHTML = `
        <div class="diary-header">~ Personal Log of ${v.name} ~</div>
        <div class="diary-body">${entry.text}</div>
      `;
    } else {
      card.innerHTML = `<p class="empty-state">No diary records exist for Day ${this.selectedDiaryDay}.</p>`;
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
      span.className = `ticker-item type-${item.type}`;
      span.textContent = `[${item.timeString}] ${item.text}`;

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
