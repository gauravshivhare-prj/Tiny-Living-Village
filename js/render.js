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
  campfireParticles: [],
  stars: [],
  smokeParticles: [],
  lightCanvas: null,
  lightCtx: null,
  _rainPool: [],

  init(state) {
    // Generate static stars for night sky — 120 stars with 3 size classes
    this.stars = [];
    for (var i = 0; i < 120; i++) {
      var sizeRoll = Math.random();
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        size: sizeRoll < 0.15 ? 3 : (sizeRoll < 0.4 ? 2 : 1),
        twinkleOffset: Math.random() * Math.PI * 2
      });
    }

    // Campfire particle pool
    this.campfireParticles = [];

    // General particle pool
    this.particles = [];

    // Rain particle pool
    this._rainPool = [];
    for (var r = 0; r < 180; r++) {
      this._rainPool.push({
        x: Math.random() * (VILLAGE.config.MAP_WIDTH * VILLAGE.config.TILE_SIZE),
        y: Math.random() * (VILLAGE.config.MAP_HEIGHT * VILLAGE.config.TILE_SIZE),
        speed: 7 + Math.random() * 5,
        length: 8 + Math.random() * 6
      });
    }

    // Secondary offscreen canvas for dynamic light blending
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d');

    VILLAGE.bus.on('ui:toggle-rumor-map', function() {
      VILLAGE.render.showRumorMap = !VILLAGE.render.showRumorMap;
    });

    console.log('[VILLAGE.render] Initialized — Enhanced Visuals v2.');
  },

  toggleRumorMap() {
    this.showRumorMap = !this.showRumorMap;
  },

  draw(state, ctx, camera) {
    if (!state || !ctx || !state.map || state.map.length === 0) return;

    var dpr = window.devicePixelRatio || 1;
    var screenW = ctx.canvas.width / dpr;
    var screenH = ctx.canvas.height / dpr;

    // 1. Sky background gradient (time-of-day aware)
    this._drawSkyBackground(state, ctx, screenW, screenH);

    // Apply Camera transform
    ctx.save();
    ctx.translate(screenW / 2, screenH / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Calculate visible tile bounds for viewport culling
    var T = VILLAGE.config.TILE_SIZE;
    var viewLeft   = camera.x - (screenW / 2) / camera.zoom;
    var viewTop    = camera.y - (screenH / 2) / camera.zoom;
    var viewRight  = camera.x + (screenW / 2) / camera.zoom;
    var viewBottom = camera.y + (screenH / 2) / camera.zoom;

    var minTileX = Math.max(0, Math.floor(viewLeft  / T));
    var maxTileX = Math.min(VILLAGE.config.MAP_WIDTH  - 1, Math.ceil(viewRight  / T));
    var minTileY = Math.max(0, Math.floor(viewTop    / T));
    var maxTileY = Math.min(VILLAGE.config.MAP_HEIGHT - 1, Math.ceil(viewBottom / T));

    // 2. Ground Tiles
    this._drawGround(state, ctx, minTileX, maxTileX, minTileY, maxTileY);

    // 3. Buildings (Y-sorted for depth)
    var sortedBuildings = state.buildings.slice().sort(function(a, b) {
      return (a.y + a.h) - (b.y + b.h);
    });
    for (var bi = 0; bi < sortedBuildings.length; bi++) {
      this._drawBuilding(state, ctx, sortedBuildings[bi]);
    }

    // 4. World Props (Trees, Rocks) on top of ground
    this._drawWorldProps(state, ctx, minTileX, maxTileX, minTileY, maxTileY);

    // 5. Particle System update + draw (world-space)
    this._updateAndDrawParticles(state, ctx);

    // 6. Villagers (Y-sorted)
    var sortedVillagers = state.villagers.slice().sort(function(a, b) { return a.y - b.y; });
    for (var vi = 0; vi < sortedVillagers.length; vi++) {
      this._drawVillager(state, ctx, sortedVillagers[vi], vi);
    }

    // 7. Speech & Status Bubbles
    for (var si = 0; si < sortedVillagers.length; si++) {
      if (sortedVillagers[si].bubble) {
        this._drawSpeechBubble(ctx, sortedVillagers[si]);
      }
    }

    // 8. Rumor Map Network Overlay
    if (this.showRumorMap) {
      this._drawRumorNetwork(state, ctx);
    }

    // 9. Build Preview Ghost
    if (VILLAGE.economy && VILLAGE.economy.activeBuildType && VILLAGE.economy.hoverTile) {
      this._drawBuildGhost(state, ctx, VILLAGE.economy.activeBuildType, VILLAGE.economy.hoverTile);
    }

    ctx.restore();

    // 10. Dawn God-rays (screen space)
    this._drawDawnGodrays(state, ctx, screenW, screenH);

    // 11. Day/Night Atmospheric Lighting Pass
    this._drawAtmosphereAndLighting(state, ctx, camera, screenW, screenH);

    // 12. Weather Effects
    this._drawWeatherEffects(state, ctx, camera, screenW, screenH);
  },

  // ─── SKY BACKGROUND ───────────────────────────────────────────────────────

  _drawSkyBackground(state, ctx, screenW, screenH) {
    var time = state.timeOfDay;
    var grad = ctx.createLinearGradient(0, 0, 0, screenH);

    if (time >= 5.5 && time < 7.5) {
      // Dawn: peach/gold
      var t = (time - 5.5) / 2.0;
      grad.addColorStop(0, _lerpColor('#1a1d24', '#ff9966', t));
      grad.addColorStop(1, _lerpColor('#2d3561', '#ffe4a0', t));
    } else if (time >= 7.5 && time < 17.5) {
      // Day: sky blue
      grad.addColorStop(0, '#5ba4cf');
      grad.addColorStop(1, '#c9e8f5');
    } else if (time >= 17.5 && time < 20.0) {
      // Dusk: orange to purple
      var td = (time - 17.5) / 2.5;
      grad.addColorStop(0, _lerpColor('#ff8c42', '#2d1b69', td));
      grad.addColorStop(0.5, _lerpColor('#ff6b35', '#6b2d8b', td));
      grad.addColorStop(1, _lerpColor('#c94040', '#1a0533', td));
    } else {
      // Night: deep navy/indigo
      grad.addColorStop(0, '#0d0f1a');
      grad.addColorStop(1, '#1a1d35');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, screenW, screenH);
  },

  // ─── DAWN GOD-RAYS ────────────────────────────────────────────────────────

  _drawDawnGodrays(state, ctx, screenW, screenH) {
    var time = state.timeOfDay;
    if (time < 5.5 || time > 7.5) return;
    var alpha = 0.08 * (1 - Math.abs(time - 6.5) / 1.0);
    if (alpha <= 0) return;

    ctx.save();
    var numRays = 6;
    var originX = screenW * 0.78;
    var originY = -20;
    for (var r = 0; r < numRays; r++) {
      var angle1 = (r / numRays) * Math.PI * 0.6 + 0.1;
      var angle2 = angle1 + (Math.PI * 0.6 / numRays) * 0.6;
      var dist = Math.max(screenW, screenH) * 2;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(originX + Math.cos(angle1) * dist, originY + Math.sin(angle1) * dist);
      ctx.lineTo(originX + Math.cos(angle2) * dist, originY + Math.sin(angle2) * dist);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 230, 100, ' + alpha + ')';
      ctx.fill();
    }
    ctx.restore();
  },

  // ─── GROUND TILES ─────────────────────────────────────────────────────────

  _drawGround(state, ctx, minX, maxX, minY, maxY) {
    var T   = VILLAGE.config.TILE_SIZE;
    var pal = VILLAGE.config.PALETTE;
    var tick = (VILLAGE.world && VILLAGE.world.shimmerTick) ? VILLAGE.world.shimmerTick : (state.tick * 0.05);

    var grassColors = [pal.grass, pal.grassDark, pal.grassLight];

    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var tile = state.map[y][x];
        var px = x * T;
        var py = y * T;

        if (tile.type === 'grass') {
          // 3-tone color variation using hash
          var gHash = (x * 7 + y * 13 + x * y * 3) % 3;
          ctx.fillStyle = grassColors[gHash];
          ctx.fillRect(px, py, T, T);

          // Tiny pixel grass blades using tile hash
          var bladeHash = (x * 11 + y * 17) % 7;
          if (bladeHash < 4) {
            ctx.strokeStyle = pal.grassDark;
            ctx.lineWidth = 1;
            var bx1 = px + 3 + (bladeHash * 5);
            var bx2 = px + 8 + (bladeHash * 4);
            ctx.beginPath();
            ctx.moveTo(bx1, py + T - 2);
            ctx.lineTo(bx1 - 1, py + T - 6);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(bx2, py + T - 2);
            ctx.lineTo(bx2 + 1, py + T - 7);
            ctx.stroke();
          }

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
          if (tile.decor === 'bridge') {
            // Wooden plank bridge
            ctx.fillStyle = '#6d4c41';
            ctx.fillRect(px, py, T, T);
            ctx.fillStyle = '#4e342e';
            ctx.fillRect(px, py + 2,  T, 2);
            ctx.fillRect(px, py + 10, T, 2);
            ctx.fillRect(px, py + 18, T, 2);
            ctx.fillStyle = '#a1887f';
            ctx.fillRect(px, py,     T, 3);
            ctx.fillRect(px, py + T - 3, T, 3);
          } else {
            // Base path color
            ctx.fillStyle = pal.dirtPath;
            ctx.fillRect(px, py, T, T);

            // Edge darkening
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(px, py, T, 2);       // top edge
            ctx.fillRect(px, py + T - 2, T, 2); // bottom edge
            ctx.fillRect(px, py, 2, T);         // left edge
            ctx.fillRect(px + T - 2, py, 2, T); // right edge

            // Cobblestone pebble variation
            var pHash = (x * 13 + y * 7) % 5;
            ctx.fillStyle = pal.dirtPathBorder;
            if (pHash === 0) {
              ctx.fillRect(px + 3,  py + 4,  4, 3);
              ctx.fillRect(px + 13, py + 14, 3, 3);
            } else if (pHash === 1) {
              ctx.fillRect(px + 10, py + 6,  4, 4);
              ctx.fillRect(px + 4,  py + 15, 3, 3);
            } else if (pHash === 2) {
              ctx.fillRect(px + 6,  py + 3,  3, 3);
              ctx.fillRect(px + 14, py + 12, 4, 3);
            } else if (pHash === 3) {
              ctx.fillRect(px + 2,  py + 10, 4, 3);
              ctx.fillRect(px + 15, py + 5,  3, 4);
            }
          }

        } else if (tile.type === 'sand') {
          // 2-shade sand grain variation
          var sHash = (x * 5 + y * 9) % 3;
          ctx.fillStyle = sHash === 2 ? pal.sandDark : pal.sand;
          ctx.fillRect(px, py, T, T);
          // Fine grain dots
          if (sHash === 1) {
            ctx.fillStyle = pal.sandDark;
            ctx.fillRect(px + 4,  py + 7,  2, 1);
            ctx.fillRect(px + 14, py + 15, 2, 1);
            ctx.fillRect(px + 9,  py + 19, 2, 1);
          }

        } else if (tile.type === 'water') {
          ctx.fillStyle = pal.waterDeep;
          ctx.fillRect(px, py, T, T);

          // Multi-layer animated shimmer: 3 overlapping sin waves
          var w1 = Math.sin(x * 0.5  + y * 0.4  + tick * 2.5);
          var w2 = Math.sin(x * 0.8  + y * 0.2  + tick * 1.8 + 1.2);
          var w3 = Math.sin(x * 0.3  + y * 0.7  + tick * 3.1 + 2.4);
          var combined = (w1 + w2 + w3) / 3.0;

          if (combined > 0.3) {
            ctx.fillStyle = pal.waterShimmer;
            ctx.fillRect(px + 3, py + 7,  10, 2);
          }
          if (w2 > 0.5) {
            ctx.fillStyle = pal.waterShallow;
            ctx.fillRect(px + 10, py + 15, 8, 2);
          }
          if (w3 > 0.6) {
            ctx.fillStyle = 'rgba(144, 202, 249, 0.5)';
            ctx.fillRect(px + 2, py + 18, 14, 1);
          }

          // Foam edge: lighter top/left pixels on water adjacent to non-water
          var hasLandTop    = (y > 0 && state.map[y-1][x].type !== 'water');
          var hasLandLeft   = (x > 0 && state.map[y][x-1].type !== 'water');
          if (hasLandTop) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(px, py, T, 3);
          }
          if (hasLandLeft) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(px, py, 3, T);
          }
        }
      }
    }
  },

  // ─── WORLD PROPS ──────────────────────────────────────────────────────────

  _drawWorldProps(state, ctx, minX, maxX, minY, maxY) {
    var T   = VILLAGE.config.TILE_SIZE;
    var pal = VILLAGE.config.PALETTE;
    var tick = state.tick;

    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var tile = state.map[y][x];
        var px = x * T;
        var py = y * T;

        if (tile.type === 'tree') {
          var treeHash = (x * 13 + y * 7 + x * y) % 10;
          var sway = Math.sin(tick * 0.03 + treeHash * 1.5) * 1.5;

          // Drop shadow ellipse
          ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
          ctx.beginPath();
          ctx.ellipse(px + 12, py + 21, 10, 5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Root flare (2 angled rects)
          ctx.fillStyle = pal.treeTrunk;
          ctx.save();
          ctx.translate(px + 10, py + 20);
          ctx.rotate(-0.3);
          ctx.fillRect(-2, 0, 4, 4);
          ctx.restore();
          ctx.save();
          ctx.translate(px + 14, py + 20);
          ctx.rotate(0.3);
          ctx.fillRect(-2, 0, 4, 4);
          ctx.restore();

          // Trunk — wider
          ctx.fillStyle = pal.treeTrunk;
          ctx.fillRect(px + 9, py + 11, 7, 11);
          // Trunk highlight
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fillRect(px + 9, py + 11, 2, 9);

          // 3-layer canopy with sway
          var cx = px + 12 + sway;
          // Layer 1: large dark base
          ctx.fillStyle = pal.treeCanopyDark;
          ctx.beginPath();
          ctx.arc(cx, py + 9, 12, 0, Math.PI * 2);
          ctx.fill();
          // Layer 2: medium mid-tone slightly up-left
          ctx.fillStyle = pal.treeCanopy;
          ctx.beginPath();
          ctx.arc(cx - 1.5, py + 7, 9, 0, Math.PI * 2);
          ctx.fill();
          // Layer 3: small bright highlight further up-left
          ctx.fillStyle = pal.treeCanopyLight;
          ctx.beginPath();
          ctx.arc(cx - 3, py + 5, 5, 0, Math.PI * 2);
          ctx.fill();

          // 3-5 leaf pixel dots using coordinate hash
          var numDots = 3 + (treeHash % 3);
          for (var d = 0; d < numDots; d++) {
            var dotX = cx - 8 + ((treeHash * 3 + d * 7) % 16);
            var dotY = py + 3 + ((treeHash * 5 + d * 11) % 10);
            ctx.fillStyle = pal.treeCanopyLight;
            ctx.fillRect(dotX, dotY, 2, 2);
          }

        } else if (tile.type === 'stone') {
          // Drop shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
          ctx.beginPath();
          ctx.ellipse(px + 12, py + 18, 9, 4, 0, 0, Math.PI * 2);
          ctx.fill();

          // 3 overlapping rounded rects for cluster look
          ctx.fillStyle = pal.stoneDark;
          ctx.beginPath();
          ctx.roundRect(px + 2, py + 9, 14, 11, [4]);
          ctx.fill();

          ctx.fillStyle = pal.stone;
          ctx.beginPath();
          ctx.roundRect(px + 10, py + 7, 12, 10, [4]);
          ctx.fill();

          ctx.fillStyle = '#8fa0aa';
          ctx.beginPath();
          ctx.roundRect(px + 5, py + 6, 13, 9, [4]);
          ctx.fill();

          // Crack line
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 8,  py + 8);
          ctx.lineTo(px + 13, py + 14);
          ctx.stroke();

          // Moss patches (top-left, using coordinate hash)
          var stoneHash = (x * 11 + y * 17) % 5;
          if (stoneHash < 3) {
            ctx.fillStyle = '#66bb6a';
            ctx.fillRect(px + 5, py + 7,  3, 2);
            if (stoneHash < 2) {
              ctx.fillRect(px + 7, py + 6,  2, 2);
            }
          }

          // Highlight top-left corner reflection
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(px + 6, py + 7, 4, 2);
          ctx.fillRect(px + 6, py + 7, 2, 4);
        }
      }
    }
  },

  // ─── BUILDINGS ────────────────────────────────────────────────────────────

  _drawBuilding(state, ctx, b) {
    var T   = VILLAGE.config.TILE_SIZE;
    var px  = b.x * T;
    var py  = b.y * T;
    var w   = b.w * T;
    var h   = b.h * T;
    var pal = VILLAGE.config.PALETTE;
    var isNight = state.timeOfDay < 5.5 || state.timeOfDay > 19.5;
    var tick = state.tick;

    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.roundRect(px + 3, py + 7, w + 4, h + 2, [6]);
    ctx.fill();

    if (b.type === 'house') {
      this._drawHouse(state, ctx, b, px, py, w, h, pal, isNight, tick);
    } else if (b.type === 'farm') {
      this._drawFarm(state, ctx, b, px, py, w, h, pal, tick);
    } else if (b.type === 'well') {
      this._drawWell(state, ctx, b, px, py, w, h, pal, tick);
    } else if (b.type === 'market') {
      this._drawMarket(state, ctx, b, px, py, w, h, pal, tick);
    } else if (b.type === 'watchtower') {
      this._drawWatchtower(state, ctx, b, px, py, w, h, pal, isNight, tick);
    } else if (b.type === 'campfire') {
      this._drawCampfire(state, ctx, b, px, py, w, h, pal, tick);
    }
  },

  _drawHouse(state, ctx, b, px, py, w, h, pal, isNight, tick) {
    // Side wall (pseudo-3D right face, slightly darker)
    ctx.fillStyle = '#6d5648';
    ctx.fillRect(px + w - 4, py + 18, 6, h - 20);

    // Front wall
    ctx.fillStyle = pal.woodLight;
    ctx.fillRect(px + 4, py + 18, w - 8, h - 22);

    // Door with rounded top arch
    var doorX = px + (w / 2) - 5;
    var doorY = py + h - 14;
    ctx.fillStyle = pal.woodDark;
    ctx.beginPath();
    ctx.arc(doorX + 5, doorY, 5, Math.PI, 0);
    ctx.rect(doorX, doorY, 10, 14);
    ctx.fill();
    // Brass door knob
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(doorX + 7.5, doorY + 7, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Windows
    var winColor = isNight ? '#fff176' : '#90caf9';
    ctx.fillStyle = winColor;
    ctx.fillRect(px + 8, py + 24, 7, 7);
    ctx.fillRect(px + w - 15, py + 24, 7, 7);
    // Window cross frame
    ctx.fillStyle = pal.woodDark;
    ctx.fillRect(px + 11, py + 24, 1, 7);
    ctx.fillRect(px + 8,  py + 27, 7, 1);
    ctx.fillRect(px + w - 12, py + 24, 1, 7);
    ctx.fillRect(px + w - 15, py + 27, 7, 1);

    // Window flower boxes
    var flowerColors = ['#e91e63', '#ff9800', '#9c27b0'];
    ctx.fillStyle = pal.woodDark;
    ctx.fillRect(px + 7, py + 31, 9, 3);
    ctx.fillRect(px + w - 16, py + 31, 9, 3);
    for (var fi = 0; fi < 3; fi++) {
      ctx.fillStyle = flowerColors[fi];
      ctx.fillRect(px + 8 + fi * 2, py + 30, 2, 2);
      ctx.fillRect(px + w - 15 + fi * 2, py + 30, 2, 2);
    }

    // Roof — 3 horizontal strips (gradient-like)
    var roofColor = (b.x % 2 === 0) ? pal.roofRed : pal.roofBlue;
    var roofMid   = (b.x % 2 === 0) ? '#c62828' : '#1565c0';
    var roofLight = (b.x % 2 === 0) ? '#d32f2f' : '#1976d2';
    // Strip 1 (bottom of roof)
    ctx.fillStyle = roofLight;
    ctx.beginPath();
    ctx.moveTo(px,          py + 18);
    ctx.lineTo(px + w / 2,  py + 2);
    ctx.lineTo(px + w,      py + 18);
    ctx.closePath();
    ctx.fill();
    // Strip 2 (mid)
    ctx.fillStyle = roofMid;
    ctx.beginPath();
    ctx.moveTo(px + 4,      py + 18);
    ctx.lineTo(px + w / 2,  py + 5);
    ctx.lineTo(px + w - 4,  py + 18);
    ctx.closePath();
    ctx.fill();
    // Strip 3 (top highlight)
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(px + 7,      py + 17);
    ctx.lineTo(px + w / 2,  py + 5);
    ctx.lineTo(px + w / 2 + 1, py + 8);
    ctx.lineTo(px + 9,      py + 18);
    ctx.closePath();
    ctx.fill();

    // Chimney
    var chiX = px + w - 16;
    ctx.fillStyle = pal.stoneDark;
    ctx.fillRect(chiX, py + 4, 7, 12);
    ctx.fillStyle = pal.stone;
    ctx.fillRect(chiX - 1, py + 2, 9, 3);

    // Multiple smoke puffs at different heights/opacities
    for (var sp = 0; sp < 3; sp++) {
      var puffOffset = (tick * 0.4 + sp * 7) % 24;
      var puffAlpha  = 0.5 - puffOffset / 55;
      var puffR      = 3 + puffOffset * 0.18;
      if (puffAlpha > 0) {
        ctx.fillStyle = 'rgba(220, 220, 220, ' + puffAlpha + ')';
        ctx.beginPath();
        ctx.arc(chiX + 3 + Math.sin(tick * 0.1 + sp) * 2, py - 2 - puffOffset, puffR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  _drawFarm(state, ctx, b, px, py, w, h, pal, tick) {
    // Tilled earth
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(px + 2, py + 2, w - 4, h - 4);

    // Furrows and 4-stage crops
    for (var r = 0; r < 4; r++) {
      var fy = py + 6 + r * 14;
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(px + 4, fy, w - 8, 4);

      for (var col = 0; col < 6; col++) {
        var cx2 = px + 8 + col * 9;
        var stage = Math.floor((tick / 40 + col * 7 + r * 3) % 4);
        if (stage === 0) {
          // Seed — tiny brown dot
          ctx.fillStyle = '#8d6e63';
          ctx.fillRect(cx2 + 1, fy, 2, 2);
        } else if (stage === 1) {
          // Sprout — small green shoot
          ctx.fillStyle = '#8bc34a';
          ctx.fillRect(cx2 + 1, fy - 3, 2, 4);
        } else if (stage === 2) {
          // Mid-growth
          ctx.fillStyle = '#4caf50';
          ctx.fillRect(cx2, fy - 6, 3, 7);
          ctx.fillRect(cx2 - 1, fy - 5, 1, 3); // leaf left
          ctx.fillRect(cx2 + 3, fy - 4, 1, 3); // leaf right
        } else {
          // Ripe golden wheat
          ctx.fillStyle = '#fdd835';
          ctx.fillRect(cx2 - 1, fy - 8, 5, 9);
          ctx.fillStyle = '#e65100';
          ctx.fillRect(cx2, fy - 10, 3, 3);
        }
      }
    }

    // Fence: corner posts + crossbar rails
    var fx = px + 2, ffy = py + 2, fw = w - 4, fh = h - 4;
    ctx.fillStyle = '#8d6e63';
    // Corner posts
    ctx.fillRect(fx,        ffy,        4, 4);
    ctx.fillRect(fx + fw - 4, ffy,      4, 4);
    ctx.fillRect(fx,        ffy + fh - 4, 4, 4);
    ctx.fillRect(fx + fw - 4, ffy + fh - 4, 4, 4);
    // Rails
    ctx.fillStyle = '#a1887f';
    ctx.fillRect(fx + 4, ffy + 1, fw - 8, 2);
    ctx.fillRect(fx + 4, ffy + fh - 3, fw - 8, 2);
    ctx.fillRect(fx + 1, ffy + 4, 2, fh - 8);
    ctx.fillRect(fx + fw - 3, ffy + 4, 2, fh - 8);

    // Scarecrow prop
    var scX = px + w - 10;
    var scY = py + 4;
    // Body cross
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(scX - 1, scY + 2, 2, 12);   // vertical
    ctx.fillRect(scX - 5, scY + 4, 10, 2);   // horizontal arms
    // Hat
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(scX - 3, scY - 2, 6, 2);    // brim
    ctx.fillRect(scX - 2, scY - 5, 4, 4);    // crown
    // Face dot
    ctx.fillStyle = '#ff9800';
    ctx.fillRect(scX, scY, 1, 1);
  },

  _drawWell(state, ctx, b, px, py, w, h, pal, tick) {
    var cx2 = px + w / 2;
    var cy2 = py + h / 2 + 4;

    // Stone ring with alternating light/dark masonry blocks
    var numBlocks = 10;
    for (var bi = 0; bi < numBlocks; bi++) {
      var angle1 = (bi / numBlocks) * Math.PI * 2;
      var angle2 = ((bi + 1) / numBlocks) * Math.PI * 2;
      ctx.fillStyle = (bi % 2 === 0) ? pal.stoneDark : pal.stone;
      ctx.beginPath();
      ctx.moveTo(cx2, cy2);
      ctx.arc(cx2, cy2, 15, angle1, angle2);
      ctx.closePath();
      ctx.fill();
    }

    // Inner well water with shimmer
    var shimmer = Math.sin(tick * 0.1) * 0.3 + 0.7;
    ctx.fillStyle = '#0d47a1';
    ctx.beginPath();
    ctx.arc(cx2, cy2, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(66, 165, 245, ' + shimmer * 0.6 + ')';
    ctx.beginPath();
    ctx.arc(cx2 - 2, cy2 - 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Wooden posts
    ctx.fillStyle = pal.woodDark;
    ctx.fillRect(px + 7,      py + 5, 4, 20);
    ctx.fillRect(px + w - 11, py + 5, 4, 20);

    // Crossbeam
    ctx.fillStyle = pal.woodLight;
    ctx.fillRect(px + 7, py + 5, w - 14, 3);

    // Rope
    ctx.strokeStyle = '#a1887f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx2, py + 7);
    ctx.lineTo(cx2, cy2 - 10);
    ctx.stroke();

    // Bucket hanging
    ctx.fillStyle = '#607d8b';
    ctx.fillRect(cx2 - 3, cy2 - 11, 6, 5);
    ctx.fillStyle = '#78909c';
    ctx.fillRect(cx2 - 2, cy2 - 10, 4, 3);

    // Well roof
    ctx.fillStyle = pal.roofThatch;
    ctx.beginPath();
    ctx.moveTo(px + 4,     py + 7);
    ctx.lineTo(px + w / 2, py - 3);
    ctx.lineTo(px + w - 4, py + 7);
    ctx.closePath();
    ctx.fill();
    // Roof highlight strip
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.moveTo(px + 6,     py + 7);
    ctx.lineTo(px + w / 2, py - 1);
    ctx.lineTo(px + w / 2 + 1, py + 2);
    ctx.lineTo(px + 8,     py + 7);
    ctx.closePath();
    ctx.fill();
  },

  _drawMarket(state, ctx, b, px, py, w, h, pal, tick) {
    // Wooden counter
    ctx.fillStyle = pal.woodLight;
    ctx.fillRect(px + 4, py + 18, w - 8, 16);
    ctx.fillStyle = pal.woodDark;
    ctx.fillRect(px + 4, py + 18, w - 8, 2); // counter edge

    // Striped awning
    var stripeW = w / 4;
    for (var s = 0; s < 4; s++) {
      ctx.fillStyle = (s % 2 === 0) ? '#d32f2f' : '#ffffff';
      ctx.fillRect(px + s * stripeW, py + 2, stripeW, 16);
    }

    // Awning fringe: tiny triangular "teeth"
    var numTeeth = 8;
    var toothW = w / numTeeth;
    for (var t = 0; t < numTeeth; t++) {
      ctx.fillStyle = (t % 2 === 0) ? '#b71c1c' : '#eeeeee';
      ctx.beginPath();
      ctx.moveTo(px + t * toothW,           py + 18);
      ctx.lineTo(px + t * toothW + toothW / 2, py + 22);
      ctx.lineTo(px + t * toothW + toothW,  py + 18);
      ctx.closePath();
      ctx.fill();
    }

    // Hanging produce (dangling circles from awning)
    var produceColors = ['#ff9800', '#f44336', '#9c27b0', '#ffeb3b', '#ff9800'];
    var produceX = [px + 8, px + 15, px + 22, px + 29, px + 36];
    for (var pi = 0; pi < 5 && pi < produceX.length; pi++) {
      if (produceX[pi] < px + w - 4) {
        var dangle = Math.sin(tick * 0.08 + pi * 0.7) * 2;
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(produceX[pi], py + 18);
        ctx.lineTo(produceX[pi] + dangle * 0.5, py + 23 + dangle);
        ctx.stroke();
        ctx.fillStyle = produceColors[pi % produceColors.length];
        ctx.beginPath();
        ctx.arc(produceX[pi] + dangle * 0.5, py + 24 + dangle, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Crates of produce on counter
    ctx.fillStyle = '#ff9800';
    ctx.fillRect(px + 8,  py + 22, 6, 6);
    ctx.fillStyle = '#e91e63';
    ctx.fillRect(px + 18, py + 22, 6, 6);
    ctx.fillStyle = '#7cb342';
    ctx.fillRect(px + 28, py + 22, 6, 6);

    // Price sign board on a post
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(px + w - 10, py + 10, 2, 12);
    ctx.fillStyle = '#fff9c4';
    ctx.fillRect(px + w - 13, py + 8,  8, 7);
    ctx.fillStyle = '#212121';
    ctx.font = 'bold 5px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', px + w - 9, py + 11.5);
  },

  _drawWatchtower(state, ctx, b, px, py, w, h, pal, isNight, tick) {
    // Four timber support legs
    ctx.fillStyle = pal.woodDark;
    ctx.fillRect(px + 5,      py + 14, 5, h - 16);
    ctx.fillRect(px + w - 10, py + 14, 5, h - 16);

    // Cross bracing
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 7,      py + 18);
    ctx.lineTo(px + w - 7,  py + h - 6);
    ctx.moveTo(px + w - 7,  py + 18);
    ctx.lineTo(px + 7,      py + h - 6);
    ctx.stroke();

    // Guard platform (inset from edges for depth)
    ctx.fillStyle = pal.woodLight;
    ctx.fillRect(px + 2,  py + 10, w - 4, 10);
    // Platform front face (depth)
    ctx.fillStyle = pal.woodDark;
    ctx.fillRect(px + 2,  py + 18, w - 4, 3);

    // Railings
    ctx.strokeStyle = '#4e342e';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, w - 4, 10);

    // Guard silhouette at night
    if (isNight) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(px + w / 2 - 3, py + 3, 6, 8);
      // Guard hat
      ctx.fillRect(px + w / 2 - 4, py + 2, 8, 2);
      ctx.fillRect(px + w / 2 - 2, py,     4, 3);
    }

    // Lantern on tower
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(px + w / 2 - 2, py + 3, 5, 5);

    // Flag at top — waving via sin animation
    var flagWave = Math.sin(tick * 0.08) * 2;
    ctx.fillStyle = '#5d4037'; // flagpole
    ctx.fillRect(px + w / 2, py - 8, 2, 12);
    ctx.fillStyle = '#f44336';
    ctx.beginPath();
    ctx.moveTo(px + w / 2 + 2, py - 8);
    ctx.lineTo(px + w / 2 + 10 + flagWave, py - 5);
    ctx.lineTo(px + w / 2 + 2, py - 2);
    ctx.closePath();
    ctx.fill();
  },

  _drawCampfire(state, ctx, b, px, py, w, h, pal, tick) {
    var cx2 = px + w / 2;
    var cy2 = py + h / 2;

    // Warm bloom glow behind flame
    var glow = ctx.createRadialGradient(cx2, cy2, 2, cx2, cy2, 20);
    glow.addColorStop(0, 'rgba(255, 160, 50, 0.4)');
    glow.addColorStop(1, 'rgba(255, 100, 10, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx2, cy2, 20, 0, Math.PI * 2);
    ctx.fill();

    // Stone ring
    ctx.fillStyle = pal.stoneDark;
    ctx.beginPath();
    ctx.arc(cx2, cy2, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.stone;
    ctx.beginPath();
    ctx.arc(cx2, cy2, 10, 0, Math.PI * 2);
    ctx.fill();

    // Ash center
    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.arc(cx2, cy2, 7, 0, Math.PI * 2);
    ctx.fill();

    // Firewood logs (crossed)
    ctx.fillStyle = pal.woodDark;
    ctx.save();
    ctx.translate(cx2, cy2);
    ctx.rotate(0.4);
    ctx.fillRect(-8, -2, 16, 3);
    ctx.rotate(-0.8);
    ctx.fillRect(-8, -2, 16, 3);
    ctx.restore();

    // 4-layer animated flame
    var flicker  = Math.sin(tick * 0.4) * 2;
    var flicker2 = Math.sin(tick * 0.6 + 1.2) * 1.5;

    // Outer: deep orange
    ctx.fillStyle = 'rgba(255, 87, 34, 0.9)';
    ctx.beginPath();
    ctx.arc(cx2, cy2 - 4 + flicker, 8, 0, Math.PI * 2);
    ctx.fill();
    // Inner: orange
    ctx.fillStyle = 'rgba(255, 152, 0, 0.9)';
    ctx.beginPath();
    ctx.arc(cx2, cy2 - 6 + flicker2, 5, 0, Math.PI * 2);
    ctx.fill();
    // Brighter: yellow
    ctx.fillStyle = 'rgba(255, 235, 59, 0.95)';
    ctx.beginPath();
    ctx.arc(cx2, cy2 - 8 + flicker, 3, 0, Math.PI * 2);
    ctx.fill();
    // Core: white
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(cx2, cy2 - 9 + flicker2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Spawn & draw campfire ember particles
    this._spawnCampfireEmbers(cx2, cy2, tick);
    this._drawCampfireEmbers(ctx);
  },

  _spawnCampfireEmbers(cx2, cy2, tick) {
    if (tick % 2 === 0) {
      this.campfireParticles.push({
        x: cx2 + (Math.random() - 0.5) * 6,
        y: cy2 - 8,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(0.6 + Math.random() * 1.0),
        life: 30 + Math.floor(Math.random() * 20),
        maxLife: 50,
        color: Math.random() < 0.5 ? '#ff9800' : '#ffeb3b',
        size: 1 + Math.random()
      });
    }
    // Prune dead particles
    for (var i = this.campfireParticles.length - 1; i >= 0; i--) {
      this.campfireParticles[i].life--;
      this.campfireParticles[i].x += this.campfireParticles[i].vx;
      this.campfireParticles[i].y += this.campfireParticles[i].vy;
      if (this.campfireParticles[i].life <= 0) {
        this.campfireParticles.splice(i, 1);
      }
    }
    // Cap size
    if (this.campfireParticles.length > 60) {
      this.campfireParticles.splice(0, this.campfireParticles.length - 60);
    }
  },

  _drawCampfireEmbers(ctx) {
    for (var i = 0; i < this.campfireParticles.length; i++) {
      var p = this.campfireParticles[i];
      var alpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  },

  // ─── PARTICLE SYSTEM ──────────────────────────────────────────────────────

  _updateAndDrawParticles(state, ctx) {
    var tick = state.tick;

    // Spawn particles
    // Chimney smoke
    var houses = state.buildings.filter(function(b) { return b.type === 'house'; });
    var T = VILLAGE.config.TILE_SIZE;
    for (var hi = 0; hi < houses.length; hi++) {
      var hb = houses[hi];
      if (tick % 8 === hi % 8) {
        this.particles.push({
          x: hb.x * T + hb.w * T - 13,
          y: hb.y * T - 2,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -(0.3 + Math.random() * 0.4),
          life: 60 + Math.floor(Math.random() * 40),
          maxLife: 100,
          type: 'smoke',
          color: '#bdbdbd',
          size: 3 + Math.random() * 2
        });
      }
    }

    // Leaf particles when windy (or always, lightly)
    var trees = [];
    for (var ty = 0; ty < state.map.length; ty++) {
      for (var tx = 0; tx < state.map[ty].length; tx++) {
        if (state.map[ty][tx].type === 'tree') {
          trees.push({ x: tx, y: ty });
        }
      }
    }
    if (tick % 15 === 0 && trees.length > 0) {
      var randTree = trees[Math.floor(Math.random() * trees.length)];
      this.particles.push({
        x: randTree.x * T + 8 + Math.random() * 8,
        y: randTree.y * T + 5,
        vx: (Math.random() - 0.3) * 1.0,
        vy: 0.2 + Math.random() * 0.5,
        life: 50 + Math.floor(Math.random() * 30),
        maxLife: 80,
        type: 'leaf',
        color: Math.random() < 0.5 ? '#66bb6a' : '#aed581',
        size: 2
      });
    }

    // Update & draw
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;

      var alpha = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = alpha;

      if (p.type === 'smoke') {
        var growSize = p.size + (1 - alpha) * 6;
        ctx.fillStyle = 'rgba(189,189,189,1)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, growSize, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'leaf') {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 0.1);
        ctx.fillRect(-p.size, -1, p.size * 2, 2);
        ctx.restore();
      } else if (p.type === 'ember') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      } else if (p.type === 'heart') {
        // Pixel heart
        ctx.fillStyle = '#e91e63';
        ctx.fillRect(p.x,     p.y,     2, 2);
        ctx.fillRect(p.x + 3, p.y,     2, 2);
        ctx.fillRect(p.x - 1, p.y + 1, 7, 2);
        ctx.fillRect(p.x,     p.y + 3, 5, 2);
        ctx.fillRect(p.x + 1, p.y + 5, 3, 1);
      } else if (p.type === 'star') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x,     p.y,     1, 3);
        ctx.fillRect(p.x - 1, p.y + 1, 3, 1);
      }
    }

    ctx.globalAlpha = 1;

    // Cap particle pool
    if (this.particles.length > 300) {
      this.particles.splice(0, this.particles.length - 300);
    }
  },

  // ─── VILLAGERS ────────────────────────────────────────────────────────────

  _drawVillager(state, ctx, v, vIndex) {
    var T  = VILLAGE.config.TILE_SIZE;
    var px = v.x * T + T / 2;
    var py = v.y * T + T / 2;

    // Walking animation bobbing
    var bob      = v.isMoving ? Math.abs(Math.sin(v.walkFrame * 0.5)) * 3 : 0;
    var legSwing = v.isMoving ? Math.sin(v.walkFrame * 0.5) * 4 : 0;

    // Skin tone variety using villager index
    var skinTones = ['#ffcc80', '#d4956a', '#a0522d'];
    var skin = skinTones[(vIndex || 0) % 3];

    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(px, py + 10, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Selection pulsing ring (drawn before villager, ground layer)
    var isSelected = VILLAGE.ui && VILLAGE.ui.selectedVillager && v.id === VILLAGE.ui.selectedVillager.id;
    if (isSelected) {
      var ringR = 10 + Math.sin(state.tick * 0.15) * 2;
      ctx.strokeStyle = 'rgba(255, 236, 64, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py + 2, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Legs (wider, 14px sprites)
    ctx.fillStyle = '#37474f';
    ctx.fillRect(px - 5, py + 3 - bob + legSwing, 4, 7);
    ctx.fillRect(px + 1, py + 3 - bob - legSwing, 4, 7);

    // Job prop: tool belt for builder (stripe around waist)
    if (v.job === 'builder') {
      ctx.fillStyle = '#ff8f00';
      ctx.fillRect(px - 6, py - 1 - bob, 12, 2);
    }

    // Torso / Shirt
    ctx.fillStyle = v.color;
    ctx.fillRect(px - 6, py - 7 - bob, 12, 11);

    // Trader satchel
    if (v.job === 'trader') {
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(px + 6, py - 4 - bob, 5, 5);
      ctx.fillStyle = '#a1887f';
      ctx.fillRect(px + 7, py - 3 - bob, 3, 3);
    }

    // Arms
    ctx.fillStyle = v.color;
    ctx.fillRect(px - 9, py - 6 - bob - legSwing * 0.5, 3, 7);
    ctx.fillRect(px + 6, py - 6 - bob + legSwing * 0.5, 3, 7);

    // Farmer rake (line + cross to side)
    if (v.job === 'farmer') {
      ctx.strokeStyle = '#8d6e63';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px - 10, py - 2 - bob);
      ctx.lineTo(px - 10, py + 6 - bob);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 13, py - 2 - bob);
      ctx.lineTo(px - 7,  py - 2 - bob);
      ctx.stroke();
    }

    // Woodcutter axe over shoulder
    if (v.job === 'woodcutter') {
      ctx.fillStyle = '#8d6e63'; // handle
      ctx.fillRect(px + 9, py - 10 - bob, 2, 10);
      ctx.fillStyle = '#78909c'; // blade
      ctx.beginPath();
      ctx.moveTo(px + 9, py - 10 - bob);
      ctx.lineTo(px + 15, py - 13 - bob);
      ctx.lineTo(px + 15, py - 7 - bob);
      ctx.closePath();
      ctx.fill();
    }

    // Head (14px wide)
    ctx.fillStyle = skin;
    ctx.fillRect(px - 5, py - 15 - bob, 10, 9);

    // Eyebrows
    ctx.fillStyle = v.hairColor || '#5d4037';
    ctx.fillRect(px - 4, py - 14 - bob, 3, 1);
    ctx.fillRect(px + 1, py - 14 - bob, 3, 1);

    // Hair
    ctx.fillStyle = v.hairColor || '#5d4037';
    ctx.fillRect(px - 6, py - 16 - bob, 12, 3);
    ctx.fillRect(px - 6, py - 14 - bob, 2, 4);
    ctx.fillRect(px + 4, py - 14 - bob, 2, 2);

    // Blinking animation per villager
    var villagerBlinkOffset = (v.id ? v.id.charCodeAt(v.id.length - 1) : 0) * 13;
    var isBlinking = ((state.tick + villagerBlinkOffset) % 80 < 3) || (v.needs && v.needs.energy < 20);
    if (!isBlinking) {
      ctx.fillStyle = '#1a1a1a';
      // Eyes (crisper, slightly larger)
      if (v.facing === 'left') {
        ctx.fillRect(px - 4, py - 12 - bob, 3, 2);
      } else if (v.facing === 'right') {
        ctx.fillRect(px + 1, py - 12 - bob, 3, 2);
      } else {
        ctx.fillRect(px - 4, py - 12 - bob, 3, 2);
        ctx.fillRect(px + 1, py - 12 - bob, 3, 2);
      }
      // Eye shine
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 3, py - 12 - bob, 1, 1);
      ctx.fillRect(px + 2, py - 12 - bob, 1, 1);
    } else {
      // Closed eye slit
      ctx.fillStyle = '#795548';
      ctx.fillRect(px - 4, py - 11 - bob, 3, 1);
      ctx.fillRect(px + 1, py - 11 - bob, 3, 1);
    }

    // Miner headlamp glow
    if (v.job === 'miner') {
      ctx.fillStyle = 'rgba(255, 255, 0, 0.35)';
      ctx.beginPath();
      ctx.arc(px + (v.facing === 'left' ? -7 : 7), py - 13 - bob, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Job Hat
    this._drawVillagerHat(ctx, v, px, py - 16 - bob);

    // Emotion indicators
    if (v.needs && v.needs.mood < 25) {
      // Red wavy lines above head
      ctx.strokeStyle = '#f44336';
      ctx.lineWidth = 1.5;
      for (var wi = 0; wi < 3; wi++) {
        ctx.beginPath();
        ctx.moveTo(px - 5 + wi * 4, py - 20 - bob);
        ctx.quadraticCurveTo(px - 3 + wi * 4, py - 23 - bob, px - 1 + wi * 4, py - 20 - bob);
        ctx.stroke();
      }
    }

    if (v.bubble) {
      if (v.bubble.type === 'gift') {
        // Floating heart pixels above head
        ctx.fillStyle = '#e91e63';
        var hx = px - 4;
        var hy = py - 24 - bob - (state.tick % 10) * 0.3;
        ctx.fillRect(hx,     hy,     2, 2);
        ctx.fillRect(hx + 3, hy,     2, 2);
        ctx.fillRect(hx - 1, hy + 1, 7, 2);
        ctx.fillRect(hx,     hy + 3, 5, 2);
        ctx.fillRect(hx + 1, hy + 5, 3, 1);
      } else if (v.bubble.type === 'rumor') {
        // "!" icon
        ctx.fillStyle = '#ff9800';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', px, py - 22 - bob);
      }
    }

    // Night lantern
    var isNight = state.timeOfDay < 5.5 || state.timeOfDay > 19.5;
    if (isNight && v.activity !== 'Sleeping') {
      ctx.fillStyle = '#ffa000';
      ctx.fillRect(px + 7, py - 2 - bob, 3, 4);
      ctx.fillStyle = '#fff9c4';
      ctx.fillRect(px + 8, py - 1 - bob, 1, 2);
    }
  },

  _drawVillagerHat(ctx, v, hx, hy) {
    var c = v.hatColor;

    if (v.job === 'farmer') {
      ctx.fillStyle = c;
      ctx.fillRect(hx - 9, hy + 1, 18, 2); // wide straw brim
      ctx.fillRect(hx - 5, hy - 4, 10, 5); // crown
      // Straw band
      ctx.fillStyle = '#ff8f00';
      ctx.fillRect(hx - 5, hy, 10, 1);
    } else if (v.job === 'woodcutter') {
      ctx.fillStyle = c;
      ctx.fillRect(hx - 6, hy - 3, 12, 6);
      ctx.fillStyle = '#b71c1c';
      ctx.fillRect(hx - 3, hy - 5, 6, 3);
    } else if (v.job === 'cook') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx - 5, hy - 7, 10, 8);
      ctx.fillRect(hx - 6, hy - 9, 12, 4);
    } else if (v.job === 'trader') {
      ctx.fillStyle = c;
      ctx.fillRect(hx - 7, hy - 2, 14, 3);
      ctx.fillStyle = '#00e676';
      ctx.fillRect(hx + 4, hy - 7, 2, 6); // feather
    } else if (v.job === 'miner') {
      ctx.fillStyle = c;
      ctx.fillRect(hx - 6, hy - 2, 12, 4);
      // Lamp on hat
      ctx.fillStyle = '#ffff00';
      ctx.fillRect(hx - 2, hy - 4, 4, 3);
    } else if (v.job === 'builder') {
      ctx.fillStyle = c;
      ctx.fillRect(hx - 6, hy - 2, 13, 5);
      ctx.fillRect(hx + 5,  hy, 5, 2); // cap brim
    }
  },

  // ─── SPEECH BUBBLE ────────────────────────────────────────────────────────

  _drawSpeechBubble(ctx, v) {
    if (!v.bubble) return;

    var T  = VILLAGE.config.TILE_SIZE;
    var bx = v.x * T + T / 2;
    var by = v.y * T - 20;

    ctx.save();
    ctx.font = 'bold 9px monospace';
    var text = v.bubble.text || '';
    var textMetrics = ctx.measureText(text);
    var bubbleW = Math.max(28, textMetrics.width + 12);
    var bubbleH = 16;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx - bubbleW / 2, by - bubbleH, bubbleW, bubbleH, [5]);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(bx - 3, by);
    ctx.lineTo(bx, by + 5);
    ctx.lineTo(bx + 3, by);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#263238';
    ctx.stroke();

    ctx.fillStyle = '#212121';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx, by - bubbleH / 2);
    ctx.restore();
  },

  // ─── RUMOR NETWORK ────────────────────────────────────────────────────────

  _drawRumorNetwork(state, ctx) {
    if (!state.rumors || state.rumors.length === 0) return;
    var T = VILLAGE.config.TILE_SIZE;
    ctx.save();

    for (var ri = 0; ri < state.rumors.length; ri++) {
      var r = state.rumors[ri];
      var origin = null;
      for (var oi = 0; oi < state.villagers.length; oi++) {
        if (state.villagers[oi].id === r.originId) { origin = state.villagers[oi]; break; }
      }
      if (!origin) continue;

      var believers = state.villagers.filter(function(v) {
        return v.beliefs && v.beliefs.some(function(bel) { return bel.rumorId === r.id; });
      });

      for (var beli = 0; beli < believers.length; beli++) {
        var bv = believers[beli];
        if (bv.id === origin.id) continue;
        var x1 = origin.x * T + T / 2;
        var y1 = origin.y * T + T / 2;
        var x2 = bv.x * T + T / 2;
        var y2 = bv.y * T + T / 2;

        ctx.strokeStyle = (r.claim && r.claim.includes('stole')) ?
          'rgba(239, 83, 80, 0.65)' : 'rgba(171, 71, 188, 0.65)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        var midX = (x1 + x2) / 2 + (y2 - y1) * 0.15;
        var midY = (y1 + y2) / 2 - (x2 - x1) * 0.15;
        ctx.quadraticCurveTo(midX, midY, x2, y2);
        ctx.stroke();

        var tt = (state.tick % 40) / 40;
        var dotX = (1-tt)*(1-tt)*x1 + 2*(1-tt)*tt*midX + tt*tt*x2;
        var dotY = (1-tt)*(1-tt)*y1 + 2*(1-tt)*tt*midY + tt*tt*y2;
        ctx.fillStyle = '#ffeb3b';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.setLineDash([]);
    ctx.restore();
  },

  // ─── BUILD GHOST ──────────────────────────────────────────────────────────

  _drawBuildGhost(state, ctx, type, tilePos) {
    var def = VILLAGE.config.BUILDINGS[type];
    if (!def) return;
    var T  = VILLAGE.config.TILE_SIZE;
    var px = tilePos.x * T;
    var py = tilePos.y * T;
    var w  = def.w * T;
    var h  = def.h * T;
    var canBuild = VILLAGE.economy.canBuildAt(state, type, tilePos.x, tilePos.y);
    ctx.save();
    ctx.fillStyle   = canBuild ? 'rgba(76, 175, 80, 0.45)' : 'rgba(244, 67, 54, 0.45)';
    ctx.strokeStyle = canBuild ? '#4caf50' : '#f44336';
    ctx.lineWidth   = 2;
    ctx.fillRect(px, py, w, h);
    ctx.strokeRect(px, py, w, h);
    ctx.restore();
  },

  // ─── ATMOSPHERE & LIGHTING ────────────────────────────────────────────────

  _drawAtmosphereAndLighting(state, ctx, camera, screenW, screenH) {
    var time = state.timeOfDay;
    var darkAlpha = 0;
    var colorTint = [0, 0, 0];

    if (time >= 5.0 && time < 7.0) {
      var t0 = (time - 5.0) / 2.0;
      darkAlpha  = (1 - t0) * 0.65;
      colorTint  = [255, 170, 100];
    } else if (time >= 7.0 && time < 17.5) {
      darkAlpha = 0.0;
    } else if (time >= 17.5 && time < 20.0) {
      var t1 = (time - 17.5) / 2.5;
      darkAlpha  = t1 * 0.72;
      colorTint  = [180, 70, 120];
    } else {
      darkAlpha  = 0.76;
      colorTint  = [10, 16, 42];
    }

    // Stars and moon during night
    if (state.weather === 'clear' && darkAlpha > 0.3) {
      ctx.save();
      for (var i = 0; i < this.stars.length; i++) {
        var s = this.stars[i];
        var twinkle = (Math.sin(state.tick * 0.08 + s.twinkleOffset) + 1) * 0.5;
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (twinkle * 0.9) + ')';
        ctx.fillRect(s.x * screenW, s.y * screenH * 0.6, s.size, s.size);
      }

      // Moon (crescent effect via composite)
      var moonX = screenW * 0.82;
      var moonY = screenH * 0.12;
      ctx.fillStyle = '#fffde7';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 14, 0, Math.PI * 2);
      ctx.fill();
      // Bite cutout for crescent
      ctx.fillStyle = _getMoonBiteColor(time);
      ctx.beginPath();
      ctx.arc(moonX + 7, moonY - 4, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    if (darkAlpha <= 0.02) return;

    // Prepare offscreen light mask
    if (this.lightCanvas.width !== screenW || this.lightCanvas.height !== screenH) {
      this.lightCanvas.width  = screenW;
      this.lightCanvas.height = screenH;
    }

    var lCtx = this.lightCtx;
    lCtx.clearRect(0, 0, screenW, screenH);

    lCtx.fillStyle = 'rgba(' + colorTint[0] + ',' + colorTint[1] + ',' + colorTint[2] + ',' + darkAlpha + ')';
    lCtx.fillRect(0, 0, screenW, screenH);

    lCtx.globalCompositeOperation = 'destination-out';

    var T = VILLAGE.config.TILE_SIZE;

    var carveLight = function(worldX, worldY, radius, strength, r, g, b) {
      var screenPos = VILLAGE.engine.worldToScreen(worldX, worldY);
      var scaledR   = radius * camera.zoom;
      var grad = lCtx.createRadialGradient(
        screenPos.x, screenPos.y, 2,
        screenPos.x, screenPos.y, scaledR
      );
      grad.addColorStop(0,   'rgba(0,0,0,' + strength + ')');
      grad.addColorStop(0.5, 'rgba(0,0,0,' + (strength * 0.6) + ')');
      grad.addColorStop(1,   'rgba(0,0,0,0)');
      lCtx.fillStyle = grad;
      lCtx.beginPath();
      lCtx.arc(screenPos.x, screenPos.y, scaledR, 0, Math.PI * 2);
      lCtx.fill();
    };

    // Campfires — large warm pulsating glow
    var campfires = state.buildings.filter(function(b) { return b.type === 'campfire'; });
    for (var ci = 0; ci < campfires.length; ci++) {
      var cb = campfires[ci];
      var flicker = Math.sin(state.tick * 0.25) * 5;
      carveLight(cb.x * T + (cb.w * T) / 2, cb.y * T + (cb.h * T) / 2, 80 + flicker, 0.98, 255, 160, 50);
    }

    // Wells and Watchtowers — cool blue-white
    var coolBuildings = state.buildings.filter(function(b) { return b.type === 'well' || b.type === 'watchtower'; });
    for (var wbi = 0; wbi < coolBuildings.length; wbi++) {
      var wb = coolBuildings[wbi];
      carveLight(wb.x * T + (wb.w * T) / 2, wb.y * T + (wb.h * T) / 2, 48, 0.78, 200, 230, 255);
    }

    // Houses — warm yellow window light
    var houseBuildings = state.buildings.filter(function(b) { return b.type === 'house'; });
    for (var hbi = 0; hbi < houseBuildings.length; hbi++) {
      var hbld = houseBuildings[hbi];
      carveLight(hbld.x * T + (hbld.w * T) / 2, hbld.y * T + (hbld.h * T) / 2, 40, 0.72, 255, 240, 100);
    }

    // Villagers with lanterns
    for (var vi = 0; vi < state.villagers.length; vi++) {
      var vv = state.villagers[vi];
      if (vv.activity !== 'Sleeping') {
        carveLight(vv.x * T + T / 2, vv.y * T + T / 2, 30, 0.68, 255, 220, 100);
      }
    }

    lCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.lightCanvas, 0, 0);
  },

  // ─── WEATHER EFFECTS ──────────────────────────────────────────────────────

  _drawWeatherEffects(state, ctx, camera, screenW, screenH) {
    if (state.weather === 'rain') {
      ctx.save();
      ctx.strokeStyle = 'rgba(144, 202, 249, 0.65)';
      ctx.lineWidth = 1.5;

      for (var i = 0; i < this._rainPool.length; i++) {
        var p = this._rainPool[i];
        p.y += p.speed;
        p.x -= 2;

        if (p.y > VILLAGE.config.MAP_HEIGHT * VILLAGE.config.TILE_SIZE) {
          p.y = 0;
          p.x = Math.random() * (VILLAGE.config.MAP_WIDTH * VILLAGE.config.TILE_SIZE);
        }

        var screenPos = VILLAGE.engine.worldToScreen(p.x, p.y);
        if (screenPos.x >= 0 && screenPos.x <= screenW &&
            screenPos.y >= 0 && screenPos.y <= screenH) {
          ctx.beginPath();
          ctx.moveTo(screenPos.x, screenPos.y);
          ctx.lineTo(screenPos.x - 3 * camera.zoom, screenPos.y + p.length * camera.zoom);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else if (state.weather === 'fog') {
      ctx.save();
      var fogAlpha = 0.35 + Math.sin(state.tick * 0.02) * 0.1;
      ctx.fillStyle = 'rgba(224, 242, 254, ' + fogAlpha + ')';
      ctx.fillRect(0, 0, screenW, screenH);
      ctx.restore();
    }
  }
};

// ─── HELPERS (module-scoped, not exposed) ─────────────────────────────────

function _lerpColor(hex1, hex2, t) {
  var r1 = parseInt(hex1.slice(1, 3), 16);
  var g1 = parseInt(hex1.slice(3, 5), 16);
  var b1 = parseInt(hex1.slice(5, 7), 16);
  var r2 = parseInt(hex2.slice(1, 3), 16);
  var g2 = parseInt(hex2.slice(3, 5), 16);
  var b2 = parseInt(hex2.slice(5, 7), 16);
  var r  = Math.round(r1 + (r2 - r1) * t);
  var g  = Math.round(g1 + (g2 - g1) * t);
  var b  = Math.round(b1 + (b2 - b1) * t);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function _getMoonBiteColor(timeOfDay) {
  if (timeOfDay >= 5.0 && timeOfDay < 7.0) return '#1a1835';
  if (timeOfDay >= 20.0 || timeOfDay < 5.0) return '#0d0f1a';
  return '#1a1d35';
}
