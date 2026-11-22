/**
 * js/villagers.js
 * Owner: Villager AI, Needs & Behavior Engineer
 * 
 * Public API:
 *   - VILLAGE.villagers.init(state): Sets up villager schedules and positions.
 *   - VILLAGE.villagers.update(state, dt): Main AI loop (needs drain, schedule, movement, activities).
 *   - VILLAGE.villagers.setBubble(villager, text, icon, durationSeconds): Shows animated speech bubble.
 *   - VILLAGE.villagers.feedVillager(state, villager): Consumes food and restores hunger.
 *   - VILLAGE.villagers.reassignJob(state, villager, newJob): Changes job and adjusts workplace.
 * 
 * State fields read/written:
 *   - Reads: state.timeOfDay, state.buildings, state.resources, state.weather
 *   - Writes: state.villagers (x, y, path, needs, activity, bubble, facing, walkFrame)
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.villagers = {
  init(state) {
    // Initial setup already constructed in stateModule.createInitialState
    console.log('[VILLAGE.villagers] Initialized.');
  },

  update(state, dt) {
    const time = state.timeOfDay;
    const isSleepingHour = time >= 22.0 || time < 6.0;

    for (let i = 0; i < state.villagers.length; i++) {
      const v = state.villagers[i];

      // 1. Drain / restore core needs
      this._updateNeeds(state, v, isSleepingHour);

      // 2. Update speech bubble timers
      if (v.bubble) {
        v.bubble.timer -= dt;
        if (v.bubble.timer <= 0) {
          v.bubble = null;
        }
      }

      // 3. Movement and path progression
      this._updateMovement(state, v, dt);

      // 4. Decision making & schedule state machine
      if (state.tick % 15 === (i % 15)) {
        this._decideActivity(state, v, isSleepingHour);
      }
    }
  },

  _updateNeeds(state, v, isSleepingHour) {
    const rates = VILLAGE.config.NEEDS;

    if (isSleepingHour && v.activity === 'Sleeping') {
      // Resting in bed restores energy rapidly
      v.needs.energy = Math.min(100, v.needs.energy + rates.ENERGY_RECOVERY_SLEEP);
      // Slow hunger drain while sleeping
      v.needs.hunger = Math.max(0, v.needs.hunger - rates.HUNGER_DECAY * 0.35);
    } else {
      // Awake: drain energy and hunger
      v.needs.energy = Math.max(0, v.needs.energy - rates.ENERGY_DECAY);
      v.needs.hunger = Math.max(0, v.needs.hunger - rates.HUNGER_DECAY);
      v.needs.social = Math.max(0, v.needs.social - rates.SOCIAL_DECAY);
    }

    // Auto-eat if hungry and food is available in village store
    if (v.needs.hunger < 35 && state.resources.food > 0) {
      this.feedVillager(state, v);
    } else if (v.needs.hunger <= 5 && !v.bubble && VILLAGE.rng.random() < 0.05) {
      this.setBubble(v, 'Hungry...', null, 3);
    }

    // Dynamic Mood calculation (0-100)
    const baseMood = (v.needs.hunger * 0.40) + (v.needs.energy * 0.30) + (v.needs.social * 0.30);
    // Personality bonus: high kindness improves mood baseline; high temper lowers it slightly
    const personalityMod = (v.personality.kindness - v.personality.temper * 0.5) * 10;
    v.needs.mood = Math.max(0, Math.min(100, Math.round(baseMood + personalityMod)));
  },

  _updateMovement(state, v, dt) {
    if (!v.path || v.path.length === 0) {
      v.isMoving = false;
      return;
    }

    const nextTile = v.path[0];
    const targetX = nextTile.x;
    const targetY = nextTile.y;

    const dx = targetX - v.x;
    const dy = targetY - v.y;
    const dist = Math.hypot(dx, dy);

    // Speed affected by low energy or hunger
    let moveSpeed = 2.2 * dt;
    if (v.needs.energy < 20 || v.needs.hunger < 15) {
      moveSpeed *= 0.6; // weary slow walk
    }

    if (dist <= moveSpeed) {
      v.x = targetX;
      v.y = targetY;
      v.path.shift(); // Reached waypoint
      if (v.path.length === 0) {
        v.isMoving = false;
      }
    } else {
      v.isMoving = true;
      v.x += (dx / dist) * moveSpeed;
      v.y += (dy / dist) * moveSpeed;

      // Update facing direction
      if (Math.abs(dx) > Math.abs(dy)) {
        v.facing = dx > 0 ? 'right' : 'left';
      } else {
        v.facing = dy > 0 ? 'down' : 'up';
      }

      v.walkFrame += moveSpeed * 5;
    }
  },

  _decideActivity(state, v, isSleepingHour) {
    const time = state.timeOfDay;

    // 1. Critical Need Overrides: Severe Exhaustion -> Sleep
    if (isSleepingHour || v.needs.energy < 15) {
      if (v.activity !== 'Sleeping') {
        v.activity = 'Going to bed';
        this._routeToHome(state, v);

        // If arrived at home coordinates
        const home = state.buildings.find(b => b.id === v.homeId);
        if (home && Math.hypot(v.x - (home.x + 1), v.y - (home.y + 1)) <= 1.5) {
          v.activity = 'Sleeping';
          if (VILLAGE.rng.random() < 0.2) this.setBubble(v, 'Zzz...', null, 3);
        }
      }
      return;
    }

    // 2. Severe Hunger -> Seek Food
    if (v.needs.hunger < 25) {
      v.activity = 'Seeking Food';
      const foodSource = state.buildings.find(b => b.type === 'farm' || b.type === 'market');
      if (foodSource) {
        this._routeToTarget(state, v, foodSource.x + 1, foodSource.y + 1);
      }
      return;
    }

    // 3. Daily Schedule Time Slots
    if (time >= 6.0 && time < 8.0) {
      // Breakfast & Morning Stretch
      v.activity = 'Morning Routine';
      if (!v.isMoving && VILLAGE.rng.random() < 0.3) {
        this._wanderNear(state, v, v.x, v.y, 3);
      }

    } else if (time >= 8.0 && time < 12.0) {
      // Work Shift 1
      this._assignJobActivity(state, v);

    } else if (time >= 12.0 && time < 13.5) {
      // Lunch & Social Hour at the Well or Market
      v.activity = 'Lunch Break';
      const well = state.buildings.find(b => b.type === 'well');
      if (well && Math.hypot(v.x - well.x, v.y - well.y) > 3) {
        this._routeToTarget(state, v, well.x, well.y + 2);
      } else if (!v.isMoving && VILLAGE.rng.random() < 0.3) {
        this._wanderNear(state, v, 19, 15, 3);
      }

    } else if (time >= 13.5 && time < 17.5) {
      // Work Shift 2
      this._assignJobActivity(state, v);

    } else if (time >= 17.5 && time < 22.0) {
      // Evening Campfire Gathering & Rumors
      v.activity = 'Evening Campfire';
      const campfire = state.buildings.find(b => b.type === 'campfire');
      if (campfire && Math.hypot(v.x - campfire.x, v.y - campfire.y) > 3.5) {
        const spot = VILLAGE.world.findFreeAdjacentTile(state, campfire.x, campfire.y, campfire.w, campfire.h);
        if (spot) this._routeToTarget(state, v, spot.x, spot.y);
      } else if (!v.isMoving && VILLAGE.rng.random() < 0.25) {
        // Mingle near campfire
        this._wanderNear(state, v, 22, 16, 3);
      }
    }
  },

  _assignJobActivity(state, v) {
    if (v.job === 'farmer') {
      v.activity = 'Farming';
      const farm = state.buildings.find(b => b.id === v.workplaceId) || state.buildings.find(b => b.type === 'farm');
      if (farm) {
        if (Math.hypot(v.x - farm.x, v.y - farm.y) > 2.5) {
          this._routeToTarget(state, v, farm.x + 1, farm.y + 1);
        } else if (!v.isMoving && VILLAGE.rng.random() < 0.4) {
          this._wanderNear(state, v, farm.x + 1, farm.y + 1, 2);
        }
      }
    } else if (v.job === 'woodcutter') {
      v.activity = 'Chopping Timber';
      const nearestTree = VILLAGE.world.findNearestTileOfType(state, v.x, v.y, 'tree');
      if (nearestTree) {
        if (Math.hypot(v.x - nearestTree.x, v.y - nearestTree.y) > 2) {
          this._routeToTarget(state, v, nearestTree.x, nearestTree.y);
        } else if (!v.isMoving && VILLAGE.rng.random() < 0.3) {
          if (VILLAGE.audio && VILLAGE.rng.random() < 0.05) VILLAGE.audio.playWoodChop();
          this._wanderNear(state, v, nearestTree.x, nearestTree.y, 2);
        }
      }
    } else if (v.job === 'miner') {
      v.activity = 'Quarrying Stone';
      const nearestStone = VILLAGE.world.findNearestTileOfType(state, v.x, v.y, 'stone');
      if (nearestStone) {
        if (Math.hypot(v.x - nearestStone.x, v.y - nearestStone.y) > 2) {
          this._routeToTarget(state, v, nearestStone.x, nearestStone.y);
        } else if (!v.isMoving && VILLAGE.rng.random() < 0.3) {
          if (VILLAGE.audio && VILLAGE.rng.random() < 0.05) VILLAGE.audio.playPickaxe();
          this._wanderNear(state, v, nearestStone.x, nearestStone.y, 2);
        }
      }
    } else if (v.job === 'cook') {
      v.activity = 'Preparing Meals';
      const house = state.buildings.find(b => b.id === v.homeId) || state.buildings.find(b => b.type === 'house');
      if (house) {
        if (Math.hypot(v.x - house.x, v.y - house.y) > 2) {
          this._routeToTarget(state, v, house.x + 1, house.y + 1);
        } else if (!v.isMoving && VILLAGE.rng.random() < 0.3) {
          this._wanderNear(state, v, house.x + 1, house.y + 1, 2);
        }
      }
    } else if (v.job === 'trader') {
      v.activity = 'Tending Stall';
      const market = state.buildings.find(b => b.type === 'market');
      if (market) {
        if (Math.hypot(v.x - market.x, v.y - market.y) > 2) {
          this._routeToTarget(state, v, market.x, market.y + 2);
        } else if (!v.isMoving && VILLAGE.rng.random() < 0.3) {
          this._wanderNear(state, v, market.x, market.y + 2, 2);
        }
      }
    } else if (v.job === 'builder') {
      v.activity = 'Inspecting Structures';
      // Wander between buildings to maintain them
      const randomBuilding = VILLAGE.rng.choice(state.buildings);
      if (randomBuilding && Math.hypot(v.x - randomBuilding.x, v.y - randomBuilding.y) > 3) {
        this._routeToTarget(state, v, randomBuilding.x, randomBuilding.y);
      } else if (!v.isMoving && VILLAGE.rng.random() < 0.3) {
        this._wanderNear(state, v, v.x, v.y, 3);
      }
    }
  },

  _routeToHome(state, v) {
    const home = state.buildings.find(b => b.id === v.homeId) || state.buildings.find(b => b.type === 'house');
    if (home) {
      this._routeToTarget(state, v, home.x + 1, home.y + 1);
    }
  },

  _routeToTarget(state, v, gx, gy) {
    if (v.isMoving && v.path.length > 0) {
      const last = v.path[v.path.length - 1];
      if (Math.hypot(last.x - gx, last.y - gy) <= 1.5) return; // already headed there
    }

    const path = VILLAGE.world.findPath(state, v.x, v.y, gx, gy);
    if (path && path.length > 0) {
      v.path = path;
    }
  },

  _wanderNear(state, v, cx, cy, radius) {
    const rx = Math.floor(cx + VILLAGE.rng.int(-radius, radius));
    const ry = Math.floor(cy + VILLAGE.rng.int(-radius, radius));
    if (VILLAGE.world.isWalkable(state, rx, ry)) {
      this._routeToTarget(state, v, rx, ry);
    }
  },

  setBubble(villager, text, icon, durationSeconds) {
    villager.bubble = {
      text: text,
      icon: icon || null,
      timer: durationSeconds || 3.0,
      maxTimer: durationSeconds || 3.0
    };
  },

  feedVillager(state, villager) {
    if (state.resources.food > 0) {
      state.resources.food--;
      villager.needs.hunger = Math.min(100, villager.needs.hunger + VILLAGE.config.NEEDS.HUNGER_RECOVERY_MEAL);
      villager.needs.mood = Math.min(100, villager.needs.mood + 12);
      this.setBubble(villager, 'Yum!', null, 2);
    }
  },

  reassignJob(state, villager, newJob) {
    villager.job = newJob;
    // Set appropriate hat color from presets
    const preset = VILLAGE.config.VILLAGER_PRESETS.find(p => p.id === villager.id);
    if (preset) {
      villager.hatColor = preset.hatColor;
    }
    villager.workplaceId = null;
    VILLAGE.stateModule.addLog(state, `${villager.name} has taken up the job of ${newJob}.`, 'info', villager.id);
  }
};
