/**
 * js/render.js
 * Owner: Lead Visual & Canvas Rendering Engineer
 * 
 * Public API:
 *   - VILLAGE.render.init(state): Prepares particle buffers and render caches.
 *   - VILLAGE.render.draw(state, ctx, camera): Main 60fps render pipeline.
 *   - VILLAGE.render.toggleRumorMap(): Toggles the rumor network visualizer.
 * 
 * State fields read/written:
 *   - Reads: state.map, state.buildings, state.villagers, state.rumors, state.timeOfDay, state.weather, state.tick
 *   - Writes: none (pure rendering module)
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.render = {
  showRumorMap: false,
  particles: [],
  stars: [],
  smokeParticles: [],
  lightCanvas: null,
  lightCtx: null,

  init(state) {
    // Generate static stars for night sky
    this.stars = [];
    for (let i = 0; i < 75; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() < 0.25 ? 2 : 1,
        twinkleOffset: Math.random() * Math.PI * 2
      });
    }

    // Weather particles pool
    this.particles = [];
    for (let i = 0; i < 140; i++) {
      this.particles.push({
        x: Math.random() * (VILLAGE.config.MAP_WIDTH * VILLAGE.config.TILE_SIZE),
        y: Math.random() * (VILLAGE.config.MAP_HEIGHT * VILLAGE.config.TILE_SIZE),
        speed: 7 + Math.random() * 5,
        length: 8 + Math.random() * 6
      });
    }

    // Secondary offscreen canvas for dynamic light blending
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d');

    VILLAGE.bus.on('ui:toggle-rumor-map', () => {
      this.showRumorMap = !this.showRumorMap;
    });

    console.log('[VILLAGE.render] Initialized.');
  },

  draw(state, ctx, camera) {
    if (!state || !ctx || !state.map || state.map.length === 0) return;

    const screenW = ctx.canvas.width / (window.devicePixelRatio || 1);
    const screenH = ctx.canvas.height / (window.devicePixelRatio || 1);

    // 1. Clear background (sky or border color)
    ctx.save();
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, 0, screenW, screenH);

    // Apply Camera transform
    ctx.translate(screenW / 2, screenH / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Calculate visible tile bounds for viewport culling
    const T = VILLAGE.config.TILE_SIZE;
    const viewLeft = camera.x - (screenW / 2) / camera.zoom;
    const viewTop = camera.y - (screenH / 2) / camera.zoom;
    const viewRight = camera.x + (screenW / 2) / camera.zoom;
    const viewBottom = camera.y + (screenH / 2) / camera.zoom;

    const minTileX = Math.max(0, Math.floor(viewLeft / T));
    const maxTileX = Math.min(VILLAGE.config.MAP_WIDTH - 1, Math.ceil(viewRight / T));
    const minTileY = Math.max(0, Math.floor(viewTop / T));
    const maxTileY = Math.min(VILLAGE.config.MAP_HEIGHT - 1, Math.ceil(viewBottom / T));

    // 2. Draw Ground Tiles
    this._drawGround(state, ctx, minTileX, maxTileX, minTileY, maxTileY);

    // 3. Draw Buildings (ordered by Y coordinate for correct depth layering)
    const sortedBuildings = [...state.buildings].sort((a, b) => (a.y + a.h) - (b.y + b.h));
    sortedBuildings.forEach(bld => {
      this._drawBuilding(state, ctx, bld);
    });

    // 4. Draw Natural Props on top of ground (Trees, Rocks)
    this._drawWorldProps(state, ctx, minTileX, maxTileX, minTileY, maxTileY);

    // 5. Draw Villagers (Y-sorted with other actors)
    const sortedVillagers = [...state.villagers].sort((a, b) => a.y - b.y);
    sortedVillagers.forEach(v => {
      this._drawVillager(state, ctx, v);
    });

    // 6. Draw Speech & Status Bubbles
    sortedVillagers.forEach(v => {
      if (v.bubble) {
        this._drawSpeechBubble(ctx, v);
      }
    });

    // 7. Optional: Rumor Map Network Overlay
    if (this.showRumorMap) {
      this._drawRumorNetwork(state, ctx);
    }

    // 8. Build Preview Ghost (if placing building)
    if (VILLAGE.economy && VILLAGE.economy.activeBuildType && VILLAGE.economy.hoverTile) {
      this._drawBuildGhost(state, ctx, VILLAGE.economy.activeBuildType, VILLAGE.economy.hoverTile);
    }

    ctx.restore();

    // 9. Day / Night Atmospheric Lighting Pass (Screen Space Overlay)
    this._drawAtmosphereAndLighting(state, ctx, camera, screenW, screenH);

    // 10. Weather Effects (Rain / Fog)
    this._drawWeatherEffects(state, ctx, camera, screenW, screenH);
  },

  _drawGround(state, ctx, minX, maxX, minY, maxY) {
    const T = VILLAGE.config.TILE_SIZE;
    const pal = VILLAGE.config.PALETTE;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = state.map[y][x];
        const px = x * T;
        const py = y * T;

        if (tile.type === 'grass') {
          // Checker subtle grass variation
          ctx.fillStyle = ((x + y) % 2 === 0) ? pal.grass : pal.grassLight;
          ctx.fillRect(px, py, T, T);

          // Subtle grass details
          if (tile.decor === 'flowers') {
            ctx.fillStyle = ((x * 7 + y * 13) % 2 === 0) ? pal.flowerPink : pal.flowerYellow;
            ctx.fillRect(px + 6, py + 8, 3, 3);
            ctx.fillRect(px + 14, py + 14, 3, 3);
          } else if (tile.decor === 'tallgrass') {
            ctx.fillStyle = pal.grassDark;
            ctx.fillRect(px + 5, py + 12, 2, 5);
            ctx.fillRect(px + 12, py + 8, 2, 6);
          }
        } else if (tile.type === 'dirtPath') {
          ctx.fillStyle = pal.dirtPath;
          ctx.fillRect(px, py, T, T);

          // Path cobblestone/pebble accents
          ctx.fillStyle = pal.dirtPathBorder;
          if (tile.decor === 'bridge') {
            // Wooden planks for river bridge
            ctx.fillStyle = '#6d4c41';
            ctx.fillRect(px, py, T, T);
            ctx.fillStyle = '#4e342e';
            ctx.fillRect(px, py + 2, T, 2);
            ctx.fillRect(px, py + 10, T, 2);
            ctx.fillRect(px, py + 18, T, 2);
            // Bridge railings
            ctx.fillStyle = '#a1887f';
            ctx.fillRect(px, py, T, 3);
            ctx.fillRect(px, py + T - 3, T, 3);
          } else {
            ctx.fillRect(px + 3, py + 4, 3, 2);
            ctx.fillRect(px + 12, py + 14, 2, 2);
            ctx.fillRect(px + 16, py + 7, 3, 2);
          }
        } else if (tile.type === 'sand') {
          ctx.fillStyle = pal.sand;
          ctx.fillRect(px, py, T, T);
        } else if (tile.type === 'water') {
          ctx.fillStyle = pal.waterDeep;
          ctx.fillRect(px, py, T, T);

          // Animated water shimmer waves
          const wave = Math.sin((x * 0.5) + (y * 0.4) + (VILLAGE.world.shimmerTick * 2.5));
          if (wave > 0.4) {
            ctx.fillStyle = pal.waterShimmer;
            ctx.fillRect(px + 4, py + 8, 10, 2);
          } else if (wave < -0.4) {
            ctx.fillStyle = pal.waterShallow;
            ctx.fillRect(px + 10, py + 15, 8, 2);
          }
        }
      }
    }
  },

  _drawWorldProps(state, ctx, minX, maxX, minY, maxY) {
    const T = VILLAGE.config.TILE_SIZE;
    const pal = VILLAGE.config.PALETTE;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = state.map[y][x];
        const px = x * T;
        const py = y * T;

        if (tile.type === 'tree') {
          // Drop shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
          ctx.beginPath();
          ctx.ellipse(px + 12, py + 20, 9, 5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Tree trunk
          ctx.fillStyle = pal.treeTrunk;
          ctx.fillRect(px + 9, py + 12, 6, 10);

          // Tree canopy (multi-tiered green layers)
          ctx.fillStyle = pal.treeCanopyDark;
          ctx.beginPath();
          ctx.arc(px + 12, py + 8, 11, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = pal.treeCanopy;
          ctx.beginPath();
          ctx.arc(px + 11, py + 7, 9, 0, Math.PI * 2);
          ctx.fill();

          // Canopy highlight
          ctx.fillStyle = pal.grassLight;
          ctx.fillRect(px + 7, py + 4, 4, 3);
        } else if (tile.type === 'stone') {
          // Stone boulder
          ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
          ctx.beginPath();
          ctx.ellipse(px + 12, py + 17, 8, 4, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = pal.stoneDark;
          ctx.beginPath();
          ctx.roundRect(px + 4, py + 6, 16, 13, [5]);
          ctx.fill();

          ctx.fillStyle = pal.stone;
          ctx.beginPath();
          ctx.roundRect(px + 6, py + 7, 12, 9, [3]);
          ctx.fill();

          // Highlight
          ctx.fillStyle = '#b0bec5';
          ctx.fillRect(px + 8, py + 8, 4, 2);
        }
      }
    }
  },

  _drawBuilding(state, ctx, b) {
    const T = VILLAGE.config.TILE_SIZE;
    const px = b.x * T;
    const py = b.y * T;
    const w = b.w * T;
    const h = b.h * T;
    const pal = VILLAGE.config.PALETTE;
    const isNight = state.timeOfDay < 5.5 || state.timeOfDay > 19.5;

    // Building drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.roundRect(px + 2, py + 6, w + 4, h + 2, [6]);
    ctx.fill();

    if (b.type === 'house') {
      // Timber foundation
      ctx.fillStyle = pal.woodLight;
      ctx.fillRect(px + 4, py + 18, w - 8, h - 22);

      // Door
      ctx.fillStyle = pal.woodDark;
      ctx.fillRect(px + (w / 2) - 5, py + h - 14, 10, 14);
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(px + (w / 2) + 2, py + h - 7, 2, 2); // knob

      // Windows
      const winColor = isNight ? '#fff176' : '#90caf9';
      ctx.fillStyle = winColor;
      ctx.fillRect(px + 8, py + 24, 7, 7);
      ctx.fillRect(px + w - 15, py + 24, 7, 7);
      // Window frame cross
      ctx.fillStyle = pal.woodDark;
      ctx.fillRect(px + 11, py + 24, 1, 7);
      ctx.fillRect(px + 8, py + 27, 7, 1);
      ctx.fillRect(px + w - 12, py + 24, 1, 7);
      ctx.fillRect(px + w - 15, py + 27, 7, 1);

      // Pitched cozy roof
      ctx.fillStyle = (b.x % 2 === 0) ? pal.roofRed : pal.roofBlue;
      ctx.beginPath();
      ctx.moveTo(px, py + 18);
      ctx.lineTo(px + (w / 2), py + 2);
      ctx.lineTo(px + w, py + 18);
      ctx.closePath();
      ctx.fill();

      // Roof ridge & fascia
      ctx.fillStyle = '#ffffff33';
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 17);
      ctx.lineTo(px + (w / 2), py + 4);
      ctx.lineTo(px + (w / 2), py + 7);
      ctx.lineTo(px + 7, py + 18);
      ctx.closePath();
      ctx.fill();

      // Chimney & rising smoke
      ctx.fillStyle = pal.stoneDark;
      ctx.fillRect(px + w - 16, py + 4, 6, 12);
      ctx.fillStyle = pal.stone;
      ctx.fillRect(px + w - 17, py + 2, 8, 3);

      // Chimney smoke puff
      if (Math.sin(state.tick * 0.15 + b.x) > 0) {
        ctx.fillStyle = 'rgba(230, 230, 230, 0.45)';
        ctx.beginPath();
        const puffY = py - 4 - (state.tick % 20);
        ctx.arc(px + w - 13 + Math.sin(state.tick * 0.2) * 2, puffY, 4, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (b.type === 'farm') {
      // Tilled brown earth furrows
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(px + 2, py + 2, w - 4, h - 4);

      // Furrows & crops
      for (let r = 0; r < 4; r++) {
        const fy = py + 6 + r * 14;
        ctx.fillStyle = '#3e2723';
        ctx.fillRect(px + 4, fy, w - 8, 4);

        // Crops growing on farm
        for (let col = 0; col < 6; col++) {
          const cx = px + 8 + col * 9;
          const stage = (Math.floor(state.tick / 30) + col + r) % 3;
          if (stage === 0) {
            ctx.fillStyle = '#8bc34a'; // young sprout
            ctx.fillRect(cx, fy - 2, 3, 4);
          } else if (stage === 1) {
            ctx.fillStyle = '#ffb300'; // wheat stem
            ctx.fillRect(cx, fy - 5, 3, 7);
          } else {
            ctx.fillStyle = '#fdd835'; // ripe golden wheat
            ctx.fillRect(cx - 1, fy - 7, 5, 9);
            ctx.fillStyle = '#e65100'; // carrot top or wheat tip
            ctx.fillRect(cx, fy - 9, 3, 3);
          }
        }
      }

      // Wooden fence perimeter
      ctx.strokeStyle = '#8d6e63';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, w - 4, h - 4);

    } else if (b.type === 'well') {
      // Stone cylinder
      ctx.fillStyle = pal.stoneDark;
      ctx.beginPath();
      ctx.arc(px + w / 2, py + h / 2 + 4, 15, 0, Math.PI * 2);
      ctx.fill();

      // Deep water center
      ctx.fillStyle = '#0d47a1';
      ctx.beginPath();
      ctx.arc(px + w / 2, py + h / 2 + 4, 9, 0, Math.PI * 2);
      ctx.fill();

      // Wooden posts
      ctx.fillStyle = pal.woodDark;
      ctx.fillRect(px + 7, py + 6, 4, 18);
      ctx.fillRect(px + w - 11, py + 6, 4, 18);

      // Well roof
      ctx.fillStyle = pal.roofThatch;
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 8);
      ctx.lineTo(px + w / 2, py - 2);
      ctx.lineTo(px + w - 4, py + 8);
      ctx.closePath();
      ctx.fill();

    } else if (b.type === 'market') {
      // Wooden counter
      ctx.fillStyle = pal.woodLight;
      ctx.fillRect(px + 4, py + 18, w - 8, 16);

      // Striped awning (red & white alternating)
      const stripeW = w / 4;
      for (let s = 0; s < 4; s++) {
        ctx.fillStyle = (s % 2 === 0) ? '#d32f2f' : '#ffffff';
        ctx.fillRect(px + s * stripeW, py + 2, stripeW, 16);
      }

      // Crates of produce
      ctx.fillStyle = '#ff9800'; // oranges
      ctx.fillRect(px + 8, py + 22, 6, 6);
      ctx.fillStyle = '#e91e63'; // apples
      ctx.fillRect(px + 18, py + 22, 6, 6);
      ctx.fillStyle = '#7cb342'; // greens
      ctx.fillRect(px + 28, py + 22, 6, 6);

    } else if (b.type === 'watchtower') {
      // Four timber support legs
      ctx.fillStyle = pal.woodDark;
      ctx.fillRect(px + 6, py + 12, 5, h - 14);
      ctx.fillRect(px + w - 11, py + 12, 5, h - 14);

      // Cross bracing
      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + 8, py + 16);
      ctx.lineTo(px + w - 8, py + h - 6);
      ctx.moveTo(px + w - 8, py + 16);
      ctx.lineTo(px + 8, py + h - 6);
      ctx.stroke();

      // Guard platform
      ctx.fillStyle = pal.woodLight;
      ctx.fillRect(px + 2, py + 8, w - 4, 10);
      // Railings
      ctx.strokeStyle = '#4e342e';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, w - 4, 8);

      // Lantern on tower
      ctx.fillStyle = '#ffd54f';
      ctx.fillRect(px + w / 2 - 2, py + 3, 5, 5);

    } else if (b.type === 'campfire') {
      // Stone ring
      ctx.fillStyle = pal.stoneDark;
      ctx.beginPath();
      ctx.arc(px + w / 2, py + h / 2, 12, 0, Math.PI * 2);
      ctx.fill();

      // Ash center
      ctx.fillStyle = '#212121';
      ctx.beginPath();
      ctx.arc(px + w / 2, py + h / 2, 8, 0, Math.PI * 2);
      ctx.fill();

      // Firewood logs
      ctx.fillStyle = pal.woodDark;
      ctx.fillRect(px + w / 2 - 8, py + h / 2 - 2, 16, 4);
      ctx.fillRect(px + w / 2 - 2, py + h / 2 - 8, 4, 16);

      // Animated campfire flame & sparks
      const flameFlicker = Math.sin(state.tick * 0.4) * 2;
      ctx.fillStyle = '#ff5722';
      ctx.beginPath();
      ctx.arc(px + w / 2, py + h / 2 - 3 + flameFlicker, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.arc(px + w / 2, py + h / 2 - 4 + flameFlicker, 4, 0, Math.PI * 2);
      ctx.fill();

      // Floating ember
      ctx.fillStyle = '#ff9800';
      const emberY = py + h / 2 - 8 - (state.tick % 15);
      ctx.fillRect(px + w / 2 + Math.sin(state.tick * 0.3) * 4, emberY, 2, 2);
    }
  },

  _drawVillager(state, ctx, v) {
    const T = VILLAGE.config.TILE_SIZE;
    const px = v.x * T + T / 2;
    const py = v.y * T + T / 2;

    // Walking animation bobbing
    const bob = v.isMoving ? Math.abs(Math.sin(v.walkFrame * 0.5)) * 3 : 0;
    const legSwing = v.isMoving ? Math.sin(v.walkFrame * 0.5) * 4 : 0;

    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(px, py + 8, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#37474f';
    ctx.fillRect(px - 4, py + 2 - bob + legSwing, 3, 6);
    ctx.fillRect(px + 1, py + 2 - bob - legSwing, 3, 6);

    // Torso / Shirt (Job Color)
    ctx.fillStyle = v.color;
    ctx.fillRect(px - 5, py - 6 - bob, 10, 9);

    // Arms / Sleeves
    ctx.fillStyle = v.color;
    ctx.fillRect(px - 7, py - 5 - bob - legSwing * 0.5, 2, 6);
    ctx.fillRect(px + 5, py - 5 - bob + legSwing * 0.5, 2, 6);

    // Head / Face
    ctx.fillStyle = '#ffcc80'; // warm skin tone
    ctx.fillRect(px - 4, py - 13 - bob, 8, 7);

    // Hair
    ctx.fillStyle = v.hairColor || '#5d4037';
    ctx.fillRect(px - 5, py - 14 - bob, 10, 3);
    ctx.fillRect(px - 5, py - 12 - bob, 2, 3);

    // Eyes (with blinking)
    const isBlinking = (state.tick % 70 === 0 || (v.needs && v.needs.energy < 20));
    if (!isBlinking) {
      ctx.fillStyle = '#212121';
      // Look direction
      if (v.facing === 'left') {
        ctx.fillRect(px - 3, py - 10 - bob, 2, 2);
      } else if (v.facing === 'right') {
        ctx.fillRect(px + 1, py - 10 - bob, 2, 2);
      } else {
        ctx.fillRect(px - 3, py - 10 - bob, 2, 2);
        ctx.fillRect(px + 1, py - 10 - bob, 2, 2);
      }
    } else {
      // Sleepy closed eye slit
      ctx.fillStyle = '#795548';
      ctx.fillRect(px - 3, py - 9 - bob, 2, 1);
      ctx.fillRect(px + 1, py - 9 - bob, 2, 1);
    }

    // Job Hat
    this._drawVillagerHat(ctx, v, px, py - 14 - bob);

    // Lantern at night
    const isNight = state.timeOfDay < 5.5 || state.timeOfDay > 19.5;
    if (isNight && v.activity !== 'Sleeping') {
      ctx.fillStyle = '#ffa000';
      ctx.fillRect(px + 6, py - 2 - bob, 3, 4);
      ctx.fillStyle = '#fff9c4';
      ctx.fillRect(px + 7, py - 1 - bob, 1, 2);
    }
  },

  _drawVillagerHat(ctx, v, hx, hy) {
    const c = v.hatColor;

    if (v.job === 'farmer') {
      // Wide brim straw hat
      ctx.fillStyle = c;
      ctx.fillRect(hx - 8, hy + 1, 16, 2);
      ctx.fillRect(hx - 4, hy - 3, 8, 4);
    } else if (v.job === 'woodcutter') {
      // Lumberjack knit beanie
      ctx.fillStyle = c;
      ctx.fillRect(hx - 5, hy - 3, 10, 5);
      ctx.fillStyle = '#b71c1c';
      ctx.fillRect(hx - 2, hy - 5, 4, 3);
    } else if (v.job === 'cook') {
      // Chef toque
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx - 4, hy - 6, 8, 7);
      ctx.fillRect(hx - 5, hy - 8, 10, 4);
    } else if (v.job === 'trader') {
      // Feather beret
      ctx.fillStyle = c;
      ctx.fillRect(hx - 6, hy - 2, 12, 3);
      ctx.fillStyle = '#00e676'; // green feather
      ctx.fillRect(hx + 3, hy - 6, 2, 5);
    } else if (v.job === 'miner') {
      // Hardhat with glowing headlamp
      ctx.fillStyle = c;
      ctx.fillRect(hx - 5, hy - 2, 10, 4);
      ctx.fillStyle = '#ffff00'; // light
      ctx.fillRect(hx - 1, hy - 3, 3, 3);
    } else if (v.job === 'builder') {
      // Builder cap
      ctx.fillStyle = c;
      ctx.fillRect(hx - 5, hy - 2, 11, 4);
      ctx.fillRect(hx + 4, hy, 4, 2);
    }
  },

  _drawSpeechBubble(ctx, v) {
    if (!v.bubble) return;

    const T = VILLAGE.config.TILE_SIZE;
    const bx = v.x * T + T / 2;
    const by = v.y * T - 18;

    ctx.save();
    ctx.font = 'bold 9px monospace';
    const text = v.bubble.text || '';
    const textMetrics = ctx.measureText(text);
    const bubbleW = Math.max(28, textMetrics.width + 12);
    const bubbleH = 16;

    // Bubble box
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx - bubbleW / 2, by - bubbleH, bubbleW, bubbleH, [5]);
    ctx.fill();
    ctx.stroke();

    // Pointer tail
    ctx.beginPath();
    ctx.moveTo(bx - 3, by);
    ctx.lineTo(bx, by + 4);
    ctx.lineTo(bx + 3, by);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();

    // Bubble text or icon
    ctx.fillStyle = '#212121';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx, by - bubbleH / 2);

    ctx.restore();
  },

  _drawRumorNetwork(state, ctx) {
    if (!state.rumors || state.rumors.length === 0) return;

    const T = VILLAGE.config.TILE_SIZE;
    ctx.save();

    state.rumors.forEach(r => {
      // Draw lines between origin and villagers who believe this rumor
      const origin = state.villagers.find(v => v.id === r.originId);
      if (!origin) return;

      const believers = state.villagers.filter(v => 
        v.beliefs && v.beliefs.some(b => b.rumorId === r.id)
      );

      believers.forEach(b => {
        if (b.id === origin.id) return;

        const x1 = origin.x * T + T / 2;
        const y1 = origin.y * T + T / 2;
        const x2 = b.x * T + T / 2;
        const y2 = b.y * T + T / 2;

        // Glowing connection arc
        ctx.strokeStyle = (r.claim && r.claim.includes('stole')) ? 'rgba(239, 83, 80, 0.65)' : 'rgba(171, 71, 188, 0.65)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        const midX = (x1 + x2) / 2 + (y2 - y1) * 0.15;
        const midY = (y1 + y2) / 2 - (x2 - x1) * 0.15;
        ctx.quadraticCurveTo(midX, midY, x2, y2);
        ctx.stroke();

        // Pulsing dot travelling along the line
        const t = (state.tick % 40) / 40;
        const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * midX + t * t * x2;
        const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * midY + t * t * y2;

        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    ctx.restore();
  },

  _drawBuildGhost(state, ctx, type, tilePos) {
    const def = VILLAGE.config.BUILDINGS[type];
    if (!def) return;

    const T = VILLAGE.config.TILE_SIZE;
    const px = tilePos.x * T;
    const py = tilePos.y * T;
    const w = def.w * T;
    const h = def.h * T;

    const canBuild = VILLAGE.economy.canBuildAt(state, type, tilePos.x, tilePos.y);

    ctx.save();
    ctx.fillStyle = canBuild ? 'rgba(76, 175, 80, 0.45)' : 'rgba(244, 67, 54, 0.45)';
    ctx.strokeStyle = canBuild ? '#4caf50' : '#f44336';
    ctx.lineWidth = 2;

    ctx.fillRect(px, py, w, h);
    ctx.strokeRect(px, py, w, h);
    ctx.restore();
  },

  _drawAtmosphereAndLighting(state, ctx, camera, screenW, screenH) {
    const time = state.timeOfDay; // 0.0 to 24.0
    let darkAlpha = 0;
    let colorTint = [0, 0, 0];

    // Day/Night lighting calculation
    if (time >= 5.0 && time < 7.0) {
      // Dawn (golden peach tint)
      const t = (time - 5.0) / 2.0;
      darkAlpha = (1 - t) * 0.65;
      colorTint = [255, 170, 100];
    } else if (time >= 7.0 && time < 17.5) {
      // Daytime (fully clear)
      darkAlpha = 0.0;
    } else if (time >= 17.5 && time < 20.0) {
      // Dusk (amber fading to violet)
      const t = (time - 17.5) / 2.5;
      darkAlpha = t * 0.72;
      colorTint = [180, 70, 120];
    } else {
      // Night (deep navy blue indigo darkness)
      darkAlpha = 0.76;
      colorTint = [10, 16, 42];
    }

    if (darkAlpha <= 0.02) return; // daytime skip

    // Prepare offscreen light mask
    if (this.lightCanvas.width !== screenW || this.lightCanvas.height !== screenH) {
      this.lightCanvas.width = screenW;
      this.lightCanvas.height = screenH;
    }

    const lCtx = this.lightCtx;
    lCtx.clearRect(0, 0, screenW, screenH);

    // Fill night darkness
    lCtx.fillStyle = `rgba(${colorTint[0]}, ${colorTint[1]}, ${colorTint[2]}, ${darkAlpha})`;
    lCtx.fillRect(0, 0, screenW, screenH);

    // Carve out light circles with 'destination-out'
    lCtx.globalCompositeOperation = 'destination-out';

    const T = VILLAGE.config.TILE_SIZE;

    // Helper: carve light circle
    const carveLight = (worldX, worldY, radius, strength) => {
      const screenPos = VILLAGE.engine.worldToScreen(worldX, worldY);
      const scaledR = radius * camera.zoom;

      const grad = lCtx.createRadialGradient(
        screenPos.x, screenPos.y, 2,
        screenPos.x, screenPos.y, scaledR
      );
      grad.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
      grad.addColorStop(0.5, `rgba(0, 0, 0, ${strength * 0.6})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      lCtx.fillStyle = grad;
      lCtx.beginPath();
      lCtx.arc(screenPos.x, screenPos.y, scaledR, 0, Math.PI * 2);
      lCtx.fill();
    };

    // 1. Campfires (large warm pulsating glow)
    state.buildings.filter(b => b.type === 'campfire').forEach(b => {
      const flicker = Math.sin(state.tick * 0.25) * 5;
      carveLight(b.x * T + (b.w * T) / 2, b.y * T + (b.h * T) / 2, 75 + flicker, 0.95);
    });

    // 2. Wells and Watchtowers
    state.buildings.filter(b => b.type === 'well' || b.type === 'watchtower').forEach(b => {
      carveLight(b.x * T + (b.w * T) / 2, b.y * T + (b.h * T) / 2, 45, 0.75);
    });

    // 3. Houses with occupants
    state.buildings.filter(b => b.type === 'house').forEach(b => {
      carveLight(b.x * T + (b.w * T) / 2, b.y * T + (b.h * T) / 2, 38, 0.70);
    });

    // 4. Villagers carrying lanterns
    state.villagers.forEach(v => {
      if (v.activity !== 'Sleeping') {
        carveLight(v.x * T + T / 2, v.y * T + T / 2, 28, 0.65);
      }
    });

    lCtx.globalCompositeOperation = 'source-over';

    // Draw darkness mask onto main screen
    ctx.drawImage(this.lightCanvas, 0, 0);

    // Draw twinkling stars if night and clear
    if (state.weather === 'clear' && darkAlpha > 0.4) {
      ctx.save();
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        const twinkle = (Math.sin(state.tick * 0.08 + s.twinkleOffset) + 1) * 0.5;
        ctx.fillStyle = `rgba(255, 255, 255, ${twinkle * 0.8})`;
        ctx.fillRect(s.x * screenW, s.y * screenH, s.size, s.size);
      }
      ctx.restore();
    }
  },

  _drawWeatherEffects(state, ctx, camera, screenW, screenH) {
    if (state.weather === 'rain') {
      ctx.save();
      ctx.strokeStyle = 'rgba(144, 202, 249, 0.65)';
      ctx.lineWidth = 1.5;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        p.y += p.speed;
        p.x -= 2;

        if (p.y > VILLAGE.config.MAP_HEIGHT * VILLAGE.config.TILE_SIZE) {
          p.y = 0;
          p.x = Math.random() * (VILLAGE.config.MAP_WIDTH * VILLAGE.config.TILE_SIZE);
        }

        const screenPos = VILLAGE.engine.worldToScreen(p.x, p.y);
        if (screenPos.x >= 0 && screenPos.x <= screenW && screenPos.y >= 0 && screenPos.y <= screenH) {
          ctx.beginPath();
          ctx.moveTo(screenPos.x, screenPos.y);
          ctx.lineTo(screenPos.x - 3 * camera.zoom, screenPos.y + p.length * camera.zoom);
          ctx.stroke();
        }
      }
      ctx.restore();

    } else if (state.weather === 'fog') {
      ctx.save();
      const fogAlpha = 0.35 + Math.sin(state.tick * 0.02) * 0.1;
      ctx.fillStyle = `rgba(224, 242, 254, ${fogAlpha})`;
      ctx.fillRect(0, 0, screenW, screenH);
      ctx.restore();
    }
  }
};
