/**
 * js/engine.js
 * Owner: Core Engine & Runtime Architect
 * 
 * Public API:
 *   - VILLAGE.engine.init(canvas, state): Sets up canvas, camera, input listeners, and clock.
 *   - VILLAGE.engine.start(): Starts the fixed-timestep loop and RAF render loop.
 *   - VILLAGE.engine.stop(): Halts loops.
 *   - VILLAGE.engine.focusOn(worldX, worldY): Smoothly centers the camera.
 *   - VILLAGE.engine.screenToWorld(sx, sy): Converts screen pixels to world coordinates.
 *   - VILLAGE.engine.worldToScreen(wx, wy): Converts world coordinates to screen pixels.
 *   - VILLAGE.engine.setSpeed(multiplier): Adjusts simulation speed.
 *   - VILLAGE.engine.togglePause(): Pauses or resumes simulation.
 * 
 * State fields read/written:
 *   - Reads: state.speed, state.paused, state.villagers, state.day
 *   - Writes: state.tick, state.timeOfDay, state.day, state.paused, state.speed
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.engine = {
  canvas: null,
  ctx: null,
  state: null,
  running: false,

  // Camera state
  camera: {
    x: 0,
    y: 0,
    zoom: 2.0,
    targetZoom: 2.0,
    minZoom: 1.0,
    maxZoom: 4.0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    hasMovedDuringDrag: false
  },

  // Timing
  lastTime: 0,
  accumulator: 0,
  fixedDt: 1 / VILLAGE.config.TICK_RATE, // 0.05s

  init(canvas, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.state = state;

    this._setupResize();
    this._setupInput();

    // Center camera on village square
    const centerX = (VILLAGE.config.MAP_WIDTH * VILLAGE.config.TILE_SIZE) / 2;
    const centerY = (VILLAGE.config.MAP_HEIGHT * VILLAGE.config.TILE_SIZE) / 2;
    this.camera.x = centerX;
    this.camera.y = centerY;

    console.log('[VILLAGE.engine] Initialized.');
  },

  _setupResize() {
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.canvas.width = Math.floor(width * dpr);
      this.canvas.height = Math.floor(height * dpr);
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';

      this.ctx.imageSmoothingEnabled = false;
      this.ctx.scale(dpr, dpr);
    };

    window.addEventListener('resize', resize);
    resize();
  },

  _setupInput() {
    const canvas = this.canvas;

    // Mouse Down (Drag or Click)
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 1 || e.button === 2) {
        this.camera.isDragging = true;
        this.camera.dragStartX = e.clientX;
        this.camera.dragStartY = e.clientY;
        this.camera.hasMovedDuringDrag = false;
      }
    });

    // Mouse Move (Pan Camera or Hover)
    window.addEventListener('mousemove', (e) => {
      if (this.camera.isDragging) {
        const dx = e.clientX - this.camera.dragStartX;
        const dy = e.clientY - this.camera.dragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          this.camera.hasMovedDuringDrag = true;
        }
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
        this.camera.dragStartX = e.clientX;
        this.camera.dragStartY = e.clientY;

        // Clamp camera to map bounds
        const maxW = VILLAGE.config.MAP_WIDTH * VILLAGE.config.TILE_SIZE;
        const maxH = VILLAGE.config.MAP_HEIGHT * VILLAGE.config.TILE_SIZE;
        this.camera.x = Math.max(0, Math.min(maxW, this.camera.x));
        this.camera.y = Math.max(0, Math.min(maxH, this.camera.y));
      } else {
        // Emit hover event for tooltips / highlight
        const rect = canvas.getBoundingClientRect();
        const worldPos = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        VILLAGE.bus.emit('input:hover', { screenX: e.clientX, screenY: e.clientY, worldPos });
      }
    });

    // Mouse Up (Click selection if not dragged)
    window.addEventListener('mouseup', (e) => {
      if (this.camera.isDragging) {
        this.camera.isDragging = false;
        if (!this.camera.hasMovedDuringDrag && e.button === 0) {
          const rect = canvas.getBoundingClientRect();
          const worldPos = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
          this._handleWorldClick(worldPos.x, worldPos.y);
        }
      }
    });

    // Prevent context menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse Wheel (Zoom smoothly towards pointer)
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.camera.zoom * zoomFactor));
      this.camera.zoom = Math.round(newZoom * 100) / 100;
    }, { passive: false });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Don't capture when typing in text inputs (e.g. seed input)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePause();
      } else if (e.code === 'Digit1') {
        this.setSpeed(1);
      } else if (e.code === 'Digit2') {
        this.setSpeed(2);
      } else if (e.code === 'Digit3' || e.code === 'Digit4') {
        this.setSpeed(4);
      } else if (e.code === 'KeyB') {
        VILLAGE.bus.emit('ui:toggle-build-bar');
      } else if (e.code === 'KeyM') {
        VILLAGE.bus.emit('audio:toggle-mute');
      } else if (e.code === 'KeyR') {
        VILLAGE.bus.emit('ui:toggle-rumor-map');
      } else if (e.code === 'Escape') {
        VILLAGE.bus.emit('ui:close-modals');
      }
    });
  },

  _handleWorldClick(worldX, worldY) {
    const tileX = Math.floor(worldX / VILLAGE.config.TILE_SIZE);
    const tileY = Math.floor(worldY / VILLAGE.config.TILE_SIZE);

    // 1. Check if clicked a villager (hit-box ~1.2 tiles radius)
    let clickedVillager = null;
    let minDist = 1.2 * VILLAGE.config.TILE_SIZE;

    for (let i = 0; i < this.state.villagers.length; i++) {
      const v = this.state.villagers[i];
      const vx = v.x * VILLAGE.config.TILE_SIZE + VILLAGE.config.TILE_SIZE / 2;
      const vy = v.y * VILLAGE.config.TILE_SIZE + VILLAGE.config.TILE_SIZE / 2;
      const dist = Math.hypot(vx - worldX, vy - worldY);
      if (dist < minDist) {
        minDist = dist;
        clickedVillager = v;
      }
    }

    if (clickedVillager) {
      VILLAGE.bus.emit('villager:selected', clickedVillager);
      if (VILLAGE.audio) VILLAGE.audio.playBlip(clickedVillager.job);
      return;
    }

    // 2. Check if in building placement mode
    if (VILLAGE.economy && VILLAGE.economy.activeBuildType) {
      VILLAGE.economy.tryPlaceBuilding(this.state, tileX, tileY);
      return;
    }

    // 3. Otherwise clicked a tile / building
    const clickedBuilding = this.state.buildings.find(b => 
      tileX >= b.x && tileX < b.x + b.w && tileY >= b.y && tileY < b.y + b.h
    );

    if (clickedBuilding) {
      VILLAGE.bus.emit('building:clicked', clickedBuilding);
    } else {
      VILLAGE.bus.emit('tile:clicked', { x: tileX, y: tileY });
    }
  },

  screenToWorld(screenX, screenY) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const wx = (screenX - width / 2) / this.camera.zoom + this.camera.x;
    const wy = (screenY - height / 2) / this.camera.zoom + this.camera.y;
    return { x: wx, y: wy };
  },

  worldToScreen(worldX, worldY) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const sx = (worldX - this.camera.x) * this.camera.zoom + width / 2;
    const sy = (worldY - this.camera.y) * this.camera.zoom + height / 2;
    return { x: sx, y: sy };
  },

  focusOn(worldX, worldY) {
    this.camera.x = worldX;
    this.camera.y = worldY;
  },

  setSpeed(mult) {
    this.state.speed = mult;
    this.state.paused = (mult === 0);
    VILLAGE.bus.emit('speed:changed', { speed: mult, paused: this.state.paused });
  },

  togglePause() {
    this.state.paused = !this.state.paused;
    VILLAGE.bus.emit('speed:changed', { speed: this.state.speed, paused: this.state.paused });
  },

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  },

  stop() {
    this.running = false;
  },

  _loop(currentTime) {
    if (!this.running) return;

    const frameTime = Math.min((currentTime - this.lastTime) / 1000, 0.25); // cap lag spikes
    this.lastTime = currentTime;

    // Simulation updates run on fixed timestep when not paused
    if (!this.state.paused && this.state.speed > 0) {
      this.accumulator += frameTime * this.state.speed;

      while (this.accumulator >= this.fixedDt) {
        this._simulationStep(this.fixedDt);
        this.accumulator -= this.fixedDt;
      }
    }

    // Render frame
    if (VILLAGE.render) {
      VILLAGE.render.draw(this.state, this.ctx, this.camera);
    }

    requestAnimationFrame((t) => this._loop(t));
  },

  _simulationStep(dt) {
    this.state.tick++;

    // Advance time of day
    this.state.timeOfDay += VILLAGE.config.HOURS_PER_TICK;

    // Check Day / Night cycle rollover at midnight (24:00)
    if (this.state.timeOfDay >= 24.0) {
      this.state.timeOfDay -= 24.0;
      this.state.day++;

      // Emit day end event: triggers daily diary composition for all villagers
      VILLAGE.bus.emit('day:ended', { day: this.state.day - 1 });
      VILLAGE.stateModule.addLog(this.state, `Dawn breaks on Day ${this.state.day}. A new day begins in the village!`, 'event');
    }

    // Run module updates in logical sequence
    if (VILLAGE.world) VILLAGE.world.update(this.state, dt);
    if (VILLAGE.villagers) VILLAGE.villagers.update(this.state, dt);
    if (VILLAGE.social) VILLAGE.social.update(this.state, dt);
    if (VILLAGE.economy) VILLAGE.economy.update(this.state, dt);
    if (VILLAGE.events) VILLAGE.events.update(this.state, dt);
    if (VILLAGE.ui) VILLAGE.ui.update(this.state, dt);
  }
};
