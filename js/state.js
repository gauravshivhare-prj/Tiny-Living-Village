/**
 * js/state.js
 * Owner: Lead Game Systems Architect
 * 
 * Public API:
 *   - VILLAGE.bus: Event bus (on, off, emit)
 *   - VILLAGE.rng: Seeded deterministic PRNG (init, random, int, range, choice)
 *   - VILLAGE.state: Module exposing createInitialState(seed), nextId(prefix), addLog(state, ...)
 * 
 * State fields read/written:
 *   - Defines, initializes and exports the shared `state` contract.
 */

window.VILLAGE = window.VILLAGE || {};

// Lightweight decoupled event bus
VILLAGE.bus = {
  _events: {},

  on(event, handler) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(handler);
  },

  off(event, handler) {
    if (!this._events[event]) return;
    this._events[event] = this._events[event].filter(h => h !== handler);
  },

  emit(event, payload) {
    if (!this._events[event]) return;
    for (let i = 0; i < this._events[event].length; i++) {
      try {
        this._events[event][i](payload);
      } catch (err) {
        console.error(`[VILLAGE.bus] Error in event '${event}':`, err);
      }
    }
  }
};

// Seeded deterministic pseudo-random number generator (Mulberry32)
VILLAGE.rng = {
  _seed: 12345,

  init(seed) {
    if (typeof seed === 'string') {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
      }
      this._seed = hash >>> 0;
    } else {
      this._seed = (seed >>> 0) || 12345;
    }
  },

  random() {
    let t = (this._seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },

  int(min, max) {
    return Math.floor(min + this.random() * (max - min + 1));
  },

  range(min, max) {
    return min + this.random() * (max - min);
  },

  choice(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(this.random() * arr.length)];
  }
};

// State factory and shared state utilities
VILLAGE.stateModule = {
  _idCounters: {},

  nextId(prefix) {
    prefix = prefix || 'id';
    this._idCounters[prefix] = (this._idCounters[prefix] || 0) + 1;
    return `${prefix}_${this._idCounters[prefix]}`;
  },

  addLog(state, text, type, villagerId, otherId) {
    if (!state.log) state.log = [];
    const entry = {
      id: this.nextId('log'),
      tick: state.tick,
      day: state.day,
      timeString: VILLAGE.stateModule.formatGameTime(state.timeOfDay),
      text,
      type: type || 'info', // 'info', 'social', 'rumor', 'event', 'conflict', 'economy'
      villagerId: villagerId || null,
      otherId: otherId || null
    };

    state.log.unshift(entry);
    if (state.log.length > VILLAGE.config.LIMITS.MAX_GLOBAL_LOGS) {
      state.log.length = VILLAGE.config.LIMITS.MAX_GLOBAL_LOGS;
    }

    VILLAGE.bus.emit('log:added', entry);
    return entry;
  },

  formatGameTime(hoursFloat) {
    const totalMinutes = Math.floor(hoursFloat * 60) % 1440;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const hh = h < 10 ? '0' + h : '' + h;
    const mm = m < 10 ? '0' + m : '' + m;
    return `${hh}:${mm}`;
  },

  createInitialState(seed) {
    const activeSeed = seed !== undefined ? seed : Math.floor(Math.random() * 999999);
    VILLAGE.rng.init(activeSeed);
    this._idCounters = {};

    // 12 unique villagers generated from config archetypes
    const villagers = VILLAGE.config.VILLAGER_PRESETS.map((p, idx) => {
      const v = {
        id: p.id,
        name: p.name,
        job: p.job,
        bio: p.bio,
        color: p.color,
        hatColor: p.hatColor,
        hairColor: p.hairColor,
        x: 18 + (idx % 4) * 2, // near town center initially
        y: 13 + Math.floor(idx / 4) * 2,
        targetX: 18 + (idx % 4) * 2,
        targetY: 13 + Math.floor(idx / 4) * 2,
        path: [],
        homeId: null,
        workplaceId: null,
        activity: 'Waking up',
        bubble: null, // { text, icon, timer, maxTimer, type }
        facing: 'down', // 'up', 'down', 'left', 'right'
        walkFrame: 0,
        isMoving: false,

        // Core Needs (0 - 100)
        needs: {
          hunger: 70 + VILLAGE.rng.int(-15, 20),
          energy: 85 + VILLAGE.rng.int(-10, 15),
          social: 50 + VILLAGE.rng.int(-15, 25),
          mood: 75 + VILLAGE.rng.int(-10, 15)
        },

        // Innate Personality (0.0 - 1.0)
        personality: {
          kindness: p.personality.kindness,
          temper: p.personality.temper,
          gossip: p.personality.gossip,
          honesty: p.personality.honesty,
          generosity: p.personality.generosity
        },

        // Interpersonal relations with all other villagers
        relations: {},

        // Memory records (structured history)
        memories: [],

        // Believed rumors & claims
        beliefs: [],

        // Generated daily diary entries
        diary: []
      };

      return v;
    });

    // Initialize bilateral relations between all 12 villagers
    villagers.forEach(v1 => {
      villagers.forEach(v2 => {
        if (v1.id !== v2.id) {
          // Initial baseline relation influenced by personality compatibility
          const baseAffinity = Math.round((v1.personality.kindness + v2.personality.kindness - 1.0) * 25);
          v1.relations[v2.id] = {
            affinity: Math.max(-20, Math.min(40, baseAffinity + VILLAGE.rng.int(-10, 15))),
            trust: Math.round(v2.personality.honesty * 50 + 20 + VILLAGE.rng.int(-10, 10)),
            familiarity: VILLAGE.rng.int(10, 35),
            lastTick: 0
          };
        }
      });
    });

    // The Shared State Contract
    const state = {
      seed: activeSeed,
      tick: 0,
      day: 1,
      timeOfDay: 6.0, // Start at 6:00 AM (Dawn)
      weather: 'clear', // 'clear', 'rain', 'fog', 'festival'
      speed: VILLAGE.config.SPEEDS.NORMAL,
      paused: false,
      resources: { ...VILLAGE.config.INITIAL_RESOURCES },
      map: [], // populated by world.js
      buildings: [], // populated by world.js
      villagers: villagers,
      rumors: [],
      log: [],
      stats: {
        totalInteractions: 0,
        totalGifts: 0,
        totalFeuds: 0,
        totalRumorsSpread: 0,
        buildingsConstructed: 0
      }
    };

    return state;
  }
};
