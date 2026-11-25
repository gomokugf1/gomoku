
// local.js: the BRAIN of the local game (two players on one computer).
// Online matches use game.js, where the server decides everything.

// ---------- THINGS THE GAME REMEMBERS ----------

var SIZE = 19;
var board = [];
var turn = 'black';
var gameOver = false;
var moves = 0;
var lastStone = null;

// Page elements
var boardDiv = document.getElementById('board');
var message = document.getElementById('message');
var restartButton = document.getElementById('restart');
var hoverDot = null; // the moving circle on the board (follows the mouse)

// Turn indicator elements
var turnStone = document.getElementById('turn-stone');
var turnText = document.getElementById('turn-text');

// ---------- UPDATE TURN BAR ----------

function updateTurnDisplay(winner = null) {
  // Update the little stone icon if it exists.
  if (turnStone) {
    turnStone.className = 'turn-stone ' + turn;
  }

  // Update the turn text if it exists.
  if (turnText) {
    if (winner) {
      turnText.textContent =
        (winner === 'black' ? 'Black' : 'White') + ' wins! 🎉';
    } else if (gameOver) {
      turnText.textContent = "It's a draw!";
    } else {
      turnText.textContent =
        (turn === 'black' ? 'Black' : 'White') + "'s turn";
    }
  }
}

// ---------- START A NEW GAME ----------

function startGame() {
  board = [];
  turn = 'black';
  gameOver = false;
  moves = 0;
  lastStone = null;

  boardDiv.innerHTML = '';

  // Create the 19x19 board.
  for (var row = 0; row < SIZE; row++) {
    board.push([]);

    for (var col = 0; col < SIZE; col++) {
      board[row].push('');

      var cell = document.createElement('div');
      cell.className = 'cell';

      // Board edges.
      if (row === 0) cell.className += ' top';
      if (row === SIZE - 1) cell.className += ' bottom';
      if (col === 0) cell.className += ' left';
      if (col === SIZE - 1) cell.className += ' right';

      // Remember the cell position.
      cell.dataset.row = row;
      cell.dataset.col = col;

      // Click to place a stone.
      cell.onclick = onCellClick;

      boardDiv.appendChild(cell);
    }
  }

  if (message) {
    message.textContent = '';
  }

  // Create/attach the board-level hover dot (follows the mouse, see moveHoverDot).
  if (!hoverDot) {
    hoverDot = document.createElement('div');
    hoverDot.id = 'hover-dot';
  }
  boardDiv.appendChild(hoverDot);

  boardDiv.onmousemove = function (e) {
    moveHoverDot(e.target.closest ? e.target.closest('.cell') : null);
  };
  boardDiv.onmouseleave = function () {
    if (hoverDot) hoverDot.style.opacity = '0';
  };

  updateTurnDisplay();
}

// Move the hover dot to the cell the mouse is over (animated via CSS).
function moveHoverDot(cell) {
  if (!hoverDot || !cell) return;
  var row = Number(cell.dataset.row), col = Number(cell.dataset.col);
  if (board[row] && board[row][col] !== '') {
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

// ---------- WHEN SOMEONE CLICKS A SQUARE ----------

function onCellClick(event) {
  if (gameOver) return;

  var cell = event.currentTarget;
  var row = Number(cell.dataset.row);
  var col = Number(cell.dataset.col);

  // Don't allow stones on occupied squares.
  if (board[row][col] !== '') return;

  // Store the move.
  board[row][col] = turn;
  moves++;

  // Draw the stone.
  var stone = document.createElement('div');
  stone.className = 'stone ' + turn;
  cell.appendChild(stone);

  // Mark the most recent move.
  if (lastStone) {
    lastStone.classList.remove('last');
  }

  stone.classList.add('last');
  lastStone = stone;

  // Check for a win.
  var winningSpots = checkWin(row, col, turn);

  if (winningSpots) {
    gameOver = true;

    var winner = turn;
    var winnerName = winner === 'black' ? 'Black' : 'White';

    // Update the main message.
    if (message) {
      message.textContent = winnerName + ' wins! 🎉';
    }

    // Update the turn bar.
    updateTurnDisplay(winner);

    // Highlight the winning stones.
    for (var i = 0; i < winningSpots.length; i++) {
      var r = winningSpots[i][0];
      var c = winningSpots[i][1];

      var winningCell = boardDiv.children[r * SIZE + c];
      var winningStone = winningCell.querySelector('.stone');

      if (winningStone) {
        winningStone.classList.add('win');
      }
    }

    return;
  }

  // Check for a draw.
  if (moves === SIZE * SIZE) {
    gameOver = true;

    if (message) {
      message.textContent = "It's a draw!";
    }

    updateTurnDisplay();
    return;
  }

  // Switch to the other player.
  turn = turn === 'black' ? 'white' : 'black';

  // Update the turn indicator.
  updateTurnDisplay();
}

// ---------- CHECK IF SOMEONE WON ----------

function checkWin(row, col, color) {
  var directions = [
    [0, 1],   // Horizontal
    [1, 0],   // Vertical
    [1, 1],   // Diagonal \
    [1, -1]   // Diagonal /
  ];

  for (var d = 0; d < directions.length; d++) {
    var dr = directions[d][0];
    var dc = directions[d][1];

    var line = [[row, col]];

    // Check forward.
    var r = row + dr;
    var c = col + dc;

    while (
      r >= 0 && r < SIZE &&
      c >= 0 && c < SIZE &&
      board[r][c] === color
    ) {
      line.push([r, c]);
      r += dr;
      c += dc;
    }

    // Check backward.
    r = row - dr;
    c = col - dc;

    while (
      r >= 0 && r < SIZE &&
      c >= 0 && c < SIZE &&
      board[r][c] === color
    ) {
      line.push([r, c]);
      r -= dr;
      c -= dc;
    }

    // Five or more consecutive stones wins.
    if (line.length >= 5) {
      return line;
    }
  }

  return null;
}

// ---------- RESTART BUTTON ----------

if (restartButton) {
  restartButton.onclick = startGame;
}

// ---------- BACK TO MENU (local game) ----------

var backButton = document.getElementById('back');
if (backButton) {
  backButton.onclick = function () {
    window.location.replace('matchmaking.html');
  };
}

// ---------- START THE GAME ----------

startGame();
