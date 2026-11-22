/**
 * js/social.js
 * Owner: Social Systems & Dynamic Drama Specialist
 * 
 * Public API:
 *   - VILLAGE.social.init(state): Sets up rumor pool and baseline social hooks.
 *   - VILLAGE.social.update(state, dt): Evaluates proximity, triggers chats, trades, feuds, apologies, rumors.
 *   - VILLAGE.social.getRelationshipLabel(affinity, trust): Formats qualitative relation badge.
 *   - VILLAGE.social.createInitialRumor(state, originId, subjectId, claim, accuracy): Seeds a new rumor.
 * 
 * State fields read/written:
 *   - Reads: state.villagers, state.rumors, state.tick, state.day
 *   - Writes: state.villagers (needs, relations, beliefs, memories, bubbles), state.rumors, state.log
 */

window.VILLAGE = window.VILLAGE || {};

VILLAGE.social = {
  cooldowns: {}, // pairKey -> lastTick

  init(state) {
    this.cooldowns = {};

    // Seed 2 initial intriguing rumors to get conversations flowing
    this.createInitialRumor(
      state,
      'v4', // Dorothy (trader)
      'v2', // Bram (woodcutter)
      'accidentally broke the axe of the village elder',
      0.8
    );

    this.createInitialRumor(
      state,
      'v8', // Hazel (cook)
      'v7', // Gideon (cynical farmer)
      'secretly baked sweet berry tarts for the children',
      0.95
    );

    console.log('[VILLAGE.social] Initialized.');
  },

  update(state, dt) {
    // Check interactions every 12 ticks (~0.6s) to conserve CPU
    if (state.tick % 12 !== 0) return;

    const villagers = state.villagers;
    const len = villagers.length;

    for (let i = 0; i < len; i++) {
      const v1 = villagers[i];
      if (v1.activity === 'Sleeping') continue;

      for (let j = i + 1; j < len; j++) {
        const v2 = villagers[j];
        if (v2.activity === 'Sleeping') continue;

        // Proximity check (within 1.7 tiles)
        const dist = Math.hypot(v1.x - v2.x, v1.y - v2.y);
        if (dist <= 1.7) {
          const pairKey = v1.id < v2.id ? `${v1.id}:${v2.id}` : `${v2.id}:${v1.id}`;
          const lastInteraction = this.cooldowns[pairKey] || 0;

          // Cooldown between same pair: ~80 ticks (4 seconds)
          if (state.tick - lastInteraction > 80) {
            this.cooldowns[pairKey] = state.tick;
            this.triggerSocialInteraction(state, v1, v2);
          }
        }
      }
    }
  },

  triggerSocialInteraction(state, v1, v2) {
    state.stats.totalInteractions++;

    // Ensure bilateral relations exist
    if (!v1.relations[v2.id]) v1.relations[v2.id] = { affinity: 0, trust: 50, familiarity: 10, lastTick: 0 };
    if (!v2.relations[v1.id]) v2.relations[v1.id] = { affinity: 0, trust: 50, familiarity: 10, lastTick: 0 };

    const r1 = v1.relations[v2.id];
    const r2 = v2.relations[v1.id];
    r1.lastTick = state.tick;
    r2.lastTick = state.tick;

    // Boost familiarity with every meeting
    r1.familiarity = Math.min(100, r1.familiarity + 2);
    r2.familiarity = Math.min(100, r2.familiarity + 2);

    // Audio blip
    if (VILLAGE.audio) VILLAGE.audio.playChatter(v1.job);

    const cfg = VILLAGE.config.DRAMA_KNOBS;

    // Check 1: Feud / Apology Opportunity
    const inFeud = (r1.affinity <= cfg.feudThreshold || r2.affinity <= cfg.feudThreshold);
    if (inFeud) {
      // High kindness can trigger an apology attempt
      const canApologize = (v1.personality.kindness > 0.6 || v2.personality.kindness > 0.6);
      if (canApologize && VILLAGE.rng.random() < cfg.forgivenessRate) {
        this._resolveApology(state, v1, v2, r1, r2);
        return;
      } else {
        // Continue feud: glare or trade insults
        this._triggerArgument(state, v1, v2, r1, r2, true);
        return;
      }
    }

    // Check 2: Rumor Spreading (if teller has high gossip or active belief)
    const canGossip = (v1.personality.gossip > 0.4 || v2.personality.gossip > 0.4);
    if (canGossip && VILLAGE.rng.random() < cfg.gossipProbability) {
      const spread = this._spreadRumor(state, v1, v2, r1, r2);
      if (spread) return;
    }

    // Check 3: Spontaneous Argument based on Temper and Mood
    const temperClash = (v1.personality.temper + v2.personality.temper) * 0.5 * cfg.temperWeight;
    const lowMoodTrigger = (v1.needs.mood < 30 || v2.needs.mood < 30) ? 0.35 : 0.05;
    if (VILLAGE.rng.random() < (temperClash * 0.25 + lowMoodTrigger)) {
      this._triggerArgument(state, v1, v2, r1, r2, false);
      return;
    }

    // Check 4: Generous Gift
    const isGenerous = (v1.personality.generosity > 0.7 && r1.affinity > 20) || (v2.personality.generosity > 0.7 && r2.affinity > 20);
    if (isGenerous && VILLAGE.rng.random() < 0.35) {
      this._giveGift(state, v1, v2, r1, r2);
      return;
    }

    // Check 5: Resource Trade
    if ((v1.job === 'trader' || v2.job === 'trader') && VILLAGE.rng.random() < 0.45) {
      this._executeTrade(state, v1, v2, r1, r2);
      return;
    }

    // Default: Friendly Cozy Chat
    this._friendlyChat(state, v1, v2, r1, r2);
  },

  _friendlyChat(state, v1, v2, r1, r2) {
    // Restore social needs
    v1.needs.social = Math.min(100, v1.needs.social + VILLAGE.config.NEEDS.SOCIAL_RECOVERY_CHAT);
    v2.needs.social = Math.min(100, v2.needs.social + VILLAGE.config.NEEDS.SOCIAL_RECOVERY_CHAT);

    // Minor affinity bump
    r1.affinity = Math.min(100, r1.affinity + 3);
    r2.affinity = Math.min(100, r2.affinity + 3);

    const greetings = ['Hello!', 'Good day!', 'Cozy skies!', 'How goes work?', 'Nice breeze!'];
    const greeting = VILLAGE.rng.choice(greetings);
    VILLAGE.villagers.setBubble(v1, greeting, null, 2.5);
    VILLAGE.villagers.setBubble(v2, 'Warm hello!', null, 2.5);

    // Log & Memory records
    VILLAGE.memory.record(v1, {
      tick: state.tick,
      day: state.day,
      type: 'chat',
      otherId: v2.id,
      place: this._getPlaceName(state, v1.x, v1.y),
      item: 'village news',
      amount: 1,
      valence: 3,
      importance: 2
    });

    VILLAGE.memory.record(v2, {
      tick: state.tick,
      day: state.day,
      type: 'chat',
      otherId: v1.id,
      place: this._getPlaceName(state, v2.x, v2.y),
      item: 'village news',
      amount: 1,
      valence: 3,
      importance: 2
    });
  },

  _giveGift(state, v1, v2, r1, r2) {
    state.stats.totalGifts++;
    const giver = v1.personality.generosity >= v2.personality.generosity ? v1 : v2;
    const receiver = (giver === v1) ? v2 : v1;
    const rGiver = giver.relations[receiver.id];
    const rReceiver = receiver.relations[giver.id];

    const gifts = ['wildflowers', 'fresh berry pastry', 'carved wooden figurine', 'shiny river pebble'];
    const giftItem = VILLAGE.rng.choice(gifts);

    rReceiver.affinity = Math.min(100, rReceiver.affinity + 18);
    rReceiver.trust = Math.min(100, rReceiver.trust + 10);
    rGiver.affinity = Math.min(100, rGiver.affinity + 12);

    receiver.needs.mood = Math.min(100, receiver.needs.mood + VILLAGE.config.NEEDS.MOOD_RECOVERY_GIFT);

    VILLAGE.villagers.setBubble(giver, `Gift for you!`, null, 3);
    VILLAGE.villagers.setBubble(receiver, `Thank you! ♥`, null, 3);
    if (VILLAGE.audio) VILLAGE.audio.playHeartChime();

    VILLAGE.stateModule.addLog(state, `${giver.name} gifted ${giftItem} to ${receiver.name}.`, 'social', giver.id, receiver.id);

    VILLAGE.memory.record(giver, {
      tick: state.tick,
      day: state.day,
      type: 'gift_given',
      otherId: receiver.id,
      place: this._getPlaceName(state, giver.x, giver.y),
      item: giftItem,
      amount: 1,
      valence: 6,
      importance: 5
    });

    VILLAGE.memory.record(receiver, {
      tick: state.tick,
      day: state.day,
      type: 'gift_received',
      otherId: giver.id,
      place: this._getPlaceName(state, receiver.x, receiver.y),
      item: giftItem,
      amount: 1,
      valence: 8,
      importance: 6
    });
  },

  _triggerArgument(state, v1, v2, r1, r2, isFeudContinuing) {
    // Reduce affinity and trust
    const drop = VILLAGE.rng.int(10, 18);
    r1.affinity = Math.max(-100, r1.affinity - drop);
    r2.affinity = Math.max(-100, r2.affinity - drop);
    r1.trust = Math.max(0, r1.trust - 8);
    r2.trust = Math.max(0, r2.trust - 8);

    v1.needs.mood = Math.max(0, v1.needs.mood - 15);
    v2.needs.mood = Math.max(0, v2.needs.mood - 15);

    const insultWords = ['Hmph!', 'Unbelievable!', 'Nonsense!', 'Leave me be!', 'Enough!'];
    VILLAGE.villagers.setBubble(v1, VILLAGE.rng.choice(insultWords), null, 3);
    VILLAGE.villagers.setBubble(v2, 'Ridiculous!', null, 3);

    if (VILLAGE.audio) VILLAGE.audio.playArgumentBuzz();

    const topic = VILLAGE.rng.choice(['missing firewood', 'property boundaries', 'lazy work habits', 'petty gossip']);
    const logMsg = isFeudContinuing 
      ? `Feud flare-up! ${v1.name} and ${v2.name} argued furiously over ${topic}.`
      : `Dispute! ${v1.name} and ${v2.name} clashed sharply over ${topic}.`;

    VILLAGE.stateModule.addLog(state, logMsg, 'conflict', v1.id, v2.id);

    // If affinity dropped into feud zone
    if (r1.affinity <= VILLAGE.config.DRAMA_KNOBS.feudThreshold && !isFeudContinuing) {
      state.stats.totalFeuds++;
      VILLAGE.stateModule.addLog(state, `A bitter FEUD has ignited between ${v1.name} and ${v2.name}!`, 'conflict', v1.id, v2.id);
    }

    VILLAGE.memory.record(v1, {
      tick: state.tick,
      day: state.day,
      type: 'argument',
      otherId: v2.id,
      place: this._getPlaceName(state, v1.x, v1.y),
      item: topic,
      amount: 1,
      valence: -7,
      importance: 6
    });

    VILLAGE.memory.record(v2, {
      tick: state.tick,
      day: state.day,
      type: 'argument',
      otherId: v1.id,
      place: this._getPlaceName(state, v2.x, v2.y),
      item: topic,
      amount: 1,
      valence: -7,
      importance: 6
    });
  },

  _resolveApology(state, v1, v2, r1, r2) {
    const apologizer = v1.personality.kindness >= v2.personality.kindness ? v1 : v2;
    const recipient = (apologizer === v1) ? v2 : v1;

    // Significant forgiveness jump
    r1.affinity = Math.min(30, r1.affinity + 28);
    r2.affinity = Math.min(30, r2.affinity + 28);
    r1.trust = Math.min(80, r1.trust + 15);
    r2.trust = Math.min(80, r2.trust + 15);

    VILLAGE.villagers.setBubble(apologizer, `I'm sorry...`, null, 3.5);
    VILLAGE.villagers.setBubble(recipient, `Water under bridge!`, null, 3.5);
    if (VILLAGE.audio) VILLAGE.audio.playHeartChime();

    VILLAGE.stateModule.addLog(state, `Peace restored! ${apologizer.name} apologized to ${recipient.name}, ending their feud.`, 'social', apologizer.id, recipient.id);

    VILLAGE.memory.record(apologizer, {
      tick: state.tick,
      day: state.day,
      type: 'apology_offered',
      otherId: recipient.id,
      place: this._getPlaceName(state, apologizer.x, apologizer.y),
      item: 'an olive branch',
      amount: 1,
      valence: 7,
      importance: 7
    });

    VILLAGE.memory.record(recipient, {
      tick: state.tick,
      day: state.day,
      type: 'apology_accepted',
      otherId: apologizer.id,
      place: this._getPlaceName(state, recipient.x, recipient.y),
      item: 'reconciliation',
      amount: 1,
      valence: 7,
      importance: 7
    });
  },

  _executeTrade(state, v1, v2, r1, r2) {
    const resources = ['wood', 'stone', 'food'];
    const resA = VILLAGE.rng.choice(resources);
    const resB = (resA === 'wood') ? 'food' : 'stone';

    // Trade small commodities
    r1.affinity = Math.min(100, r1.affinity + 4);
    r2.affinity = Math.min(100, r2.affinity + 4);
    r1.trust = Math.min(100, r1.trust + 5);
    r2.trust = Math.min(100, r2.trust + 5);

    VILLAGE.villagers.setBubble(v1, `Fair trade!`, null, 2.5);
    VILLAGE.villagers.setBubble(v2, `A pleasure.`, null, 2.5);

    VILLAGE.memory.record(v1, {
      tick: state.tick,
      day: state.day,
      type: 'trade',
      otherId: v2.id,
      place: this._getPlaceName(state, v1.x, v1.y),
      item: `${resA} for ${resB}`,
      amount: 2,
      valence: 4,
      importance: 3
    });

    VILLAGE.memory.record(v2, {
      tick: state.tick,
      day: state.day,
      type: 'trade',
      otherId: v1.id,
      place: this._getPlaceName(state, v2.x, v2.y),
      item: `${resB} for ${resA}`,
      amount: 2,
      valence: 4,
      importance: 3
    });
  },

  _spreadRumor(state, v1, v2, r1, r2) {
    const teller = v1.personality.gossip >= v2.personality.gossip ? v1 : v2;
    const listener = (teller === v1) ? v2 : v1;

    // Pick a rumor known by teller, or seed one from their recent memories
    let rumorToShare = null;
    if (teller.beliefs && teller.beliefs.length > 0) {
      const knownBelief = VILLAGE.rng.choice(teller.beliefs);
      rumorToShare = state.rumors.find(r => r.id === knownBelief.rumorId);
    }

    if (!rumorToShare) {
      // Pick a random other villager to start a gossip claim about
      const candidates = state.villagers.filter(v => v.id !== teller.id && v.id !== listener.id);
      if (candidates.length === 0) return false;
      const subject = VILLAGE.rng.choice(candidates);
      const claims = [
        'was secretly hoarding emeralds behind the well',
        'was seen talking to dark shadows in the woods',
        'dropped a crate of ripe apples into the river',
        'stayed up all night singing weird tunes at the campfire',
        'plans to build a hidden garden beyond the bridge'
      ];
      rumorToShare = this.createInitialRumor(state, teller.id, subject.id, VILLAGE.rng.choice(claims), 0.85);
    }

    if (!rumorToShare) return false;

    // Teller's version mutation (telephone game effect)
    let versionText = rumorToShare.claim;
    const shouldMutate = VILLAGE.rng.random() < VILLAGE.config.DRAMA_KNOBS.rumorMutationChance;

    if (shouldMutate) {
      if (teller.personality.gossip > 0.7) {
        // Exaggerate claim
        versionText = versionText.replace('secretly hoarding emeralds', 'stashed a fortune of stolen treasure');
        versionText = versionText.replace('dropped a crate of ripe apples', 'ruined the entire seasonal harvest');
        versionText = `shockingly, ${versionText} and lied about it!`;
      } else if (teller.personality.honesty < 0.4) {
        // Shift blame to someone teller dislikes
        const tellerRival = Object.keys(teller.relations).find(oid => teller.relations[oid].affinity < -20);
        if (tellerRival) {
          const rivalObj = state.villagers.find(v => v.id === tellerRival);
          if (rivalObj) {
            versionText = `was forced to do it because of ${rivalObj.name}!`;
          }
        }
      }
    }

    // Listener adoption based on trust
    const listenerTrustInTeller = listener.relations[teller.id] ? listener.relations[teller.id].trust : 50;
    const confidence = Math.min(100, Math.round(listenerTrustInTeller * 0.8 + (teller.personality.honesty * 20)));

    // Record new hop in rumor provenance
    rumorToShare.hops++;
    rumorToShare.versions.push({
      tellerId: teller.id,
      text: versionText,
      tick: state.tick
    });

    // Update or add belief in listener
    const existingBelief = listener.beliefs.find(b => b.rumorId === rumorToShare.id);
    if (existingBelief) {
      existingBelief.versionText = versionText;
      existingBelief.sourceId = teller.id;
      existingBelief.confidence = confidence;
    } else {
      listener.beliefs.push({
        rumorId: rumorToShare.id,
        versionText: versionText,
        sourceId: teller.id,
        confidence: confidence
      });
    }

    // Subject opinion shift in listener's mind
    const subject = state.villagers.find(v => v.id === rumorToShare.subjectId);
    if (subject && listener.relations[subject.id]) {
      const shift = (confidence / 100) * 8;
      // If rumor has negative words, drop affinity; else raise
      const isNegative = versionText.includes('stolen') || versionText.includes('lied') || versionText.includes('broke') || versionText.includes('ruined');
      if (isNegative) {
        listener.relations[subject.id].affinity = Math.max(-100, listener.relations[subject.id].affinity - shift);
      } else {
        listener.relations[subject.id].affinity = Math.min(100, listener.relations[subject.id].affinity + shift);
      }
    }

    state.stats.totalRumorsSpread++;

    VILLAGE.villagers.setBubble(teller, 'Did you hear...?', null, 3);
    VILLAGE.villagers.setBubble(listener, confidence > 60 ? 'No way!!' : 'Are you sure?', null, 3);

    const subjectName = subject ? subject.name : 'someone';
    VILLAGE.stateModule.addLog(state, `Rumor spread: ${teller.name} told ${listener.name} that ${subjectName} ${versionText}`, 'rumor', teller.id, listener.id);

    VILLAGE.memory.record(listener, {
      tick: state.tick,
      day: state.day,
      type: 'rumor_heard',
      otherId: teller.id,
      place: this._getPlaceName(state, listener.x, listener.y),
      item: versionText,
      amount: confidence,
      valence: -2,
      importance: 5,
      rumorId: rumorToShare.id
    });

    return true;
  },

  createInitialRumor(state, originId, subjectId, claim, accuracy) {
    const rumor = {
      id: VILLAGE.stateModule.nextId('rumor'),
      subjectId: subjectId,
      originId: originId,
      claim: claim,
      accuracy: accuracy || 0.8,
      hops: 0,
      versions: [
        { tellerId: originId, text: claim, tick: state.tick }
      ]
    };

    if (!state.rumors) state.rumors = [];
    state.rumors.push(rumor);

    if (state.rumors.length > VILLAGE.config.LIMITS.MAX_RUMORS_POOL) {
      state.rumors.shift();
    }

    // Origin starts with belief
    const origin = state.villagers.find(v => v.id === originId);
    if (origin) {
      origin.beliefs.push({
        rumorId: rumor.id,
        versionText: claim,
        sourceId: originId,
        confidence: 95
      });
    }

    return rumor;
  },

  getRelationshipLabel(affinity, trust) {
    if (affinity >= 70 && trust >= 70) return 'Best Friend';
    if (affinity >= 35) return 'Good Friend';
    if (affinity >= 10) return 'Friendly';
    if (affinity <= -55) return 'Bitter Enemy';
    if (affinity <= -30) return 'Rival / Feud';
    if (affinity < 0 && trust < 35) return 'Distrusted';
    if (trust < 30) return 'Suspicious';
    return 'Acquaintance';
  },

  _getPlaceName(state, x, y) {
    const tile = VILLAGE.world.getTile(state, Math.floor(x), Math.floor(y));
    if (tile && tile.buildingId) {
      const bld = state.buildings.find(b => b.id === tile.buildingId);
      if (bld) return bld.name;
    }
    if (x >= 16 && x <= 24 && y >= 11 && y <= 19) return 'Village Square';
    if (x >= 28) return 'Riverbank';
    return 'the Valley';
  }
};
