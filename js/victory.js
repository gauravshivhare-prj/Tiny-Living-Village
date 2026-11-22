/**
 * js/victory.js
 * Owner: Win Condition & Progression Systems Engineer
 *
 * Public API:
 *   - VILLAGE.victory.init(state): Sets up goals tracking.
 *   - VILLAGE.victory.update(state, dt): Checks win conditions each tick.
 *   - VILLAGE.victory.getGoals(state): Returns array of goal objects with done flags.
 *
 * State fields read/written:
 *   - Reads: state.day, state.resources, state.buildings, state.villagers, state.stats
 *   - Writes: state.victory
 */
window.VILLAGE = window.VILLAGE || {};

VILLAGE.victory = (function () {

  var _tickCounter = 0;

  var WIN_GOALS = [
    {
      id: 'population',
      label: 'All 12 villagers happy (Mood > 40%)',
      check: function (state) {
        var vs = state.villagers;
        if (!vs || vs.length < 12) return false;
        for (var i = 0; i < vs.length; i++) {
          if (!vs[i].needs || vs[i].needs.mood <= 40) return false;
        }
        return true;
      }
    },
    {
      id: 'food',
      label: 'Food reserves \u2265 80',
      check: function (state) {
        return state.resources && state.resources.food >= 80;
      }
    },
    {
      id: 'settlement',
      label: 'Build 6+ structures',
      check: function (state) {
        return state.buildings && state.buildings.length >= 6;
      }
    },
    {
      id: 'harmony',
      label: 'No active feuds between villagers',
      check: function (state) {
        var vs = state.villagers;
        if (!vs) return true;
        for (var i = 0; i < vs.length; i++) {
          var v = vs[i];
          if (!v.relations) continue;
          for (var j = 0; j < vs.length; j++) {
            if (i === j) continue;
            var other = vs[j];
            var rel = v.relations[other.id];
            if (rel && rel.affinity < -35) return false;
          }
        }
        return true;
      }
    },
    {
      id: 'prosperity',
      label: 'Accumulate 30+ emeralds',
      check: function (state) {
        return state.resources && state.resources.emeralds >= 30;
      }
    }
  ];

  var MILESTONES = [
    { day: 3, text: '\uD83C\uDF31 Sprouting Hamlet \u2014 Your village is growing!' },
    { day: 7, text: '\uD83C\uDFE1 Cozy Village \u2014 The settlement thrives!' },
    { day: 15, text: '\uD83C\uDF1F Legendary Settlement \u2014 The village is prosperous!' }
  ];

  function _checkGoals(state) {
    for (var i = 0; i < WIN_GOALS.length; i++) {
      if (!WIN_GOALS[i].check(state)) return false;
    }
    return true;
  }

  function _spawnConfetti() {
    var container = document.getElementById('victoryConfetti');
    if (!container) return;
    container.innerHTML = '';
    var colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7'];
    for (var i = 0; i < 30; i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = (Math.random() * 100) + '%';
      piece.style.top = '0px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = (Math.random() * 0.8) + 's';
      container.appendChild(piece);
    }
    setTimeout(function () {
      if (container) container.innerHTML = '';
    }, 2500);
  }

  function _showVictoryScreen(state) {
    var modal = document.getElementById('victoryModal');
    if (!modal) return;
    modal.style.display = 'flex';

    var titleEl = document.getElementById('victoryTitle');
    if (titleEl) titleEl.textContent = '\uD83C\uDFC6 Village Prosperity Achieved!';

    var statsEl = document.getElementById('victoryStats');
    if (statsEl) {
      var stats = state.stats || {};
      var rows = [
        { label: 'Days Survived', value: state.day },
        { label: 'Total Social Interactions', value: stats.totalInteractions || 0 },
        { label: 'Total Gifts Given', value: stats.totalGifts || 0 },
        { label: 'Rumors Spread', value: stats.totalRumorsSpread || 0 },
        { label: 'Buildings Built', value: stats.buildingsConstructed || 0 },
        { label: 'Feuds Resolved', value: stats.totalFeuds || 0 }
      ];
      var html = '';
      for (var i = 0; i < rows.length; i++) {
        html += '<div class="victory-stat-item"><span class="victory-stat-label">' +
          rows[i].label + '</span><span class="victory-stat-value">' +
          rows[i].value + '</span></div>';
      }
      statsEl.innerHTML = html;
    }

    var goalsEl = document.getElementById('victoryGoals');
    if (goalsEl) {
      var ghtml = '';
      for (var g = 0; g < WIN_GOALS.length; g++) {
        ghtml += '<div class="victory-goal-item">\u2705 ' + WIN_GOALS[g].label + '</div>';
      }
      goalsEl.innerHTML = ghtml;
    }

    _spawnConfetti();

    if (VILLAGE.bus) VILLAGE.bus.emit('audio:play-victory');

    if (VILLAGE.stateModule) {
      VILLAGE.stateModule.addLog(state,
        '\uD83C\uDFC6 The village has achieved prosperity on Day ' + state.day + '!', 'event');
    }
  }

  return {
    init: function (state) {
      if (!state.victory) {
        state.victory = { achieved: false, achievedDay: null, milestone: null };
      }
      _tickCounter = 0;

      // Check milestones on day:ended
      if (VILLAGE.bus) {
        VILLAGE.bus.on('day:ended', function (data) {
          var d = data && data.day !== undefined ? data.day : (state.day - 1);
          for (var i = 0; i < MILESTONES.length; i++) {
            if (d + 1 === MILESTONES[i].day) {
              state.victory.milestone = MILESTONES[i].text;
              VILLAGE.bus.emit('victory:milestone', { text: MILESTONES[i].text, day: d + 1 });
              if (VILLAGE.stateModule) {
                VILLAGE.stateModule.addLog(state, MILESTONES[i].text, 'event');
              }
            }
          }
        });
      }
    },

    update: function (state, dt) {
      if (!state.victory) state.victory = { achieved: false, achievedDay: null, milestone: null };
      if (state.victory.achieved) return;

      _tickCounter++;
      if (_tickCounter < 60) return;
      _tickCounter = 0;

      // Emit updated goals for sidebar
      if (VILLAGE.bus) {
        VILLAGE.bus.emit('victory:goals-updated', { goals: this.getGoals(state) });
      }

      if (state.day >= 3 && _checkGoals(state)) {
        state.victory.achieved = true;
        state.victory.achievedDay = state.day;
        _showVictoryScreen(state);
      }
    },

    getGoals: function (state) {
      var result = [];
      for (var i = 0; i < WIN_GOALS.length; i++) {
        result.push({
          id: WIN_GOALS[i].id,
          label: WIN_GOALS[i].label,
          done: WIN_GOALS[i].check(state)
        });
      }
      return result;
    }
  };
}());
