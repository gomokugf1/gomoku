// server/matches.js
// Matchmaking, rooms and running matches. The match state lives in memory
// (a server restart ends all running matches). The rules are in rules.js.

'use strict';

const crypto = require('crypto');
const express = require('express');
const rules = require('./rules');
const { requireAuth } = require('./auth');

const matches = new Map(); // matchId -> match
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, easier to read out loud
const MAX_AGE_MS = 2 * 60 * 60 * 1000;                  // matches nobody touched for 2 hours are removed

// ---------- HELPERS ----------

function newCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  } while (findByCode(code));
  return code;
}

function findByCode(code) {
  for (const m of matches.values()) if (m.code === code) return m;
  return null;
}

function createMatch(username) {
  const m = {
    id: crypto.randomBytes(6).toString('hex'),
    code: newCode(),
    status: 'waiting',                         // waiting | playing | finished
    players: { black: username, white: null }, // the creator is Black
    left: new Set(),                           // usernames that left this match
    board: rules.createBoard(),
    turn: 'black',
    moves: 0,
    winner: null,                              // 'black' | 'white' | null
    endReason: null,                           // 'five' | 'draw' | 'left'
    winningLine: null,
    lastMove: null,
    restart: new Set(),                        // usernames that pressed Restart
    updated: Date.now(),
  };
  matches.set(m.id, m);
  return m;
}

// Which colour is this user in this match? (null = not in it, or already left)
function colorOf(m, username) {
  if (m.left.has(username)) return null;
  if (m.players.black === username) return 'black';
  if (m.players.white === username) return 'white';
  return null;
}

function other(color) { return color === 'black' ? 'white' : 'black'; }
function touch(m) { m.updated = Date.now(); }

// What the browser gets. No session data, only what is needed to draw the page.
function view(m, username) {
  const me = colorOf(m, username);
  const opp = me ? m.players[other(me)] : null;
  const seat = (name) => (name ? { username: name } : null);
  return {
    id: m.id,
    code: m.code,
    status: m.status,
    board: m.board,
    turn: m.status === 'playing' ? m.turn : null,
    moves: m.moves,
    winner: m.winner,
    endReason: m.endReason,
    winningLine: m.winningLine,
    lastMove: m.lastMove,
    players: { black: seat(m.players.black), white: seat(m.players.white) },
    myColor: me,
    opponentLeft: Boolean(opp && m.left.has(opp)),
    myRestartAccepted: m.restart.has(username),
    otherRestartAccepted: Boolean(opp && m.restart.has(opp)),
  };
}

function joinMatch(m, username) {
  const seat = m.players.black ? 'white' : 'black';
  m.players[seat] = username;
  m.status = 'playing';
  m.restart.clear();
  touch(m);
}

// A player who waits alone in a lobby disappears when they start something else.
function dropWaiting(username, exceptId) {
  for (const m of [...matches.values()]) {
    if (m.status === 'waiting' && m.id !== exceptId && colorOf(m, username)) matches.delete(m.id);
  }
}

function resetMatch(m) {
  m.board = rules.createBoard();
  m.moves = 0;
  m.turn = 'black'; // Black starts again
  m.winner = null;
  m.endReason = null;
  m.winningLine = null;
  m.lastMove = null;
  m.restart.clear();
  m.status = 'playing';
}

setInterval(() => {
  const now = Date.now();
  for (const [id, m] of matches) if (now - m.updated > MAX_AGE_MS) matches.delete(id);
}, 5 * 60 * 1000).unref();

// ---------- ROUTES ----------

const router = express.Router();
router.use(['/api/match', '/api/matchmaking'], requireAuth);

// Quick match: join the next free player, or wait for one.
router.post('/api/matchmaking/find', (req, res) => {
  const user = req.session.user.username;

  // Already waiting in a quick match? Then just go back to it.
  for (const m of matches.values()) {
    if (m.status === 'waiting' && m.quick && colorOf(m, user)) return res.json({ matchId: m.id, status: m.status });
  }
  dropWaiting(user);

  for (const m of matches.values()) {
    if (m.status === 'waiting' && m.quick && !colorOf(m, user)) {
      joinMatch(m, user);
      return res.json({ matchId: m.id, status: m.status });
    }
  }
  const m = createMatch(user);
  m.quick = true;
  res.json({ matchId: m.id, status: m.status });
});

// Create a room with a code you can tell a friend.
router.post('/api/match', (req, res) => {
  const user = req.session.user.username;
  dropWaiting(user);
  const m = createMatch(user);
  res.json({ matchId: m.id, code: m.code });
});

// Join a room by its code.
router.post('/api/match/join', (req, res) => {
  const user = req.session.user.username;
  const code = typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!code) return res.status(400).json({ error: 'Please enter a room code.' });
  const m = findByCode(code);
  if (!m) return res.status(404).json({ error: 'There is no room with that code.' });
  if (colorOf(m, user)) return res.json({ matchId: m.id }); // you are already in it
  if (m.status !== 'waiting') return res.status(400).json({ error: 'That room is already full.' });
  dropWaiting(user, m.id);
  joinMatch(m, user);
  res.json({ matchId: m.id });
});

// Every route with :id only works for the two players of that match.
router.param('id', (req, res, next, id) => {
  const m = matches.get(id);
  if (!m) return res.status(404).json({ error: 'That match no longer exists.' });
  const color = colorOf(m, req.session.user.username);
  if (!color) return res.status(403).json({ error: 'You are not in this match.' });
  req.match = m;
  req.color = color;
  next();
});

router.get('/api/match/:id/state', (req, res) => {
  res.json({ match: view(req.match, req.session.user.username) });
});

router.post('/api/match/:id/move', (req, res) => {
  const m = req.match, user = req.session.user.username;
  const { row, col } = req.body || {};
  const error = rules.legalMoveError(m, req.color, row, col);
  if (error) return res.status(400).json({ error });

  m.board[row][col] = req.color;
  m.moves++;
  m.lastMove = { row, col };
  const line = rules.findFive(m.board, row, col, req.color);
  if (line) {
    m.status = 'finished';
    m.winner = req.color;
    m.endReason = 'five';
    m.winningLine = line;
  } else if (rules.isBoardFull(m.moves)) {
    m.status = 'finished'; // full board and nobody won = draw
    m.winner = null;
    m.endReason = 'draw';
  } else {
    m.turn = other(req.color);
  }
  touch(m);
  res.json({ match: view(m, user) });
});

// Restart only happens when BOTH players have pressed it.
router.post('/api/match/:id/restart', (req, res) => {
  const m = req.match, user = req.session.user.username;
  if (m.status === 'waiting') return res.status(400).json({ error: 'Waiting for a second player.' });
  if (m.left.has(m.players[other(req.color)])) {
    return res.status(400).json({ error: 'Your opponent has left the match.' });
  }
  m.restart.add(user);
  if (m.restart.has(m.players.black) && m.restart.has(m.players.white)) resetMatch(m);
  touch(m);
  res.json({ match: view(m, user) });
});

// Leaving during a game gives the win to the other player.
router.post('/api/match/:id/leave', (req, res) => {
  const m = req.match, user = req.session.user.username;
  if (m.status === 'waiting') {
    matches.delete(m.id); // nobody else is in the lobby
    return res.json({ ok: true });
  }
  if (m.status === 'playing') {
    m.status = 'finished';
    m.winner = other(req.color);
    m.endReason = 'left';
    m.winningLine = null;
  }
  m.restart.clear();
  m.left.add(user);
  touch(m);
  if (m.left.has(m.players.black) && m.left.has(m.players.white)) matches.delete(m.id);
  res.json({ ok: true });
});

module.exports = router;
