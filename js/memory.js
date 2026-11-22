/**
 * js/memory.js
 * Owner: Generative Narrative & Episodic Memory Engineer
 * 
 * Public API:
 *   - VILLAGE.memory.init(state): Binds to day-end events and initializes caches.
 *   - VILLAGE.memory.record(villager, memoryData): Appends structured episodic memory.
 *   - VILLAGE.memory.generateDailyDiary(villager, day, state): Pure generative grammar composing diary entries.
 *   - VILLAGE.memory.generateAllDiaries(state, day): Triggers diary generation for all 12 villagers.
 * 
 * State fields read/written:
 *   - Reads: state.day, state.weather, state.villagers, state.rumors
 *   - Writes: villager.memories, villager.diary
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.memory = {
  init(state) {
    // Listen for day cycle completion to generate rich diaries
    VILLAGE.bus.on('day:ended', (data) => {
      this.generateAllDiaries(state, data.day);
    });

    console.log('[VILLAGE.memory] Initialized.');
  },

  record(villager, memData) {
    if (!villager || !villager.memories) return;

    const entry = {
      id: VILLAGE.stateModule.nextId('mem'),
      tick: memData.tick,
      day: memData.day,
      type: memData.type, // 'chat', 'trade', 'gift_received', 'gift_given', 'argument', 'apology_offered', 'apology_accepted', 'rumor_heard', 'scare', 'festival'
      otherId: memData.otherId || null,
      place: memData.place || 'the village',
      item: memData.item || null,
      amount: memData.amount || 1,
      valence: memData.valence || 0, // -10 (devastating) to +10 (euphoric)
      importance: memData.importance || 3, // 1 to 10
      rumorId: memData.rumorId || null
    };

    villager.memories.push(entry);

    // Keep memory collection capped to prevent memory leaks
    if (villager.memories.length > VILLAGE.config.LIMITS.MAX_MEMORIES_PER_VILLAGER) {
      // Retain highest importance and recent memories
      villager.memories.sort((a, b) => (b.importance * 2 + b.day) - (a.importance * 2 + a.day));
      villager.memories.length = VILLAGE.config.LIMITS.MAX_MEMORIES_PER_VILLAGER;
    }

    return entry;
  },

  generateAllDiaries(state, day) {
    state.villagers.forEach(v => {
      this.generateDailyDiary(v, day, state);
    });
  },

  /**
   * Generates a fully composed diary entry from structured memory records.
   * NEVER uses canned whole sentences. Assembles dynamic sentences using
   * an episodic grammar phrased through the villager's unique personality and relations.
   */
  generateDailyDiary(villager, day, state) {
    // 1. Gather memories that occurred on this day
    const dayMemories = (villager.memories || []).filter(m => m.day === day);

    // Sort by importance descending
    dayMemories.sort((a, b) => b.importance - a.importance);
    const topMemories = dayMemories.slice(0, 4);

    let diaryText = '';

    // 2. Fallback: If nothing notable happened today, generate a quiet reflective entry
    if (topMemories.length === 0) {
      diaryText = this._generateQuietDayEntry(villager, day, state);
    } else {
      // 3. Compose rich structured paragraphs from episodic records
      const sentences = [];

      // Day opening atmosphere
      sentences.push(this._composeOpeningSentence(villager, day, state));

      // Compose episodic sentence for each structured memory
      topMemories.forEach((mem, idx) => {
        sentences.push(this._composeEpisodicSentence(villager, mem, state, idx));
      });

      // Closing thought
      sentences.push(this._composeClosingSentence(villager, state));

      diaryText = sentences.join(' ');
    }

    // Save entry into villager's diary
    if (!villager.diary) villager.diary = [];
    villager.diary.unshift({
      day: day,
      text: diaryText
    });

    if (villager.diary.length > VILLAGE.config.LIMITS.MAX_DIARY_ENTRIES) {
      villager.diary.length = VILLAGE.config.LIMITS.MAX_DIARY_ENTRIES;
    }

    return diaryText;
  },

  _composeOpeningSentence(villager, day, state) {
    const p = villager.personality;
    const weather = state.weather;

    let timeContext = `Day ${day} began`;
    if (weather === 'rain') timeContext += ' under a dreary gray drizzle';
    else if (weather === 'fog') timeContext += ' cloaked in a thick, eerie morning fog';
    else timeContext += ' with bright rays kissing the treetops';

    if (p.temper > 0.7) {
      return `${timeContext}, and already my nerves were on edge before I even laced my boots.`;
    } else if (p.kindness > 0.7) {
      return `${timeContext}, filling my lungs with the fresh valley air and hope for my neighbors.`;
    } else if (p.gossip > 0.7) {
      return `${timeContext}, and right away whispers were fluttering through the village square.`;
    } else {
      return `${timeContext}, greeting another steady turn of daily toil in our settlement.`;
    }
  },

  _composeEpisodicSentence(villager, mem, state, order) {
    const p = villager.personality;
    const other = mem.otherId ? state.villagers.find(v => v.id === mem.otherId) : null;
    const otherName = other ? other.name : 'someone';
    const place = mem.place || 'the square';
    const rel = (other && villager.relations[other.id]) ? villager.relations[other.id] : { affinity: 0, trust: 50 };

    // Connectors
    const connectors = ['Shortly after,', 'Then around midday,', 'Later by the afternoon,', 'As evening drew near,'];
    const connector = connectors[order % connectors.length];

    let actionClause = '';
    let feelingClause = '';
    let relationalReflection = '';

    // Grammar assembly based on structured memory type
    switch (mem.type) {
      case 'chat':
        actionClause = `${connector} I met with ${otherName} near ${place} to discuss ${mem.item}`;
        feelingClause = (mem.valence > 0)
          ? (p.kindness > 0.6 ? 'which left me feeling pleasantly understood' : 'which was a tolerable way to pass the hour')
          : 'though our words felt strained and cold';
        break;

      case 'gift_received':
        actionClause = `${connector} ${otherName} stopped by at ${place} and handed me ${mem.item}`;
        feelingClause = (p.temper > 0.6)
          ? 'which caught me off guard, softening my usual stubbornness'
          : (p.kindness > 0.6 ? 'touching my heart in a way I shall not soon forget' : 'a generous gesture I truly appreciated');
        relationalReflection = `I feel far warmer toward ${otherName} than I did before.`;
        break;

      case 'gift_given':
        actionClause = `${connector} I presented ${otherName} with ${mem.item} while standing near ${place}`;
        feelingClause = 'hoping it would bring some comfort to their daily burdens';
        break;

      case 'argument':
        actionClause = `${connector} a bitter disagreement erupted between me and ${otherName} near ${place} concerning ${mem.item}`;
        if (p.temper > 0.6) {
          feelingClause = 'and I could not hold back my fiery outrage at their utter obstinacy';
        } else if (p.kindness > 0.6) {
          feelingClause = 'which grieved me deeply, for I hate to see anger poison our peace';
        } else {
          feelingClause = 'leaving a lingering bitterness that refuses to settle';
        }
        relationalReflection = (rel.affinity < -30)
          ? `I am convinced ${otherName} and I have reached an open feud.`
          : `I intend to watch my words closely around ${otherName}.`;
        break;

      case 'apology_offered':
        actionClause = `${connector} I humbled myself and went to ${otherName} at ${place} to offer an apology for our recent strife`;
        feelingClause = 'feeling the heavy weight slowly lift from my chest';
        break;

      case 'apology_accepted':
        actionClause = `${connector} ${otherName} approached me near ${place} asking for forgiveness regarding our feud`;
        feelingClause = (p.temper > 0.6)
          ? 'and though grudges die hard in me, I chose to bury the hatchet'
          : 'and I gladly offered my hand in reconciliation';
        relationalReflection = `It seems our bond with ${otherName} might yet heal.`;
        break;

      case 'trade':
        actionClause = `${connector} I struck a business deal with ${otherName} at ${place}, trading ${mem.item}`;
        feelingClause = 'which went smoothly and bolstered our mutual trust';
        break;

      case 'rumor_heard':
        actionClause = `${connector} ${otherName} pulled me aside at ${place} to whisper that ${mem.item}`;
        const confidence = mem.amount;
        if (confidence >= 70) {
          feelingClause = (p.gossip > 0.6)
            ? 'a tantalizing piece of news that I will certainly be investigating further'
            : `and knowing how sincere ${otherName} is, I fear the claim carries alarming truth`;
        } else {
          feelingClause = 'though something in my gut tells me it may be nothing more than exaggerated tavern gossip';
        }
        break;

      case 'scare':
        actionClause = `${connector} panic rippled through ${place} as word spread of shadows creeping outside our watchtower`;
        feelingClause = 'leaving my heart pounding well into the darkness';
        break;

      case 'festival':
        actionClause = `${connector} we all gathered around the crackling campfire in the square for the evening festival`;
        feelingClause = 'singing old folk songs until the embers glowed low';
        break;

      default:
        actionClause = `${connector} an unexpected matter unfolded at ${place}`;
        feelingClause = 'occupying my thoughts for the remainder of the watch';
        break;
    }

    let sentence = `${actionClause}, ${feelingClause}.`;
    if (relationalReflection) {
      sentence += ` ${relationalReflection}`;
    }
    return sentence;
  },

  _composeClosingSentence(villager, state) {
    const p = villager.personality;
    const mood = villager.needs.mood;

    if (mood >= 75) {
      if (p.kindness > 0.6) return 'As I rest my head tonight, I am profoundly grateful for this humble home and my neighbors.';
      return 'I turn in for the night in high spirits, feeling confident in the village’s future.';
    } else if (mood <= 35) {
      if (p.temper > 0.6) return 'I blow out the lantern with a heavy scowl, dreading what nonsense tomorrow will bring.';
      return 'Night falls with a heavy weight upon my shoulders, and I only hope for quieter hours tomorrow.';
    } else {
      return 'The embers die down, and sleep finally comes to soothe another day of labor.';
    }
  },

  _generateQuietDayEntry(villager, day, state) {
    const p = villager.personality;
    const weather = state.weather;
    const job = villager.job;

    let text = `Day ${day} passed without great commotion. `;

    if (weather === 'rain') {
      text += 'Rain drummed steadily against the shingles, keeping most folks indoors. ';
    } else if (weather === 'fog') {
      text += 'A misty blanket hung over the trees, muffling the usual chatter of the paths. ';
    } else {
      text += 'The clear sunlight cast calm shadows across the fields. ';
    }

    text += `I spent the bulk of my daylight hours dedicated to my duties as a ${job}, `;

    if (villager.needs.hunger < 30) {
      text += 'though an empty stomach reminded me that food stores are lean. ';
    } else if (villager.needs.social < 30) {
      text += 'feeling somewhat isolated with so little conversation today. ';
    } else {
      text += 'keeping a steady rhythm until dusk painted the horizon. ';
    }

    if (p.kindness > 0.7) {
      text += 'I whispered a quiet wish of health for everyone in our valley before turning into bed.';
    } else if (p.temper > 0.7) {
      text += 'At least no one got in my way today, which is a rare luxury around here.';
    } else {
      text += 'A quiet day is a good day in a growing village.';
    }

    return text;
  }
};
