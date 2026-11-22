# Tiny Living Village

A top-down, cozy, browser-based village simulation where emergent stories, feuds, romances, and rumors unfold on their own.

Built with **plain HTML5, CSS3, and JavaScript with `<canvas>`**.
- **Zero external libraries, zero frameworks, zero build steps.**
- **Zero image files**: every single pixel, sprite, hat, and building is procedurally drawn in code.
- **Zero audio assets**: every footstep, tree chop, bell chime, and ambient melody note is synthesized live with the **Web Audio API**.
- Works immediately by double-clicking `index.html` (runs directly from the file system or on Netlify/GitHub Pages).

---

## 1. Quick Start

### Running Locally
1. Double-click `index.html` in your file explorer.
2. Or serve it via any static file server:
   ```bash
   npx serve .
   # or
   python -m http.server 8000
   ```
3. Open `http://localhost:8000` in any modern web browser.

---

## 2. File Ownership & Architecture

All modules operate under a single global namespace `window.VILLAGE` and communicate exclusively through the shared state contract and decoupled event bus `VILLAGE.bus`.

```
tiny-living-village/
├── index.html          # Semantic HTML shell, canvases, HUD, modal dialogs
├── style.css           # Cozy retro pixel-art aesthetic & responsive drawer styles
├── README.md           # Documentation, architecture, state contract & demo script
└── js/
    ├── config.js       # Lead Designer: Tuning knobs, drama constants, palettes, 12 presets
    ├── state.js        # Systems Architect: Shared state contract, Mulberry32 PRNG, event bus
    ├── world.js        # World Gen & Pathfinding: 40x30 tile map, river, A* pathfinder
    ├── engine.js       # Core Runtime: Fixed-timestep loop (20 ticks/sec), camera pan/zoom
    ├── render.js       # Canvas Specialist: Multi-pass lighting, hats, particles, rumor map
    ├── villagers.js    # AI & Behavior: Needs decay/recovery, 24-hour schedule state machine
    ├── social.js       # Social Systems: Dynamic relationships, feuds, apologies, rumors
    ├── memory.js       # Narrative Engineer: Episodic memory records & generative diary
    ├── economy.js      # Production Specialist: Resource loops, building costs & construction
    ├── events.js       # Dynamic Events: Weather cycles, creeper scares, festivals, traders
    ├── ui.js           # UI/UX Engineer: Floating HUD, side drawer, portrait renderer, ticker, toasts, tooltips
    ├── audio.js        # Audio Synthesizer: Procedural SFX, victory fanfare & generative ambient lullaby
    ├── save.js         # Persistence: Versioned LocalStorage serialization & restoration
    ├── victory.js      # Progression Systems: 5 Win conditions, milestone rewards & victory screen
    └── main.js         # Game Director: Boot sequence, title screen, 4-step tutorial
```

---

## 3. Shared State Contract

The entire world state conforms to the following schema:

```javascript
state = {
  seed: 12345,                  // Deterministic PRNG seed
  tick: 0,                      // Simulation tick counter (20 ticks = 1 sec)
  day: 1,                       // Current day number
  timeOfDay: 6.0,               // 0.0 to 24.0 in-game hours (starts at 6:00 AM dawn)
  weather: 'clear',             // 'clear', 'rain', 'fog', 'festival'
  speed: 1,                     // 0 (paused), 1 (normal), 2 (fast), 4 (ultra)
  paused: false,
  resources: {
    wood: 60,
    stone: 40,
    food: 50,
    emeralds: 5
  },
  map: [                        // 40x30 2D tile array
    // [ { type, walkable, buildingId, decor, elevation, cropStage }, ... ]
  ],
  buildings: [                  // List of placed structures
    // { id, type, name, x, y, w, h, ownerId, level, builtAtTick }
  ],
  villagers: [                  // 12 unique living villagers
    {
      id: 'v1',
      name: 'Alden',
      job: 'farmer',            // farmer, woodcutter, miner, cook, trader, builder
      bio: 'Patient and honest tiller of the soil.',
      color: '#4caf50',
      hatColor: '#cddc39',
      hairColor: '#5d4037',
      x: 18.0,
      y: 13.0,
      path: [],
      homeId: 'bld_1',
      workplaceId: 'bld_2',
      activity: 'Farming',
      bubble: { text: 'Yum!', timer: 2.0 },
      needs: {
        hunger: 85,             // 0-100: drops over time, restored by meals
        energy: 90,             // 0-100: drops while awake, restored in bed
        social: 65,             // 0-100: drops when alone, restored by chats
        mood: 80                // 0-100: dynamic composite of needs and relations
      },
      personality: {
        kindness: 0.85,         // 0.0 - 1.0
        temper: 0.20,
        gossip: 0.30,
        honesty: 0.90,
        generosity: 0.75
      },
      relations: {
        'v2': { affinity: 25, trust: 60, familiarity: 30, lastTick: 120 }
      },
      memories: [
        { id, tick, day, type, otherId, place, item, amount, valence, importance, rumorId }
      ],
      beliefs: [
        { rumorId, versionText, sourceId, confidence }
      ],
      diary: [
        { day: 1, text: "Day 1 began with bright rays kissing the treetops..." }
      ]
    }
  ],
  rumors: [
    {
      id: 'rumor_1',
      subjectId: 'v2',
      originId: 'v4',
      claim: 'accidentally broke the axe of the village elder',
      accuracy: 0.8,
      hops: 1,
      versions: [
        { tellerId: 'v4', text: 'accidentally broke the axe...', tick: 0 },
        { tellerId: 'v8', text: 'shattered the axe and lied about it!', tick: 140 }
      ]
    }
  ],
  log: [                        // Capped event ticker history
    { id, tick, day, timeString, text, type, villagerId, otherId }
  ]
};
```

---

## 4. Simulation Rules

1. **Needs & Schedules**:
   - Needs drain in real-time according to fixed decay coefficients.
   - At 22:00, villagers head to their assigned houses to sleep. Energy restores to 100%.
   - At 06:00, villagers wake, eat breakfast, and proceed to jobs (Farms, Woods, Quarries, Market Stalls, Construction sites).
   - At 12:00, villagers take lunch break at the Well.
   - At 17:30, villagers gather around the Campfire in the village square to chat, dance, trade, and gossip.

2. **Social Interactions**:
   - When two villagers meet (within 1.7 tiles), their personalities, mood, and relational history trigger an interaction:
     - **Friendly Chat**: Restores social needs, boosts familiarity and affinity.
     - **Generous Gift**: High generosity villagers give flowers or pastries, sparking deep gratitude.
     - **Arguments**: High temper villagers with low mood can clash over missing resources or gossip.
     - **Feuds**: When affinity drops below `-35`, villagers enter an active feud. They avoid each other and exchange insults.
     - **Apologies**: High kindness villagers can offer an apology or gift to heal a feud (`forgivenessRate = 0.60`).

3. **Rumor Propagation & Mutation (Telephone Game)**:
   - Gossipers share claims about neighbors.
   - Each retelling has a chance to **mutate**:
     - High gossip tellers **exaggerate** ("dropped an apple" becomes "ruined the entire seasonal harvest").
     - Low honesty tellers **shift blame** onto their rivals.
     - Details drop across hops.
   - The listener's confidence in the rumor depends on their trust in the teller.
   - Believed rumors alter opinions of the subject villager.
   - Press **R** or click **Rumor Map** to see an animated graph overlay connecting rumor origins, spreaders, and listeners across the valley!

4. **Generative Diary**:
   - At the end of each day, every villager composes a personal diary entry.
   - **Never uses canned whole sentences**. Sentences are composed dynamically using a grammar combining:
     - Contextual openers (weather, time, location).
     - Action predicates derived from top structured memory records.
     - Personality phrasing (grumpy, kind, gossipy, or shy reaction).
     - Relational reflection ("I hold Dorothy in the highest regard" vs "I will be keeping a wary distance from Bram").
     - Rumor reactions (confidence vs skepticism).
     - Quiet day reflections if nothing eventful happened.

---

## 5. Controls & Keyboard Shortcuts

- **Mouse Drag**: Pan camera across the valley.
- **Mouse Wheel**: Smooth zoom towards cursor.
- **Left Click**: Select any villager to inspect profile, relationships, beliefs, and diary; or place selected building.
- **Space**: Toggle pause/resume.
- **1 / 2 / 4**: Simulation speed (1x Normal, 2x Fast, 4x Ultra).
- **B**: Toggle building menu hotbar.
- **R**: Toggle Rumor Map network overlay.
- **M**: Toggle audio mute.
- **Esc**: Close inspector drawer or cancel build mode.

---

## 6. 2-Minute Demo Walkthrough Script

Follow these steps to experience all major simulation mechanics in under 2 minutes:

1. **Meet the Settlers (0:00 - 0:25)**:
   - Click **New Village (Random)**.
   - Click on **Alden** (the green farmer) or **Dorothy** (the purple merchant).
   - In the side drawer, view their four needs bars, job badge, and click the **Relationships** tab to see opinions of all 11 neighbors.
   - Switch to the **Rumors & Beliefs** tab to observe the starting rumors seeded into the village.

2. **Town Construction (0:25 - 0:50)**:
   - Press **B** to open the Build Menu at the bottom.
   - Select **Farm Plot** (or **Campfire**) and click on an open grass patch to construct it.
   - Notice the synthesized construction fanfare, the log entry, and watch nearby builders move to inspect the site.

3. **Fast-Forward & Evening Campfire Gathering (0:50 - 1:20)**:
   - Press **4** on your keyboard (or click **4x Speed** in the top HUD).
   - Watch the sun smoothly set as golden dusk shifts to twilight and deep indigo night.
   - Observe warm light glowing from the campfire and house windows.
   - Notice the villagers naturally migrating to the center square to gather around the campfire.

4. **The Rumor Network & Feuds (1:20 - 1:45)**:
   - Press **R** to toggle the **Rumor Map**.
   - Watch glowing dashed arcs connect villagers sharing whispers around the fire, complete with traveling pulses representing information hops!
   - Watch the live event ticker at the bottom: disputes will flare up, insults will be thrown, or generous gifts will be presented.
   - Click any red dispute in the news ticker to instantly focus the camera on the feuding villagers.

5. **Read the Generated Diaries (1:45 - 2:00)**:
   - As midnight passes and Day 2 begins, pause the simulation (**Space**).
   - Click on **Hazel**, **Bram**, or **Gideon**, open their **Daily Diary** tab, and read Day 1's generated entry.
   - Notice how their entry describes the exact arguments, gifts, rumors, and work tasks that physically occurred during their day!

---

## 7. The 5 Drama Tuning Knobs (`js/config.js`)

Located in `VILLAGE.config.DRAMA_KNOBS`:

| Tuning Knob | Default | Effect |
|---|---|---|
| `gossipProbability` | `0.45` | Probability that a conversation turns into rumor sharing. Raise to `0.85` for a village where secrets spread like wildfire. |
| `feudThreshold` | `-35` | Affinity threshold below which villagers enter an active feud. Set to `-15` to make villagers start holding grudges over the slightest slight. |
| `rumorMutationChance` | `0.35` | Chance that a claim distorts or exaggerates when retold. Set to `0.70` for wild "telephone game" inaccuracies. |
| `temperWeight` | `1.25` | Multiplier for how easily high-temper villagers clash into arguments. Raise to `2.0` for constant daily rows. |
| `forgivenessRate` | `0.60` | Chance that an apology or gift mends a broken relationship. Lower to `0.20` for bitter, lifelong rivalries. |

*(You can also adjust the Master Drama Multiplier slider dynamically in the in-game Settings panel `⚙️`)*.

---

## 8. Verification & Quality Bar Checklist

- [x] **Zero External Assets**: All graphics rendered via 2D Canvas primitives; all sound synthesized via Web Audio API.
- [x] **No ES Modules**: Plain `<script>` tags loaded in clean order; runs cleanly via `file:///` double-click.
- [x] **Strict Namespace**: Only `window.VILLAGE` exposed to global scope.
- [x] **Fixed-Timestep Simulation**: 20 ticks/sec simulation accumulator isolated from 60fps rendering.
- [x] **12 Unique Villagers**: Complete personalities, needs, bilateral relations, and daily schedules.
- [x] **Generative Grammar**: Structured memory composition, zero canned sentences.
- [x] **Day/Night & Multi-Pass Lighting**: Smooth celestial palette transitions with campfire/window light masks.
- [x] **Rumor Network Overlay**: Interactive visualizer showing information flow and confidence.
- [x] **State Persistence**: Versioned LocalStorage auto-save and manual restore.
- [x] **Visual Overhaul (v2 Graphics)**: Multi-layer swaying trees, 4-tier crops, pseudo-3D building facades, animated campfire embers, eye blinks, skin tones, and job tools.
- [x] **Interactive Player Agency**: Right-click context menu (Feed, Rest, Whisper Rumors), hover tooltips, and building inspection/upgrades.
- [x] **Winnable Progression**: 5 Win conditions, live goals sidebar, celebration milestones, and victory fanfare screen.

---

## 9. Enhanced Visuals, Interactivity & Victory Progression

### 🎨 Visual Overhaul (v2 Graphics)
- **Living Landscape**: 3-tone grass variation with scattered blades; organic multi-harmonic river ripples with shoreline foam; stone clusters with moss and fracture lines.
- **Dynamic Flora**: 3-layer trees that gently sway in the breeze (`Math.sin(tick)`); 4-stage crops from tender sprouts to ripe golden wheat; scarecrow details.
- **Architectural Depth**: Buildings have shaded side walls for isometric depth, window flower boxes, multi-layered roofs, and drifting chimney smoke puffs.
- **Animated Characters**: 14px detailed villager sprites featuring skin tone diversity, custom job props (rake, axe, headlamp glow, merchant satchel, toolbelt), eye blinking with eye shines, and mood emotion indicators.
- **Atmospheric Celestial Engine**: Smooth sky gradient background, 120 twinkling multi-size stars, crescent moon cutout, and golden dawn god-rays.
- **Particle System**: Real-time simulated embers, chimney smoke, rain droplets, floating hearts, and festive celebration stars.

### 🎮 Player Interactivity & Agency
- **Right-Click Context Menu**:
  - `👁️ Inspect`: Opens the detailed profile drawer.
  - `🍞 Give Food`: Spend 5 village food to nourish a starving neighbor (+30 hunger).
  - `😴 Send to Rest`: Order a tired villager back to their home bed.
  - `💬 Whisper Rumor`: Secretly inject custom gossip directly into a villager's beliefs to trigger emergent village feuds or alliances!
- **Hover Tooltips**: Glancing across the valley displays the villager's name, job icon, and real-time mood emoji.
- **Building Management**: Clicking any building reveals its assigned workers, production output, and allows instant upgrading or demolition.
- **Toast Notifications**: Floating event notifications alert you to feuds, traveling traders, festival celebrations, and night scares.

### 🏆 Win Conditions & Milestones
- **The 5 Goals for Village Prosperity**:
  1. *Thriving Population*: All 12 villagers alive with Mood > 40%.
  2. *Food Security*: 80+ Food in reserves.
  3. *Built Settlement*: 6+ village structures constructed.
  4. *Social Harmony*: 0 active feuds across the entire valley.
  5. *Economic Prosperity*: 30+ Emeralds accumulated.
- **Settlement Milestones**: Day 3 (*Sprouting Hamlet*), Day 7 (*Cozy Village*), Day 15 (*Legendary Settlement*).
- **Victory Screen**: Reaching all 5 goals triggers an animated celebration with falling confetti, a synthesized brass arpeggio fanfare, complete gameplay statistics, and the option to keep playing in sandbox mode.
