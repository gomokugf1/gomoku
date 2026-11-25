// server/rules.js
// The Gomoku rules. Only the server uses this file, the browser never decides anything.

'use strict';

const SIZE = 19; // rows and columns are numbered 0-18

function createBoard() {
  const board = [];
  for (let r = 0; r < SIZE; r++) board.push(Array(SIZE).fill(''));
  return board;
}

// Returns a text for the player if the move is NOT allowed, or null if it is fine.
// `match` needs: status, turn, board.  `color` is the colour of the player who clicked.
function legalMoveError(match, color, row, col) {
  if (match.status === 'waiting') return 'Waiting for a second player.';
  if (match.status === 'finished') return 'The game is over.';
  if (match.status !== 'playing') return 'This match is not running.';
  if (match.turn !== color) return "It's not your turn yet.";
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= SIZE || col < 0 || col >= SIZE) {
    return 'That square is not on the board.';
  }
  if (match.board[row][col] !== '') return 'That square is already taken.';
  return null;
}

// Looks through the new stone in the four directions (horizontal, vertical, two diagonals).
// Five or MORE in a row wins. Returns the winning stones [[r,c], ...] or null.
function findFive(board, row, col, color) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    const line = [[row, col]];
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === color) {
      line.push([r, c]); r += dr; c += dc;
    }
    r = row - dr; c = col - dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === color) {
      line.push([r, c]); r -= dr; c -= dc;
    }
    if (line.length >= 5) return line;
  }
  return null;
}

function isBoardFull(moves) {
  return moves >= SIZE * SIZE;
}

module.exports = { SIZE, createBoard, legalMoveError, findFive, isBoardFull };
