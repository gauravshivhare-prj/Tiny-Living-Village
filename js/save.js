/**
 * js/save.js
 * Owner: State Persistence & Serialization Specialist
 * 
 * Public API:
 *   - VILLAGE.save.init(state): Binds autosave timers and day transition listeners.
 *   - VILLAGE.save.save(state): Serializes state into versioned localStorage payload.
 *   - VILLAGE.save.load(): Deserializes and restores state from localStorage.
 *   - VILLAGE.save.hasSave(): Returns boolean if saved village exists.
 *   - VILLAGE.save.clearSave(): Wipes localStorage save entry.
 * 
 * State fields read/written:
 *   - Reads: complete state object
 *   - Writes: deserialized state object into VILLAGE.engine.state
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.save = {
  SAVE_KEY: 'tiny_living_village_save_v1',
  SAVE_VERSION: 1,

  init(state) {
    // Autosave on every day transition
    VILLAGE.bus.on('day:ended', () => {
      this.save(VILLAGE.engine.state);
    });

    console.log('[VILLAGE.save] Initialized.');
  },

  hasSave() {
    try {
      const data = localStorage.getItem(this.SAVE_KEY);
      return data !== null && data.length > 50;
    } catch (e) {
      return false;
    }
  },

  save(state) {
    if (!state) return false;

    try {
      // Create clean serializable snapshot
      const payload = {
        version: this.SAVE_VERSION,
        timestamp: Date.now(),
        seed: state.seed,
        tick: state.tick,
        day: state.day,
        timeOfDay: state.timeOfDay,
        weather: state.weather,
        resources: { ...state.resources },
        map: state.map,
        buildings: state.buildings,
        villagers: state.villagers.map(v => ({
          ...v,
          path: [], // reset active pathing
          bubble: null
        })),
        rumors: state.rumors,
        log: state.log.slice(0, VILLAGE.config.LIMITS.MAX_GLOBAL_LOGS),
        stats: { ...state.stats }
      };

      localStorage.setItem(this.SAVE_KEY, JSON.stringify(payload));
      VILLAGE.stateModule.addLog(state, 'Village state saved successfully.', 'info');
      VILLAGE.bus.emit('save:completed', { timestamp: payload.timestamp });
      return true;
    } catch (err) {
      console.error('[VILLAGE.save] Save failed:', err);
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.SAVE_KEY);
      if (!raw) return null;

      const payload = JSON.parse(raw);
      if (!payload || payload.version !== this.SAVE_VERSION) {
        console.warn('[VILLAGE.save] Incompatible save version.');
        return null;
      }

      // Rehydrate state
      const state = {
        seed: payload.seed,
        tick: payload.tick || 0,
        day: payload.day || 1,
        timeOfDay: payload.timeOfDay || 6.0,
        weather: payload.weather || 'clear',
        speed: VILLAGE.config.SPEEDS.NORMAL,
        paused: false,
        resources: payload.resources || { ...VILLAGE.config.INITIAL_RESOURCES },
        map: payload.map || [],
        buildings: payload.buildings || [],
        villagers: payload.villagers || [],
        rumors: payload.rumors || [],
        log: payload.log || [],
        stats: payload.stats || {
          totalInteractions: 0,
          totalGifts: 0,
          totalFeuds: 0,
          totalRumorsSpread: 0,
          buildingsConstructed: 0
        }
      };

      // Re-initialize PRNG with seed
      VILLAGE.rng.init(state.seed);

      VILLAGE.stateModule.addLog(state, `Village loaded successfully (Day ${state.day}).`, 'info');
      return state;
    } catch (err) {
      console.error('[VILLAGE.save] Load error:', err);
      return null;
    }
  },

  clearSave() {
    try {
      localStorage.removeItem(this.SAVE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }
};
