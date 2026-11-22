/**
 * js/events.js
 * Owner: Environmental Simulation & Dynamic Events Engineer
 * 
 * Public API:
 *   - VILLAGE.events.init(state): Sets up event timers and weather engine.
 *   - VILLAGE.events.update(state, dt): Evaluates random event triggers and weather shifts.
 *   - VILLAGE.events.triggerEvent(state, eventType): Manually or procedurally fires a special event.
 *   - VILLAGE.events.changeWeather(state, newWeather): Sets current weather.
 * 
 * State fields read/written:
 *   - Reads: state.timeOfDay, state.day, state.weather, state.buildings, state.villagers
 *   - Writes: state.weather, state.resources, state.villagers (mood, memories, bubbles), state.log
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.events = {
  weatherTimer: 0,
  eventTimer: 0,

  init(state) {
    this.weatherTimer = 0;
    this.eventTimer = 0;
    console.log('[VILLAGE.events] Initialized.');
  },

  update(state, dt) {
    // 1. Weather shifts every ~1200 ticks (approx 60s real time)
    this.weatherTimer++;
    if (this.weatherTimer > 1200) {
      this.weatherTimer = 0;
      this._evaluateWeatherChange(state);
    }

    // 2. Random event rolls every ~800 ticks (approx 40s)
    this.eventTimer++;
    if (this.eventTimer > 800) {
      this.eventTimer = 0;
      if (VILLAGE.rng.random() < 0.65) {
        this._rollRandomEvent(state);
      }
    }
  },

  _evaluateWeatherChange(state) {
    const roll = VILLAGE.rng.random();
    let nextWeather = 'clear';

    if (roll < 0.25) nextWeather = 'rain';
    else if (roll < 0.40) nextWeather = 'fog';
    else nextWeather = 'clear';

    if (nextWeather !== state.weather) {
      this.changeWeather(state, nextWeather);
    }
  },

  changeWeather(state, newWeather) {
    state.weather = newWeather;
    VILLAGE.bus.emit('weather:changed', { weather: newWeather });

    let msg = `The sky shifts to ${newWeather}.`;
    if (newWeather === 'rain') msg = 'Rain clouds roll in over the valley, soothing the tilled soil.';
    else if (newWeather === 'fog') msg = 'A damp, heavy fog settles over the village paths.';
    else if (newWeather === 'clear') msg = 'The clouds part, revealing warm, tranquil sunlight.';

    VILLAGE.stateModule.addLog(state, msg, 'event');
  },

  _rollRandomEvent(state) {
    const time = state.timeOfDay;
    const candidates = [];

    // Daytime events
    if (time >= 8.0 && time <= 18.0) {
      candidates.push('trader_visit');
      candidates.push('harvest_bounty');
    }

    // Evening / Night events
    if (time >= 18.0 && time <= 22.0) {
      candidates.push('campfire_festival');
    }
    if (time >= 21.0 || time < 5.0) {
      candidates.push('creeper_scare');
      candidates.push('night_zombies');
    }

    if (candidates.length > 0) {
      const chosen = VILLAGE.rng.choice(candidates);
      this.triggerEvent(state, chosen);
    }
  },

  triggerEvent(state, eventType) {
    switch (eventType) {
      case 'trader_visit':
        this._eventTraderVisit(state);
        break;
      case 'harvest_bounty':
        this._eventHarvestBounty(state);
        break;
      case 'campfire_festival':
        this._eventCampfireFestival(state);
        break;
      case 'creeper_scare':
        this._eventCreeperScare(state);
        break;
      case 'night_zombies':
        this._eventNightZombies(state);
        break;
    }
  },

  _eventTraderVisit(state) {
    state.resources.emeralds += 2;
    state.resources.food += 10;

    VILLAGE.stateModule.addLog(state, 'Event: A nomadic merchant caravan visited the market, bestowing emeralds and provisions!', 'event');
    if (VILLAGE.audio) VILLAGE.audio.playBell();

    state.villagers.forEach(v => {
      v.needs.mood = Math.min(100, v.needs.mood + 10);
      VILLAGE.memory.record(v, {
        tick: state.tick,
        day: state.day,
        type: 'trade',
        otherId: null,
        place: 'Market Stall',
        item: 'exotic provisions from a wandering merchant',
        amount: 2,
        valence: 6,
        importance: 5
      });
    });
  },

  _eventHarvestBounty(state) {
    const farms = state.buildings.filter(b => b.type === 'farm');
    const bonus = Math.max(15, farms.length * 10);
    state.resources.food += bonus;

    VILLAGE.stateModule.addLog(state, `Event: Bountiful Harvest! Soil yielded +${bonus} food across the village farms!`, 'event');
    if (VILLAGE.audio) VILLAGE.audio.playBell();

    state.villagers.forEach(v => {
      v.needs.mood = Math.min(100, v.needs.mood + 15);
      if (v.job === 'farmer') {
        VILLAGE.villagers.setBubble(v, 'Rich harvest! 🌾', null, 3.5);
      }
      VILLAGE.memory.record(v, {
        tick: state.tick,
        day: state.day,
        type: 'harvest_bounty',
        otherId: null,
        place: 'Farm Plot',
        item: 'a golden autumn harvest',
        amount: bonus,
        valence: 7,
        importance: 6
      });
    });
  },

  _eventCampfireFestival(state) {
    VILLAGE.stateModule.addLog(state, 'Event: Evening Festival! The whole village gathers to dance, sing, and celebrate around the fire.', 'event');
    if (VILLAGE.audio) VILLAGE.audio.playBell();

    const campfire = state.buildings.find(b => b.type === 'campfire');

    state.villagers.forEach(v => {
      v.needs.mood = 100;
      v.needs.social = 100;
      VILLAGE.villagers.setBubble(v, 'Festival! ♫', null, 4);

      if (campfire) {
        v.targetX = campfire.x + 1;
        v.targetY = campfire.y + 1;
      }

      VILLAGE.memory.record(v, {
        tick: state.tick,
        day: state.day,
        type: 'festival',
        otherId: null,
        place: 'Campfire',
        item: 'festive songs and dance',
        amount: 1,
        valence: 9,
        importance: 8
      });
    });
  },

  _eventCreeperScare(state) {
    const tower = state.buildings.find(b => b.type === 'watchtower');
    const msg = tower 
      ? 'Event: Creeper sighted at the perimeter! The watchtower guards sounded the alarm in time.'
      : 'Event: A terrifying Creeper hissed near the tree line! Villagers scattered in fright.';

    VILLAGE.stateModule.addLog(state, msg, 'conflict');
    if (VILLAGE.audio) VILLAGE.audio.playArgumentBuzz();

    state.villagers.forEach(v => {
      if (tower) {
        v.needs.mood = Math.max(10, v.needs.mood - 8);
        VILLAGE.villagers.setBubble(v, 'Guarded! 🛡️', null, 3);
      } else {
        v.needs.mood = Math.max(0, v.needs.mood - 20);
        VILLAGE.villagers.setBubble(v, 'Eek!! 💥', null, 3);
      }

      VILLAGE.memory.record(v, {
        tick: state.tick,
        day: state.day,
        type: 'scare',
        otherId: null,
        place: 'the woods',
        item: 'a lurking creeper scare',
        amount: 1,
        valence: -6,
        importance: 7
      });
    });
  },

  _eventNightZombies(state) {
    VILLAGE.stateModule.addLog(state, 'Event: Restless night zombies wandered past the valley border, repelled by village lanterns.', 'event');
    
    state.villagers.forEach(v => {
      if (v.activity !== 'Sleeping') {
        VILLAGE.villagers.setBubble(v, 'Keep lanterns lit!', null, 3);
      }
    });
  }
};
