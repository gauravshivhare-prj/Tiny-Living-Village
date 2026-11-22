/**
 * js/main.js
 * Owner: Game Director & Boot Orchestrator
 * 
 * Public API:
 *   - VILLAGE.main.startNewGame(seed): Initializes a fresh simulation with custom seed.
 *   - VILLAGE.main.loadGame(): Restores saved village state.
 *   - VILLAGE.main.startTutorial(): Initiates the 4-step interactive tutorial.
 *   - VILLAGE.main.nextTutorialStep(): Advances tutorial slide.
 * 
 * State fields read/written:
 *   - Reads: state
 *   - Writes: global engine state initiation
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.main = {
  tutorialStep: 1,

  boot() {
    console.log('[VILLAGE.main] Booting Tiny Living Village...');

    // 1. Check for existing save game
    const btnContinue = document.getElementById('btnTitleContinue');
    if (VILLAGE.save.hasSave()) {
      if (btnContinue) {
        btnContinue.disabled = false;
        btnContinue.classList.remove('btn-disabled');
      }
    } else {
      if (btnContinue) {
        btnContinue.disabled = true;
        btnContinue.classList.add('btn-disabled');
      }
    }

    // 2. Wire Title Screen Buttons
    const btnNewGame = document.getElementById('btnTitleNew');
    const btnNewSeed = document.getElementById('btnTitleSeed');
    const btnTutorial = document.getElementById('btnTitleTutorial');
    const btnSettings = document.getElementById('btnSettings');
    const btnSaveNow = document.getElementById('btnSaveGame');

    if (btnNewGame) {
      btnNewGame.onclick = () => {
        this._dismissTitle();
        this.startNewGame(Math.floor(Math.random() * 999999));
      };
    }

    if (btnContinue) {
      btnContinue.onclick = () => {
        this._dismissTitle();
        this.loadGame();
      };
    }

    if (btnNewSeed) {
      btnNewSeed.onclick = () => {
        const customSeed = prompt('Enter a village seed (number or word):', 'cozy-valley-42');
        if (customSeed !== null && customSeed.trim() !== '') {
          this._dismissTitle();
          this.startNewGame(customSeed.trim());
        }
      };
    }

    if (btnTutorial) {
      btnTutorial.onclick = () => {
        this._dismissTitle();
        this.startNewGame(4242);
        this.startTutorial();
      };
    }

    if (btnSettings) {
      btnSettings.onclick = () => {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.style.display = 'flex';
      };
    }

    if (btnSaveNow) {
      btnSaveNow.onclick = () => {
        if (VILLAGE.engine && VILLAGE.engine.state) {
          VILLAGE.save.save(VILLAGE.engine.state);
        }
      };
    }

    // Settings Modal controls
    const volumeSlider = document.getElementById('settingVolume');
    if (volumeSlider) {
      volumeSlider.oninput = (e) => {
        if (VILLAGE.audio) VILLAGE.audio.setVolume(parseFloat(e.target.value));
      };
    }

    const dramaSlider = document.getElementById('settingDrama');
    if (dramaSlider) {
      dramaSlider.oninput = (e) => {
        const factor = parseFloat(e.target.value);
        VILLAGE.config.DRAMA_KNOBS.gossipProbability = 0.45 * factor;
        VILLAGE.config.DRAMA_KNOBS.rumorMutationChance = 0.35 * factor;
        VILLAGE.config.DRAMA_KNOBS.temperWeight = 1.25 * factor;
      };
    }

    const btnCloseSettings = document.getElementById('btnCloseSettings');
    if (btnCloseSettings) {
      btnCloseSettings.onclick = () => {
        document.getElementById('settingsModal').style.display = 'none';
      };
    }

    // Tutorial Navigation Buttons
    const btnTutNext = document.getElementById('btnTutNext');
    const btnTutSkip = document.getElementById('btnTutSkip');
    if (btnTutNext) btnTutNext.onclick = () => this.nextTutorialStep();
    if (btnTutSkip) {
      btnTutSkip.onclick = () => {
        document.getElementById('tutorialModal').style.display = 'none';
      };
    }

    // Audio module init
    VILLAGE.audio.init();
  },

  _dismissTitle() {
    const titleModal = document.getElementById('titleModal');
    if (titleModal) titleModal.style.display = 'none';
  },

  startNewGame(seed) {
    console.log(`[VILLAGE.main] Starting new village with seed: ${seed}`);

    // Create fresh shared state
    const state = VILLAGE.stateModule.createInitialState(seed);

    // Initialize world map, buildings, and pathfinding
    VILLAGE.world.init(state);

    // Initialize simulation modules
    VILLAGE.render.init(state);
    VILLAGE.villagers.init(state);
    VILLAGE.social.init(state);
    VILLAGE.memory.init(state);
    VILLAGE.economy.init(state);
    VILLAGE.events.init(state);
    VILLAGE.save.init(state);

    // Initialize canvas engine and UI
    const canvas = document.getElementById('gameCanvas');
    VILLAGE.engine.init(canvas, state);
    VILLAGE.ui.init(state);

    // Start fixed simulation and render loop
    VILLAGE.engine.start();
  },

  loadGame() {
    const loadedState = VILLAGE.save.load();
    if (!loadedState) {
      alert('Could not load saved game. Starting a fresh village instead.');
      this.startNewGame(12345);
      return;
    }

    const canvas = document.getElementById('gameCanvas');
    VILLAGE.render.init(loadedState);
    VILLAGE.villagers.init(loadedState);
    VILLAGE.social.init(loadedState);
    VILLAGE.memory.init(loadedState);
    VILLAGE.economy.init(loadedState);
    VILLAGE.events.init(loadedState);
    VILLAGE.save.init(loadedState);

    VILLAGE.engine.init(canvas, loadedState);
    VILLAGE.ui.init(loadedState);
    VILLAGE.engine.start();
  },

  startTutorial() {
    this.tutorialStep = 1;
    const modal = document.getElementById('tutorialModal');
    if (modal) modal.style.display = 'flex';
    this._renderTutorialStep();
  },

  nextTutorialStep() {
    this.tutorialStep++;
    if (this.tutorialStep > 4) {
      const modal = document.getElementById('tutorialModal');
      if (modal) modal.style.display = 'none';
      this.tutorialStep = 1;
    } else {
      this._renderTutorialStep();
    }
  },

  _renderTutorialStep() {
    const titleEl = document.getElementById('tutTitle');
    const bodyEl = document.getElementById('tutBody');
    const stepEl = document.getElementById('tutStepIndicator');
    const btnNext = document.getElementById('btnTutNext');

    stepEl.textContent = `Step ${this.tutorialStep} of 4`;

    switch (this.tutorialStep) {
      case 1:
        titleEl.textContent = 'Welcome & Camera Navigation';
        bodyEl.innerHTML = `
          <p>Welcome to <strong>Tiny Living Village</strong>, a living top-down world where stories emerge on their own.</p>
          <ul>
            <li><strong>Drag with mouse</strong> to pan the camera across the valley.</li>
            <li><strong>Scroll wheel</strong> to zoom smoothly in and out.</li>
            <li><strong>Spacebar</strong> pauses or resumes time. Use keys <strong>1, 2, 4</strong> to fast-forward.</li>
          </ul>
        `;
        btnNext.textContent = 'Next: Villagers & Diaries →';
        break;

      case 2:
        titleEl.textContent = 'Villagers, Relationships & Diaries';
        bodyEl.innerHTML = `
          <p>Every villager has unique needs (<em>Hunger, Energy, Social, Mood</em>), personality traits, and interpersonal opinions.</p>
          <ul>
            <li><strong>Click any villager</strong> to open their side profile.</li>
            <li>Inspect the <strong>Relationships tab</strong> to see affinity, trust, and feuds.</li>
            <li>Read their <strong>Diary</strong> at day's end—entries are <em>generated dynamically</em> from what actually happened to them!</li>
          </ul>
        `;
        btnNext.textContent = 'Next: Buildings & Economy →';
        break;

      case 3:
        titleEl.textContent = 'Village Economy & Construction';
        bodyEl.innerHTML = `
          <p>Gather Wood, Stone, Food, and Emeralds to expand the settlement.</p>
          <ul>
            <li>Press <strong>B</strong> or click the bottom bar to open the Build Menu.</li>
            <li>Place <strong>Farms</strong> for food, <strong>Houses</strong> for beds, and <strong>Watchtowers</strong> to guard against scares.</li>
            <li>Construct <strong>Campfires</strong> for evening warmth and storytelling!</li>
          </ul>
        `;
        btnNext.textContent = 'Next: Dynamic Rumors & Drama →';
        break;

      case 4:
        titleEl.textContent = 'Rumors, Feuds & Emergent Stories';
        bodyEl.innerHTML = `
          <p>Watch social drama unfold in real time:</p>
          <ul>
            <li>In the evening, villagers gather around the campfire to chat and trade.</li>
            <li>Whispers mutate as they spread! Turn on the <strong>Rumor Map (R)</strong> to visualize information flowing between neighbors.</li>
            <li>Arguments can spark feuds, while heartfelt gifts or apologies can heal broken bonds.</li>
          </ul>
        `;
        btnNext.textContent = 'Begin Simulation! 🌟';
        break;
    }
  }
};

// Bootstrap once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  VILLAGE.main.boot();
});
