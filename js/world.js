/**
 * js/world.js
 * Owner: World Generation & Pathfinding Specialist
 * 
 * Public API:
 *   - VILLAGE.world.init(state): Generates the 40x30 tile map, initial buildings, and roads.
 *   - VILLAGE.world.update(state, dt): Updates environmental tile animations (e.g. water shimmer phase, crop growth).
 *   - VILLAGE.world.findPath(state, startX, startY, targetX, targetY): A* pathfinder with straight-line fallback.
 *   - VILLAGE.world.isWalkable(state, x, y): Returns boolean walkable state.
 *   - VILLAGE.world.getTile(state, x, y): Safe tile getter.
 *   - VILLAGE.world.findFreeAdjacentTile(state, x, y, w, h): Returns walkable coordinate adjacent to a structure.
 *   - VILLAGE.world.findNearestBuilding(state, startX, startY, type): Finds nearest building of given type.
 * 
 * State fields read/written:
 *   - Reads: state.seed, state.buildings
 *   - Writes: state.map (40x30 grid of tiles), state.buildings (initial layout), state.villagers (home/work assignments)
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.world = {
  shimmerTick: 0,

  init(state) {
    const W = VILLAGE.config.MAP_WIDTH;
    const H = VILLAGE.config.MAP_HEIGHT;
    state.map = [];

    // 1. Initialize blank grass grid
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        // Natural variation in grass
        const v = VILLAGE.rng.random();
        let decor = null;
        if (v < 0.08) decor = 'flowers';
        else if (v < 0.14) decor = 'tallgrass';

        row.push({
          type: 'grass',
          walkable: true,
          buildingId: null,
          decor: decor,
          elevation: 0,
          cropStage: 0 // for farms
        });
      }
      state.map.push(row);
    }

    // 2. Generate a cozy winding river on the eastern side
    for (let y = 0; y < H; y++) {
      const riverCenter = Math.floor(32 + Math.sin(y * 0.25) * 3);
      for (let x = riverCenter - 2; x <= riverCenter + 2; x++) {
        if (x >= 0 && x < W) {
          state.map[y][x].type = 'water';
          state.map[y][x].walkable = false;
          state.map[y][x].decor = null;
        }
      }
      // Sandy banks
      if (riverCenter - 3 >= 0) {
        state.map[y][riverCenter - 3].type = 'sand';
      }
      if (riverCenter + 3 < W) {
        state.map[y][riverCenter + 3].type = 'sand';
      }
    }

    // River wooden bridge at y = 14..15
    for (let bx = 28; bx <= 36; bx++) {
      for (let by = 14; by <= 15; by++) {
        if (state.map[by] && state.map[by][bx]) {
          state.map[by][bx].type = 'dirtPath';
          state.map[by][bx].walkable = true;
          state.map[by][bx].decor = 'bridge';
        }
      }
    }

    // 3. Central Village Square (x: 17..23, y: 12..18)
    for (let y = 11; y <= 19; y++) {
      for (let x = 16; x <= 24; x++) {
        state.map[y][x].type = 'dirtPath';
        state.map[y][x].walkable = true;
        state.map[y][x].decor = null;
      }
    }

    // Main branching roads: North, South, West
    for (let y = 2; y < H - 2; y++) {
      state.map[y][20].type = 'dirtPath';
      state.map[y][21].type = 'dirtPath';
    }
    for (let x = 2; x < W - 2; x++) {
      state.map[15][x].type = 'dirtPath';
      state.map[16][x].type = 'dirtPath';
    }

    // 4. Natural clusters of trees and stone boulders
    this._generateScatterClusters(state, 'tree', 22, false);
    this._generateScatterClusters(state, 'stone', 12, false);

    // 5. Place Initial Village Buildings
    state.buildings = [];

    // Central Well in square
    this._placeInitialBuilding(state, 'well', 19, 14);

    // Campfire in square for evening stories
    this._placeInitialBuilding(state, 'campfire', 22, 16);

    // Market Stall
    this._placeInitialBuilding(state, 'market', 17, 17);

    // Watchtower guarding western approach
    this._placeInitialBuilding(state, 'watchtower', 4, 13);

    // Starter Farm Plots (south of center)
    this._placeInitialBuilding(state, 'farm', 14, 21);
    this._placeInitialBuilding(state, 'farm', 23, 21);

    // Starter Houses (West, North, East of square)
    this._placeInitialBuilding(state, 'house', 9, 8);
    this._placeInitialBuilding(state, 'house', 14, 6);
    this._placeInitialBuilding(state, 'house', 22, 6);
    this._placeInitialBuilding(state, 'house', 10, 18);

    // 6. Assign initial homes and workplaces to villagers
    this._assignInitialRoles(state);

    VILLAGE.stateModule.addLog(state, 'Village created! 12 villagers have settled into the valley.', 'event');
  },

  _generateScatterClusters(state, type, count, walkable) {
    const W = VILLAGE.config.MAP_WIDTH;
    const H = VILLAGE.config.MAP_HEIGHT;

    for (let c = 0; c < count; c++) {
      // Pick random spot not too close to center
      let cx = VILLAGE.rng.int(2, W - 3);
      let cy = VILLAGE.rng.int(2, H - 3);

      // Avoid center square
      if (cx >= 14 && cx <= 26 && cy >= 10 && cy <= 20) continue;

      const clusterRadius = VILLAGE.rng.int(1, 3);
      for (let dy = -clusterRadius; dy <= clusterRadius; dy++) {
        for (let dx = -clusterRadius; dx <= clusterRadius; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 1 && x < W - 1 && y >= 1 && y < H - 1) {
            const tile = state.map[y][x];
            if (tile.type === 'grass' && !tile.buildingId && VILLAGE.rng.random() < 0.65) {
              tile.type = type;
              tile.walkable = walkable;
              tile.decor = null;
            }
          }
        }
      }
    }
  },

  _placeInitialBuilding(state, type, x, y) {
    const def = VILLAGE.config.BUILDINGS[type];
    if (!def) return null;

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
      builtAtTick: 0
    };

    // Mark map tiles
    for (let dy = 0; dy < def.h; dy++) {
      for (let dx = 0; dx < def.w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (state.map[ty] && state.map[ty][tx]) {
          state.map[ty][tx].buildingId = bId;
          // Walkable only for farm and campfire; solid for houses, towers, well
          state.map[ty][tx].walkable = (type === 'farm' || type === 'campfire');
        }
      }
    }

    state.buildings.push(building);
    return building;
  },

  _assignInitialRoles(state) {
    const houses = state.buildings.filter(b => b.type === 'house');
    const farms = state.buildings.filter(b => b.type === 'farm');
    const market = state.buildings.find(b => b.type === 'market');
    const tower = state.buildings.find(b => b.type === 'watchtower');

    // Distribute villagers among houses (up to 3 per house for 4 houses = 12)
    state.villagers.forEach((v, idx) => {
      if (houses.length > 0) {
        const h = houses[idx % houses.length];
        v.homeId = h.id;
      }

      // Assign workplaces based on job
      if (v.job === 'farmer' && farms.length > 0) {
        v.workplaceId = farms[idx % farms.length].id;
      } else if (v.job === 'trader' && market) {
        v.workplaceId = market.id;
      } else if (v.job === 'builder' && tower) {
        v.workplaceId = tower.id;
      }

      // Place them physically near their home or center
      const spot = this.findFreeAdjacentTile(state, 20, 15, 2, 2);
      if (spot) {
        v.x = spot.x;
        v.y = spot.y;
        v.targetX = spot.x;
        v.targetY = spot.y;
      }
    });
  },

  update(state, dt) {
    this.shimmerTick += dt;

    // Slowly grow crops on farm tiles
    if (state.tick % 40 === 0) {
      for (let y = 0; y < VILLAGE.config.MAP_HEIGHT; y++) {
        for (let x = 0; x < VILLAGE.config.MAP_WIDTH; x++) {
          const tile = state.map[y][x];
          if (tile.buildingId) {
            const b = state.buildings.find(bld => bld.id === tile.buildingId);
            if (b && b.type === 'farm') {
              tile.cropStage = (tile.cropStage + 1) % 4;
            }
          }
        }
      }
    }
  },

  isWalkable(state, x, y) {
    const W = VILLAGE.config.MAP_WIDTH;
    const H = VILLAGE.config.MAP_HEIGHT;
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    const tile = state.map[y][x];
    return tile ? tile.walkable : false;
  },

  getTile(state, x, y) {
    const W = VILLAGE.config.MAP_WIDTH;
    const H = VILLAGE.config.MAP_HEIGHT;
    if (x < 0 || x >= W || y < 0 || y >= H) return null;
    return state.map[y][x];
  },

  findFreeAdjacentTile(state, x, y, w, h) {
    // Check perimeter tiles of rectangle
    const candidates = [];
    for (let dx = -1; dx <= w; dx++) {
      candidates.push({ x: x + dx, y: y - 1 });
      candidates.push({ x: x + dx, y: y + h });
    }
    for (let dy = 0; dy < h; dy++) {
      candidates.push({ x: x - 1, y: y + dy });
      candidates.push({ x: x + w, y: y + dy });
    }

    // Filter to walkable tiles
    const walkable = candidates.filter(pt => this.isWalkable(state, pt.x, pt.y));
    if (walkable.length > 0) {
      return VILLAGE.rng.choice(walkable);
    }
    // Fallback search around
    return { x: Math.max(0, Math.min(VILLAGE.config.MAP_WIDTH - 1, x)), y: Math.max(0, Math.min(VILLAGE.config.MAP_HEIGHT - 1, y)) };
  },

  findNearestBuilding(state, startX, startY, type) {
    const matching = state.buildings.filter(b => b.type === type);
    if (matching.length === 0) return null;

    let nearest = null;
    let minDist = Infinity;
    for (let i = 0; i < matching.length; i++) {
      const b = matching[i];
      const dist = Math.abs(b.x - startX) + Math.abs(b.y - startY);
      if (dist < minDist) {
        minDist = dist;
        nearest = b;
      }
    }
    return nearest;
  },

  findNearestTileOfType(state, startX, startY, tileType) {
    const W = VILLAGE.config.MAP_WIDTH;
    const H = VILLAGE.config.MAP_HEIGHT;
    let nearest = null;
    let minDist = Infinity;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (state.map[y][x].type === tileType) {
          const dist = Math.abs(x - startX) + Math.abs(y - startY);
          if (dist < minDist) {
            minDist = dist;
            nearest = { x, y };
          }
        }
      }
    }
    return nearest;
  },

  /**
   * Robust A* Pathfinding with Manhattan heuristic & straight-line fallback
   */
  findPath(state, startX, startY, goalX, goalY) {
    startX = Math.floor(startX);
    startY = Math.floor(startY);
    goalX = Math.floor(goalX);
    goalY = Math.floor(goalY);

    const W = VILLAGE.config.MAP_WIDTH;
    const H = VILLAGE.config.MAP_HEIGHT;

    // Clamp coordinates
    startX = Math.max(0, Math.min(W - 1, startX));
    startY = Math.max(0, Math.min(H - 1, startY));
    goalX = Math.max(0, Math.min(W - 1, goalX));
    goalY = Math.max(0, Math.min(H - 1, goalY));

    if (startX === goalX && startY === goalY) {
      return [];
    }

    // If goal tile is unwalkable (e.g. clicked on a solid building), pick closest walkable neighbor
    if (!this.isWalkable(state, goalX, goalY)) {
      const neighbors = [
        { x: goalX + 1, y: goalY },
        { x: goalX - 1, y: goalY },
        { x: goalX, y: goalY + 1 },
        { x: goalX, y: goalY - 1 }
      ].filter(n => this.isWalkable(state, n.x, n.y));

      if (neighbors.length > 0) {
        neighbors.sort((a, b) => {
          const da = Math.abs(a.x - startX) + Math.abs(a.y - startY);
          const db = Math.abs(b.x - startX) + Math.abs(b.y - startY);
          return da - db;
        });
        goalX = neighbors[0].x;
        goalY = neighbors[0].y;
      } else {
        return this._straightLineFallback(startX, startY, goalX, goalY);
      }
    }

    // A* algorithm
    const openSet = [];
    const openSetLookup = {};
    const closedSet = new Uint8Array(W * H);
    const gScore = new Float32Array(W * H).fill(1e9);
    const fScore = new Float32Array(W * H).fill(1e9);
    const cameFrom = new Int32Array(W * H).fill(-1);

    const startIndex = startY * W + startX;
    const goalIndex = goalY * W + goalX;

    gScore[startIndex] = 0;
    fScore[startIndex] = Math.abs(startX - goalX) + Math.abs(startY - goalY);

    openSet.push({ index: startIndex, f: fScore[startIndex] });
    openSetLookup[startIndex] = true;

    let iterations = 0;
    const maxIterations = 800; // safety ceiling

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;

      // Find node with lowest fScore
      let lowestIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIdx].f) {
          lowestIdx = i;
        }
      }

      const current = openSet.splice(lowestIdx, 1)[0];
      const curIndex = current.index;
      delete openSetLookup[curIndex];

      if (curIndex === goalIndex) {
        // Reconstruct path
        const path = [];
        let curr = curIndex;
        while (curr !== startIndex && curr !== -1) {
          const cy = Math.floor(curr / W);
          const cx = curr % W;
          path.unshift({ x: cx, y: cy });
          curr = cameFrom[curr];
        }
        return path;
      }

      closedSet[curIndex] = 1;
      const cx = curIndex % W;
      const cy = Math.floor(curIndex / W);

      // 4 directions
      const dirs = [
        { x: cx, y: cy - 1 },
        { x: cx, y: cy + 1 },
        { x: cx - 1, y: cy },
        { x: cx + 1, y: cy }
      ];

      for (let i = 0; i < 4; i++) {
        const nx = dirs[i].x;
        const ny = dirs[i].y;

        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;

        const neighborIndex = ny * W + nx;
        if (closedSet[neighborIndex]) continue;
        if (!this.isWalkable(state, nx, ny)) continue;

        const tentativeG = gScore[curIndex] + 1;
        if (tentativeG < gScore[neighborIndex]) {
          cameFrom[neighborIndex] = curIndex;
          gScore[neighborIndex] = tentativeG;
          const h = Math.abs(nx - goalX) + Math.abs(ny - goalY);
          fScore[neighborIndex] = tentativeG + h;

          if (!openSetLookup[neighborIndex]) {
            openSet.push({ index: neighborIndex, f: fScore[neighborIndex] });
            openSetLookup[neighborIndex] = true;
          }
        }
      }
    }

    // Fallback if blocked
    return this._straightLineFallback(startX, startY, goalX, goalY);
  },

  _straightLineFallback(startX, startY, goalX, goalY) {
    const path = [];
    let cx = startX;
    let cy = startY;
    const maxSteps = 25;
    let steps = 0;

    while ((cx !== goalX || cy !== goalY) && steps < maxSteps) {
      steps++;
      if (cx < goalX) cx++;
      else if (cx > goalX) cx--;
      else if (cy < goalY) cy++;
      else if (cy > goalY) cy--;

      path.push({ x: cx, y: cy });
    }
    return path;
  }
};
