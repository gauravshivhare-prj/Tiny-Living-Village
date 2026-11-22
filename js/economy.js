/**
 * js/economy.js
 * Owner: Economy, Building Construction & Production Specialist
 * 
 * Public API:
 *   - VILLAGE.economy.init(state): Sets up production timers and hotbar build listeners.
 *   - VILLAGE.economy.update(state, dt): Handles resource generation by working villagers.
 *   - VILLAGE.economy.selectBuildType(type): Toggles placement mode.
 *   - VILLAGE.economy.canBuildAt(state, type, x, y): Validates bounds, collision and cost.
 *   - VILLAGE.economy.tryPlaceBuilding(state, x, y): Places structure, updates map and deducts resources.
 *   - VILLAGE.economy.demolishBuildingAt(state, x, y): Tears down building and refunds half materials.
 * 
 * State fields read/written:
 *   - Reads: state.map, state.buildings, state.villagers, state.resources
 *   - Writes: state.resources (wood, stone, food, emeralds), state.buildings, state.map, state.log
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.economy = {
  activeBuildType: null, // null, 'house', 'farm', 'well', 'market', 'watchtower', 'campfire', or 'demolish'
  hoverTile: null,
  productionTick: 0,

  init(state) {
    this.activeBuildType = null;
    this.hoverTile = null;
    this.productionTick = 0;

    // Track mouse hover for build placement ghost
    VILLAGE.bus.on('input:hover', (data) => {
      if (this.activeBuildType && data.worldPos) {
        this.hoverTile = {
          x: Math.floor(data.worldPos.x / VILLAGE.config.TILE_SIZE),
          y: Math.floor(data.worldPos.y / VILLAGE.config.TILE_SIZE)
        };
      } else {
        this.hoverTile = null;
      }
    });

    console.log('[VILLAGE.economy] Initialized.');
  },

  selectBuildType(type) {
    if (this.activeBuildType === type) {
      this.activeBuildType = null; // toggle off
    } else {
      this.activeBuildType = type;
    }
    VILLAGE.bus.emit('economy:build-mode-changed', { activeType: this.activeBuildType });
  },

  update(state, dt) {
    this.productionTick++;

    // Production runs every 50 ticks (~2.5s)
    if (this.productionTick % 50 === 0) {
      this._runProductionCycle(state);
    }
  },

  _runProductionCycle(state) {
    const villagers = state.villagers;

    for (let i = 0; i < villagers.length; i++) {
      const v = villagers[i];
      if (v.activity === 'Sleeping' || v.needs.energy < 15 || v.needs.hunger < 10) continue;

      if (v.job === 'farmer' && v.activity === 'Farming') {
        state.resources.food += 2;
        if (VILLAGE.rng.random() < 0.25) {
          VILLAGE.villagers.setBubble(v, '+2 Food', null, 2);
        }
      } else if (v.job === 'woodcutter' && v.activity === 'Chopping Timber') {
        state.resources.wood += 2;
        if (VILLAGE.rng.random() < 0.25) {
          VILLAGE.villagers.setBubble(v, '+2 Wood', null, 2);
        }
      } else if (v.job === 'miner' && v.activity === 'Quarrying Stone') {
        state.resources.stone += 2;
        if (VILLAGE.rng.random() < 0.25) {
          VILLAGE.villagers.setBubble(v, '+2 Stone', null, 2);
        }
      } else if (v.job === 'trader' && v.activity === 'Tending Stall') {
        // Traders convert surplus wood & food to emeralds
        if (state.resources.food >= 10 && state.resources.wood >= 10) {
          state.resources.food -= 4;
          state.resources.wood -= 4;
          state.resources.emeralds += 1;
          VILLAGE.villagers.setBubble(v, '+1 Emerald', null, 2.5);
          VILLAGE.stateModule.addLog(state, `${v.name} completed a lucrative foreign trade: gained +1 Emerald.`, 'economy', v.id);
        }
      }
    }
  },

  canAfford(state, cost) {
    if (!cost) return true;
    for (const res in cost) {
      if ((state.resources[res] || 0) < cost[res]) return false;
    }
    return true;
  },

  deductCost(state, cost) {
    if (!cost) return;
    for (const res in cost) {
      state.resources[res] -= cost[res];
    }
  },

  canBuildAt(state, type, startX, startY) {
    if (type === 'demolish') {
      const b = state.buildings.find(bld => 
        startX >= bld.x && startX < bld.x + bld.w && startY >= bld.y && startY < bld.y + bld.h
      );
      return b !== undefined;
    }

    const def = VILLAGE.config.BUILDINGS[type];
    if (!def) return false;

    // Check resource affordability
    if (!this.canAfford(state, def.cost)) return false;

    const W = VILLAGE.config.MAP_WIDTH;
    const H = VILLAGE.config.MAP_HEIGHT;

    // Bounds check
    if (startX < 1 || startX + def.w >= W - 1 || startY < 1 || startY + def.h >= H - 1) {
      return false;
    }

    // Check each tile in footprint
    for (let dy = 0; dy < def.h; dy++) {
      for (let dx = 0; dx < def.w; dx++) {
        const tx = startX + dx;
        const ty = startY + dy;
        const tile = state.map[ty][tx];

        // Must be unbuilt grass or dirt path, not water, stone, or tree
        if (tile.buildingId !== null) return false;
        if (tile.type === 'water') return false;
        if (tile.type === 'stone' || tile.type === 'tree') return false;
      }
    }

    return true;
  },

  tryPlaceBuilding(state, x, y) {
    if (!this.activeBuildType) return false;

    if (this.activeBuildType === 'demolish') {
      return this.demolishBuildingAt(state, x, y);
    }

    const type = this.activeBuildType;
    const def = VILLAGE.config.BUILDINGS[type];
    if (!def) return false;

    if (!this.canBuildAt(state, type, x, y)) {
      if (VILLAGE.audio) VILLAGE.audio.playErrorBlip();
      return false;
    }

    // Deduct materials
    this.deductCost(state, def.cost);

    const bId = VILLAGE.stateModule.nextId('bld');
    const building = {
      id: bId,
      type: type,
      name: def.name,
      x: x,
      y: y,
      w: def.w,
      h: def.h,
      ownerId: null,
      level: 1,
      builtAtTick: state.tick
    };

    // Update map grid
    for (let dy = 0; dy < def.h; dy++) {
      for (let dx = 0; dx < def.w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        state.map[ty][tx].buildingId = bId;
        state.map[ty][tx].walkable = (type === 'farm' || type === 'campfire');
      }
    }

    state.buildings.push(building);
    state.stats.buildingsConstructed++;

    if (VILLAGE.audio) VILLAGE.audio.playBuildFanfare();
    VILLAGE.stateModule.addLog(state, `New construction finished: ${def.name} erected!`, 'economy');

    // Deselect build tool
    this.activeBuildType = null;
    VILLAGE.bus.emit('economy:build-mode-changed', { activeType: null });
    return true;
  },

  demolishBuildingAt(state, x, y) {
    const bIndex = state.buildings.findIndex(bld => 
      x >= bld.x && x < bld.x + bld.w && y >= bld.y && y < bld.y + bld.h
    );

    if (bIndex === -1) return false;
    const b = state.buildings[bIndex];
    const def = VILLAGE.config.BUILDINGS[b.type];

    // Clear map tiles
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const tx = b.x + dx;
        const ty = b.y + dy;
        if (state.map[ty] && state.map[ty][tx]) {
          state.map[ty][tx].buildingId = null;
          state.map[ty][tx].walkable = true;
        }
      }
    }

    // Refund 50% resources
    if (def && def.cost) {
      for (const res in def.cost) {
        state.resources[res] += Math.floor(def.cost[res] * 0.5);
      }
    }

    state.buildings.splice(bIndex, 1);
    VILLAGE.stateModule.addLog(state, `Demolished ${b.name}. Reclaimed 50% materials.`, 'economy');
    if (VILLAGE.audio) VILLAGE.audio.playWoodChop();

    this.activeBuildType = null;
    VILLAGE.bus.emit('economy:build-mode-changed', { activeType: null });
    return true;
  }
};
