/**
 * js/config.js
 * Owner: Lead Game Designer & Systems Architect
 * 
 * Public API:
 *   - VILLAGE.config: constants, tuning knobs, palettes, building definitions, and villager archetypes.
 * 
 * State fields read/written:
 *   - Read-only constants used across all modules.
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.config = {
  // World Grid
  MAP_WIDTH: 40,
  MAP_HEIGHT: 30,
  TILE_SIZE: 24,

  // Time and Simulation
  TICK_RATE: 20, // 20 ticks per second (50ms per tick)
  DAY_LENGTH_SECONDS: 120, // 120 real seconds = 24 in-game hours
  // 1 real second = 0.2 in-game hours = 12 in-game minutes
  HOURS_PER_TICK: (24 / 120) / 20, // 0.01 hours per tick

  // Speed Multipliers
  SPEEDS: {
    PAUSED: 0,
    NORMAL: 1,
    FAST: 2,
    ULTRA: 4
  },

  // Needs Decay & Recovery Rates (per tick)
  NEEDS: {
    HUNGER_DECAY: 0.035,        // drops ~42 points per 120s day
    ENERGY_DECAY: 0.025,        // drops ~30 points while awake
    SOCIAL_DECAY: 0.028,        // drops ~33 points when alone
    HUNGER_RECOVERY_MEAL: 50,   // restored by eating food
    ENERGY_RECOVERY_SLEEP: 0.15,// restored per tick in bed (~10 hours sleep = 100)
    SOCIAL_RECOVERY_CHAT: 18,   // restored per chat
    MOOD_RECOVERY_GIFT: 25      // restored by receiving a gift
  },

  // The 5 Core Drama Tuning Knobs
  DRAMA_KNOBS: {
    gossipProbability: 0.45,    // Chance a conversation turns into rumor sharing
    feudThreshold: -35,         // Affinity below which villagers enter an active feud
    rumorMutationChance: 0.35,  // Probability of a rumor altering its details when retold
    temperWeight: 1.25,         // Multiplier for how easily high temper triggers conflicts
    forgivenessRate: 0.60       // Chance an apology or gift successfully heals a dispute
  },

  // Palette & Color Constants
  PALETTE: {
    grass: '#7cb342',
    grassDark: '#689f38',
    grassLight: '#8bc34a',
    flowerPink: '#e91e63',
    flowerYellow: '#ffeb3b',
    waterDeep: '#1e88e5',
    waterShallow: '#42a5f5',
    waterShimmer: '#90caf9',
    sand: '#e0c068',
    dirtPath: '#c79c5e',
    dirtPathBorder: '#a97d46',
    stone: '#78909c',
    stoneDark: '#546e7a',
    treeTrunk: '#5d4037',
    treeCanopy: '#2e7d32',
    treeCanopyDark: '#1b5e20',
    woodDark: '#4e342e',
    woodLight: '#8d6e63',
    roofRed: '#b71c1c',
    roofBlue: '#1565c0',
    roofThatch: '#f57f17',
    lightCampfire: 'rgba(255, 167, 38, 0.65)',
    lightLantern: 'rgba(255, 224, 130, 0.55)',
    lightWindow: 'rgba(255, 238, 88, 0.70)'
  },

  // Initial Resources
  INITIAL_RESOURCES: {
    wood: 60,
    stone: 40,
    food: 50,
    emeralds: 5
  },

  // Building Types & Specifications
  BUILDINGS: {
    house: {
      type: 'house',
      name: 'House',
      cost: { wood: 30, stone: 15 },
      w: 3,
      h: 3,
      desc: 'Provides cozy beds for villagers to rest and recover energy.',
      jobType: null
    },
    farm: {
      type: 'farm',
      name: 'Farm Plot',
      cost: { wood: 20, stone: 10 },
      w: 3,
      h: 3,
      desc: 'Tilled soil producing wholesome food when tended by a farmer.',
      jobType: 'farmer'
    },
    well: {
      type: 'well',
      name: 'Village Well',
      cost: { wood: 15, stone: 20 },
      w: 2,
      h: 2,
      desc: 'Central social gathering point where villagers exchange daily gossip.',
      jobType: null
    },
    market: {
      type: 'market',
      name: 'Market Stall',
      cost: { wood: 25, stone: 10 },
      w: 2,
      h: 2,
      desc: 'Bustling stall where traders convert goods into emeralds.',
      jobType: 'trader'
    },
    watchtower: {
      type: 'watchtower',
      name: 'Watchtower',
      cost: { wood: 35, stone: 30 },
      w: 2,
      h: 2,
      desc: 'Guards the perimeter against night scares and wandering zombies.',
      jobType: 'builder'
    },
    campfire: {
      type: 'campfire',
      name: 'Campfire',
      cost: { wood: 10, stone: 10 },
      w: 2,
      h: 2,
      desc: 'Warm evening gathering place where songs, stories, and rumors spread.',
      jobType: null
    }
  },

  // 12 Unique Villagers Archetypes
  VILLAGER_PRESETS: [
    {
      id: 'v1',
      name: 'Alden',
      job: 'farmer',
      color: '#4caf50',
      hatColor: '#cddc39',
      hairColor: '#5d4037',
      personality: { kindness: 0.85, temper: 0.20, gossip: 0.30, honesty: 0.90, generosity: 0.75 },
      bio: 'Patient and honest tiller of the soil who loves early sunrises and quiet routines.'
    },
    {
      id: 'v2',
      name: 'Bram',
      job: 'woodcutter',
      color: '#8d6e63',
      hatColor: '#d32f2f',
      hairColor: '#3e2723',
      personality: { kindness: 0.40, temper: 0.75, gossip: 0.35, honesty: 0.80, generosity: 0.45 },
      bio: 'Burly woodchopper with a short fuse, but fiercely dependable in emergencies.'
    },
    {
      id: 'v3',
      name: 'Cora',
      job: 'cook',
      color: '#ff7043',
      hatColor: '#ffffff',
      hairColor: '#e65100',
      personality: { kindness: 0.90, temper: 0.25, gossip: 0.60, honesty: 0.85, generosity: 0.95 },
      bio: 'Warm-hearted chef who believes a hot bowl of mushroom stew solves any grudge.'
    },
    {
      id: 'v4',
      name: 'Dorothy',
      job: 'trader',
      color: '#ab47bc',
      hatColor: '#ffd54f',
      hairColor: '#4a148c',
      personality: { kindness: 0.60, temper: 0.40, gossip: 0.88, honesty: 0.50, generosity: 0.40 },
      bio: 'Savvy merchant with an ear to the ground; she knows everyone’s secrets.'
    },
    {
      id: 'v5',
      name: 'Eldon',
      job: 'miner',
      color: '#78909c',
      hatColor: '#ffb300',
      hairColor: '#263238',
      personality: { kindness: 0.50, temper: 0.35, gossip: 0.20, honesty: 0.95, generosity: 0.50 },
      bio: 'Quiet stonecutter who speaks rarely, observes everything, and never exaggerates.'
    },
    {
      id: 'v6',
      name: 'Flora',
      job: 'builder',
      color: '#26a69a',
      hatColor: '#ff8f00',
      hairColor: '#f06292',
      personality: { kindness: 0.80, temper: 0.30, gossip: 0.45, honesty: 0.85, generosity: 0.70 },
      bio: 'Energetic architect who loves fixing roofs, building bridges, and bringing neighbors together.'
    },
    {
      id: 'v7',
      name: 'Gideon',
      job: 'farmer',
      color: '#558b2f',
      hatColor: '#9e9d24',
      hairColor: '#757575',
      personality: { kindness: 0.35, temper: 0.80, gossip: 0.50, honesty: 0.70, generosity: 0.30 },
      bio: 'Cynical veteran farmer who complains about the weather, but secretly feeds stray animals.'
    },
    {
      id: 'v8',
      name: 'Hazel',
      job: 'cook',
      color: '#ec407a',
      hatColor: '#fff9c4',
      hairColor: '#ad1457',
      personality: { kindness: 0.75, temper: 0.55, gossip: 0.95, honesty: 0.40, generosity: 0.80 },
      bio: 'Dramatic baker whose whispers can spark a village feud or mend a broken heart by nightfall.'
    },
    {
      id: 'v9',
      name: 'Isaac',
      job: 'woodcutter',
      color: '#6d4c41',
      hatColor: '#1976d2',
      hairColor: '#ffb74d',
      personality: { kindness: 0.70, temper: 0.45, gossip: 0.50, honesty: 0.80, generosity: 0.65 },
      bio: 'Youthful apprentice forester; enthusiastic, earnest, and deeply impressionable.'
    },
    {
      id: 'v10',
      name: 'Juniper',
      job: 'trader',
      color: '#ba68c8',
      hatColor: '#00acc1',
      hairColor: '#1a237e',
      personality: { kindness: 0.45, temper: 0.50, gossip: 0.75, honesty: 0.30, generosity: 0.55 },
      bio: 'Witty peddler who spins wild tales of distant lands and rarely lets truth spoil a story.'
    },
    {
      id: 'v11',
      name: 'Kira',
      job: 'miner',
      color: '#607d8b',
      hatColor: '#e53935',
      hairColor: '#d81b60',
      personality: { kindness: 0.55, temper: 0.85, gossip: 0.30, honesty: 0.90, generosity: 0.60 },
      bio: 'Fearless quarry miner; blunt and quick to challenge anyone, but loyal unto death.'
    },
    {
      id: 'v12',
      name: 'Lyle',
      job: 'builder',
      color: '#00897b',
      hatColor: '#ffa000',
      hairColor: '#e0e0e0',
      personality: { kindness: 0.85, temper: 0.15, gossip: 0.25, honesty: 0.90, generosity: 0.85 },
      bio: 'Gentle, philosophical master craftsman who always steps in as the peacemaker.'
    }
  ],

  // Max Caps to Prevent Memory Leaks
  LIMITS: {
    MAX_MEMORIES_PER_VILLAGER: 50,
    MAX_DIARY_ENTRIES: 14,
    MAX_GLOBAL_LOGS: 120,
    MAX_RUMORS_POOL: 40
  }
};
