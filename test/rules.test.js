// Run with:  npm test
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const rules = require('../server/rules');

function playing() {
  return { status: 'playing', turn: 'black', board: rules.createBoard() };
}

test('board is 19x19 and empty', () => {
  const b = rules.createBoard();
  assert.strictEqual(b.length, 19);
  assert.ok(b.every((row) => row.length === 19 && row.every((c) => c === '')));
});

test('legal move rules', () => {
  const m = playing();
  assert.strictEqual(rules.legalMoveError(m, 'black', 9, 9), null);
  assert.ok(rules.legalMoveError(m, 'white', 9, 9), 'wrong turn');
  assert.ok(rules.legalMoveError(m, 'black', -1, 0), 'off board');
  assert.ok(rules.legalMoveError(m, 'black', 0, 19), 'off board');
  assert.ok(rules.legalMoveError(m, 'black', 1.5, 2), 'not an integer');
  assert.ok(rules.legalMoveError(m, 'black', '3', 3), 'not a number');
  m.board[4][4] = 'white';
  assert.ok(rules.legalMoveError(m, 'black', 4, 4), 'occupied');
  assert.ok(rules.legalMoveError({ ...m, status: 'waiting' }, 'black', 0, 0));
  assert.ok(rules.legalMoveError({ ...m, status: 'finished' }, 'black', 0, 0));
});

test('five in a row wins in all four directions', () => {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    const b = rules.createBoard();
    for (let i = 0; i < 5; i++) b[5 + dr * i + (dc < 0 ? 0 : 0)][8 + dc * i] = 'black';
    assert.ok(rules.findFive(b, 5 + dr * 2, 8 + dc * 2, 'black'), 'direction ' + dr + ',' + dc);
  }
});

test('four is not enough, six or more still wins', () => {
  let b = rules.createBoard();
  for (let i = 0; i < 4; i++) b[0][i] = 'white';
  assert.strictEqual(rules.findFive(b, 0, 3, 'white'), null);
  b = rules.createBoard();
  for (let i = 0; i < 6; i++) b[18][i + 2] = 'black';
  assert.strictEqual(rules.findFive(b, 18, 4, 'black').length, 6);
});

test('draw happens only on a full board', () => {
  assert.strictEqual(rules.isBoardFull(360), false);
  assert.strictEqual(rules.isBoardFull(361), true);
});
