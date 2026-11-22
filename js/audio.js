/**
 * js/audio.js
 * Owner: Web Audio API & Procedural Sound Synthesizer Engineer
 * 
 * Public API:
 *   - VILLAGE.audio.init(): Initializes Web Audio context and ambient music scheduler.
 *   - VILLAGE.audio.toggleMute(): Toggles master mute state.
 *   - VILLAGE.audio.setVolume(val): Sets master gain (0.0 to 1.0).
 *   - Synthesized SFX: playChatter, playWoodChop, playPickaxe, playHeartChime, playArgumentBuzz, playBell, playBuildFanfare, playErrorBlip, playBlip
 * 
 * State fields read/written:
 *   - No direct state writes; responds to VILLAGE.bus events and user clicks.
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.audio = {
  ctx: null,
  masterGain: null,
  musicGain: null,
  sfxGain: null,
  isMuted: false,
  musicTimer: null,
  melodyIndex: 0,

  init() {
    // Web Audio Context setup
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      console.warn('[VILLAGE.audio] Web Audio API not supported.');
      return;
    }

    VILLAGE.bus.on('audio:toggle-mute', () => {
      this.toggleMute();
    });

    // Resume AudioContext on first user interaction to satisfy browser autoplay policies
    const unlockAudio = () => {
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this._setupGainNodes();
        this._startAmbientMusic();
      } else if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    console.log('[VILLAGE.audio] Initialized.');
  },

  _setupGainNodes() {
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.65, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    this.musicGain.connect(this.masterGain);
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0 : 0.5, this.ctx.currentTime);
    }
    const btn = document.getElementById('btnMute');
    if (btn) btn.textContent = this.isMuted ? '🔇 Muted' : '🔊 Sound';
  },

  setVolume(vol) {
    if (this.masterGain && this.ctx) {
      const clamped = Math.max(0, Math.min(1, vol));
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : clamped, this.ctx.currentTime);
    }
  },

  _ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this._setupGainNodes();
        this._startAmbientMusic();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx !== null;
  },

  // 1. Animal Crossing Style Procedural Chatter Blip
  playChatter(job) {
    if (this.isMuted || !this._ensureContext()) return;

    // Pitch variation per job
    let baseFreq = 420;
    if (job === 'woodcutter' || job === 'miner') baseFreq = 280;
    else if (job === 'cook' || job === 'farmer') baseFreq = 480;
    else if (job === 'trader') baseFreq = 540;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq + Math.random() * 80 - 40, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq + 120, t + 0.08);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.1);
  },

  // 2. Woody Timber Thud
  playWoodChop() {
    if (this.isMuted || !this._ensureContext()) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.09);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.1);
  },

  // 3. Crisp Stone Pickaxe Ping
  playPickaxe() {
    if (this.isMuted || !this._ensureContext()) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1250, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.08);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.1);
  },

  // 4. Warm Arpeggiated Major Triad (Gifts, Reconciliation)
  playHeartChime() {
    if (this.isMuted || !this._ensureContext()) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const t = this.ctx.currentTime + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.35);
    });
  },

  // 5. Dissonant Argument Buzz
  playArgumentBuzz() {
    if (this.isMuted || !this._ensureContext()) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    osc1.frequency.setValueAtTime(160, t);
    osc2.frequency.setValueAtTime(174, t); // minor second dissonance

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.22);
    osc2.stop(t + 0.22);
  },

  // 6. Resonant Harmonic Bell Chime (Town Events)
  playBell() {
    if (this.isMuted || !this._ensureContext()) return;

    const harmonics = [440, 880, 1320];
    harmonics.forEach((freq, i) => {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.3 / (i + 1), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 1.2);
    });
  },

  // 7. Ascending Fanfare (New Building Constructed)
  playBuildFanfare() {
    if (this.isMuted || !this._ensureContext()) return;

    const notes = [392.00, 523.25, 659.25]; // G4, C5, E5
    notes.forEach((freq, idx) => {
      const t = this.ctx.currentTime + idx * 0.1;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.4);
    });
  },

  playErrorBlip() {
    if (this.isMuted || !this._ensureContext()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.15);
  },

  playBlip(job) {
    this.playChatter(job || 'trader');
  },

  // 8. Generative Cozy Ambient Music (Pentatonic / Lydian Lullaby)
  _startAmbientMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);

    // Pentatonic cozy scale notes in Hz (F major pentatonic)
    const scale = [
      349.23, // F4
      392.00, // G4
      440.00, // A4
      523.25, // C5
      587.33, // D5
      698.46  // F5
    ];

    const chords = [
      [349.23, 440.00, 523.25], // F major
      [261.63, 329.63, 392.00], // C major
      [293.66, 349.23, 440.00], // D minor
      [329.63, 392.00, 493.88]  // E minor
    ];

    let chordStep = 0;

    const playMusicalStep = () => {
      if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;

      const t = this.ctx.currentTime;

      // Play soft pad chord every 4 steps
      if (this.melodyIndex % 4 === 0) {
        const chord = chords[chordStep % chords.length];
        chordStep++;

        chord.forEach(freq => {
          const osc = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq / 2, t); // lower octave for pad

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(450, t);

          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(0.06, t + 1.2);
          gain.gain.linearRampToValueAtTime(0.001, t + 3.8);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.musicGain);

          osc.start(t);
          osc.stop(t + 4.0);
        });
      }

      // Gentle bell melody note
      if (Math.random() < 0.75) {
        const noteFreq = scale[Math.floor(Math.random() * scale.length)];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(noteFreq, t);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

        osc.connect(gain);
        gain.connect(this.musicGain);

        osc.start(t);
        osc.stop(t + 1.2);
      }

      this.melodyIndex++;
    };

    // Note step every 900ms
    this.musicTimer = setInterval(playMusicalStep, 900);
  }
};
