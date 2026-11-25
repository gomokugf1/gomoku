// game.js: the online game page (game.html?match=<id>).
//
// The server decides everything: whose turn it is, if a move is allowed, who won.
// This page asks the server for the board 4 times a second, draws it, and
// sends clicks as moves. No game rule is trusted here.

(function () {
  'use strict';

  var SIZE = 19;

  var boardEl = document.getElementById('board');
  var messageEl = document.getElementById('message');
  var turnBar = document.getElementById('turn-bar');
  var turnStone = document.getElementById('turn-stone');
  var turnText = document.getElementById('turn-text');
  var playersEl = document.getElementById('players');
  var restartBtn = document.getElementById('restart');
  var restartStatusEl = document.getElementById('restart-status');
  var leaveBtn = document.getElementById('leave');

  var matchId = new URLSearchParams(window.location.search).get('match');
  var state = null;       // the last match object from the server
  var cells = [];         // cells[r * SIZE + c] = the square element
  var drawn = [];         // drawn[r * SIZE + c] = colour of the stone we show there ('' = none)
  var hoverDot = null;    // the moving circle that follows the mouse
  var polling = false;
  var moving = false;     // a move is on its way to the server (stops double clicks)
  var pollTimer = null;
  var leaveTimer = null;
  var connLost = false;   // the last poll failed (so we can clear the message when it works again)

  // ---------- MESSAGES ----------

  function showMessage(text, isError) {
    messageEl.textContent = text || '';
    messageEl.className = isError ? 'error' : '';
  }

  function colorName(color) { return color === 'black' ? 'Black' : 'White'; }

  // ---------- BOARD ----------

  function buildBoard() {
    boardEl.innerHTML = '';
    for (var row = 0; row < SIZE; row++) {
      for (var col = 0; col < SIZE; col++) {
        var cell = document.createElement('div');
        cell.className = 'cell';
        if (row === 0) cell.className += ' top';
        if (row === SIZE - 1) cell.className += ' bottom';
        if (col === 0) cell.className += ' left';
        if (col === SIZE - 1) cell.className += ' right';
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.onclick = onCellClick;
        boardEl.appendChild(cell);
        cells.push(cell);
        drawn.push('');
      }
    }
    hoverDot = document.createElement('div');
    hoverDot.id = 'hover-dot';
    boardEl.appendChild(hoverDot);

    boardEl.onmousemove = function (e) {
      moveHoverDot(e.target.closest ? e.target.closest('.cell') : null);
    };
    boardEl.onmouseleave = function () { hoverDot.style.opacity = '0'; };
  }

  // Make the squares show exactly what the server says (also after a restart).
  function drawBoard(m) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var i = r * SIZE + c;
        var color = m.board[r][c];
        var stone = cells[i].querySelector('.stone');
        if (drawn[i] !== color) {
          if (stone) cells[i].removeChild(stone);
          stone = null;
          if (color) {
            stone = document.createElement('div');
            stone.className = 'stone ' + color;
            cells[i].appendChild(stone);
          }
          drawn[i] = color;
        }
        if (stone) {
          stone.classList.remove('last', 'win');
        }
      }
    }
    // the "last stone" marker
    if (m.lastMove) {
      var last = cells[m.lastMove.row * SIZE + m.lastMove.col].querySelector('.stone');
      if (last) last.classList.add('last');
    }
    // the five (or more) winning stones
    if (m.winningLine) {
      m.winningLine.forEach(function (p) {
        var s = cells[p[0] * SIZE + p[1]].querySelector('.stone');
        if (s) s.classList.add('win');
      });
    }
  }

  function canMove() {
    return Boolean(state) && !moving && state.status === 'playing' && state.myColor === state.turn;
  }

  // Move the hover dot to the square under the mouse (animated by CSS).
  function moveHoverDot(cell) {
    if (!hoverDot || !cell) return;
    var row = Number(cell.dataset.row), col = Number(cell.dataset.col);
    if (!canMove() || drawn[row * SIZE + col]) {
      hoverDot.style.opacity = '0';
      return;
    }
    var w = cell.offsetWidth * 0.7, h = cell.offsetHeight * 0.7;
    hoverDot.style.width = w + 'px';
    hoverDot.style.height = h + 'px';
    hoverDot.style.left = (cell.offsetLeft + cell.offsetWidth / 2 - w / 2) + 'px';
    hoverDot.style.top = (cell.offsetTop + cell.offsetHeight / 2 - h / 2) + 'px';
    hoverDot.style.opacity = '1';
  }

  // ---------- TEXTS ----------

  function renderPlayers(m) {
    playersEl.innerHTML = '';
    ['black', 'white'].forEach(function (color) {
      var seat = document.createElement('div');
      seat.className = 'seat ' + color;
      var name = document.createElement('span');
      var who = m.players[color] ? m.players[color].username : null;
      name.textContent = colorName(color) + ': ' + (who || '(nobody yet)') + (m.myColor === color ? ' (you)' : '');
      if (m.myColor === color) name.className = 'seat-me';
      seat.appendChild(name);
      playersEl.appendChild(seat);
    });
  }

  function renderTurn(m) {
    var mine = m.status === 'playing' && m.myColor === m.turn;
    turnBar.className = mine ? 'mine' : '';
    turnStone.className = m.winner ? m.winner : (m.turn || 'black');

    if (m.status === 'waiting') {
      turnText.textContent = 'Waiting for the other player…';
    } else if (m.status === 'finished') {
      if (m.winner) {
        turnText.textContent = colorName(m.winner) + ' wins! 🎉' + (m.winner === m.myColor ? ' (you)' : '');
      } else {
        turnText.textContent = "It's a draw!";
      }
    } else {
      turnText.textContent = mine
        ? colorName(m.turn) + "'s turn - your turn!"
        : colorName(m.turn) + "'s turn";
    }
  }

  function renderResult(m) {
    if (m.status !== 'finished') return;
    if (m.opponentLeft) {
      showMessage(m.endReason === 'left' ? 'Your opponent left the match. You win!' : 'Your opponent has left the match.');
    } else if (m.endReason === 'draw') {
      showMessage('The board is full. Nobody wins.');
    } else if (m.winner) {
      showMessage(m.winner === m.myColor ? 'Five in a row. You win!' : 'The other player got five in a row.');
    }
  }

  function renderRestart(m) {
    restartBtn.textContent = m.otherRestartAccepted ? 'Accept restart' : 'Restart';
    restartBtn.disabled = m.status === 'waiting' || m.opponentLeft || m.myRestartAccepted;
    if (m.opponentLeft) {
      restartStatusEl.textContent = 'Your opponent has left. Press Leave to go back to matchmaking.';
    } else if (m.otherRestartAccepted) {
      restartStatusEl.textContent = 'The other player wants to restart. Press Accept restart to start a new game.';
    } else if (m.myRestartAccepted) {
      restartStatusEl.textContent = 'Waiting for the other player to accept the restart.';
    } else if (m.status === 'finished') {
      restartStatusEl.textContent = 'Both players must press Restart to play again.';
    } else {
      restartStatusEl.textContent = '';
    }
  }

  // ---------- TALKING TO THE SERVER ----------

  function applyState(m) {
    var wasFinished = state && state.status === 'finished';
    state = m;
    drawBoard(m);
    renderPlayers(m);
    renderTurn(m);
    renderRestart(m);
    if (m.status === 'finished') renderResult(m);
    else if (wasFinished || messageEl.className !== 'error') showMessage('');
  }

  function stopWithError(text) {
    clearInterval(pollTimer);
    showMessage(text, true);
    turnText.textContent = 'Match not available';
    leaveBtn.textContent = 'Back to matchmaking';
    leaveBtn.className = 'primary';
    restartBtn.disabled = true;
  }

  function poll() {
    if (polling) return;
    polling = true;
    api('GET', '/api/match/' + encodeURIComponent(matchId) + '/state').then(function (data) {
      if (connLost) { connLost = false; showMessage(''); }
      applyState(data.match);
    }).catch(function (e) {
      if (e.status === 404 || e.status === 403) stopWithError('This match does not exist any more, or you are not in it.');
      else { connLost = true; showMessage(e.message + ' Trying again…', true); } // keep polling
    }).then(function () { polling = false; });
  }

  function onCellClick(event) {
    if (!state) return;
    if (state.status !== 'playing') return;
    if (state.myColor !== state.turn) { showMessage("It's the other player's turn.", true); return; }
    if (moving) return;
    var cell = event.currentTarget;
    var row = Number(cell.dataset.row), col = Number(cell.dataset.col);
    if (drawn[row * SIZE + col]) return;

    moving = true;
    api('POST', '/api/match/' + encodeURIComponent(matchId) + '/move', { row: row, col: col })
      .then(function (data) { showMessage(''); applyState(data.match); })
      .catch(function (e) { showMessage(e.message, true); })
      .then(function () { moving = false; });
  }

  restartBtn.onclick = function () {
    restartBtn.disabled = true;
    api('POST', '/api/match/' + encodeURIComponent(matchId) + '/restart')
      .then(function (data) { showMessage(''); applyState(data.match); })
      .catch(function (e) { showMessage(e.message, true); restartBtn.disabled = false; });
  };

  function goToMatchmaking() { window.location.replace('matchmaking.html'); }

  // Leaving a running game means the other player wins, so ask once more.
  leaveBtn.onclick = function () {
    if (state && state.status === 'playing' && !leaveBtn.dataset.sure) {
      leaveBtn.dataset.sure = '1';
      leaveBtn.textContent = 'Really leave? You lose.';
      leaveTimer = setTimeout(function () {
        delete leaveBtn.dataset.sure;
        leaveBtn.textContent = 'Leave';
      }, 4000);
      return;
    }
    clearTimeout(leaveTimer);
    clearInterval(pollTimer);
    api('POST', '/api/match/' + encodeURIComponent(matchId) + '/leave').then(goToMatchmaking, goToMatchmaking);
  };

  // ---------- START ----------

  buildBoard();
  if (!matchId) {
    goToMatchmaking();
  } else {
    window.sessionReady.then(function () {
      poll();
      pollTimer = setInterval(poll, 250);
    }).catch(function () { showMessage('Could not check your login.', true); });
  }
})();
