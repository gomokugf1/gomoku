// server/auth.js
// ALL account code lives in this file: register, log in, log out, sessions.
// Accounts are stored either in PostgreSQL (when DATABASE_URL is set) or in
// data/users.json (local testing). Swapping storage only changes the "store" part below.
//
// No password is ever stored or logged. Only a salted scrypt hash is saved.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const express = require('express');

const scrypt = promisify(crypto.scrypt);

// ---------- INPUT RULES ----------

function validateUsername(username) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return 'Username must be 3-20 characters: letters, numbers or _';
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password is too long (max 128 characters).';
  return null;
}

// ---------- PASSWORD HASHING (scrypt) ----------

const N = 16384, R = 8, P = 1, KEYLEN = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[5], 'base64');
  const actual = await scrypt(password, Buffer.from(parts[4], 'base64'), expected.length, {
    N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]),
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Used when the username does not exist, so "unknown user" takes as long as "wrong password".
let dummyHashPromise = null;
function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('not-a-real-password');
  return dummyHashPromise;
}

// ---------- STORAGE ----------
// A store has two functions:
//   find(username)         -> { username, hash } or null
//   create(username, hash) -> true, or false if the name is already taken

function fileStore(file) {
  const users = new Map(); // lowercase username -> { username, hash, created }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [key, u] of Object.entries(data.users || {})) users.set(key, u);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e; // a broken file must NOT silently become an empty one
  }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, users: Object.fromEntries(users) }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file); // write-then-rename, so a crash can't corrupt the file
  }

  return {
    description: 'users.json (' + file + ')',
    async find(username) {
      const u = users.get(username.toLowerCase());
      return u ? { username: u.username, hash: u.hash } : null;
    },
    async create(username, hash) {
      const key = username.toLowerCase();
      if (users.has(key)) return false;
      users.set(key, { username, hash, created: new Date().toISOString() });
      save();
      return true;
    },
  };
}

function sqlStore() {
  const { getPool } = require('./db');
  return {
    description: 'PostgreSQL',
    async find(username) {
      const r = await getPool().query(
        'SELECT username, password_hash FROM users WHERE lower(username) = lower($1)', [username]);
      return r.rows[0] ? { username: r.rows[0].username, hash: r.rows[0].password_hash } : null;
    },
    async create(username, hash) {
      try {
        await getPool().query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hash]);
        return true;
      } catch (e) {
        if (e.code === '23505') return false; // unique violation: name taken
        throw e;
      }
    },
  };
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const store = process.env.DATABASE_URL ? sqlStore() : fileStore(path.join(DATA_DIR, 'users.json'));

// ---------- BRUTE-FORCE PROTECTION ----------
// After `maxFails` tries a key is locked for `lockMs`.

class Limiter {
  constructor(maxFails, lockMs) { this.maxFails = maxFails; this.lockMs = lockMs; this.map = new Map(); }
  check(key) {
    const e = this.map.get(key);
    if (e && e.until > Date.now()) return Math.ceil((e.until - Date.now()) / 60000);
    return 0; // 0 = not locked, otherwise minutes left
  }
  fail(key) {
    let e = this.map.get(key) || { count: 0, until: 0, last: 0 };
    if (e.until && e.until <= Date.now()) e = { count: 0, until: 0, last: 0 };
    e.count++;
    e.last = Date.now();
    if (e.count >= this.maxFails) e.until = Date.now() + this.lockMs;
    this.map.set(key, e);
  }
  success(key) { this.map.delete(key); }
  sweep() {
    const now = Date.now();
    for (const [k, e] of this.map) {
      if (e.until ? e.until <= now : now - e.last > this.lockMs) this.map.delete(k); // old entries go away
    }
  }
}

const userLimiter = new Limiter(5, 15 * 60 * 1000);        // per username + IP
const ipLimiter = new Limiter(30, 15 * 60 * 1000);         // per IP overall
const registerLimiter = new Limiter(20, 60 * 60 * 1000);   // every register try counts
setInterval(() => { userLimiter.sweep(); ipLimiter.sweep(); registerLimiter.sweep(); }, 60 * 1000).unref();

// ---------- SESSIONS (express-session) ----------

// A fresh session id on every login (stops "session fixation").
function startSession(req, username) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = { username };
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Please log in first.' });
}

// ---------- ROUTES ----------

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.post('/api/register', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (registerLimiter.check(req.ip)) {
    return res.status(429).json({ error: 'Too many new accounts from this address. Try again later.' });
  }
  registerLimiter.fail(req.ip);
  const err = validateUsername(username) || validatePassword(password);
  if (err) return res.status(400).json({ error: err });
  const created = await store.create(username, await hashPassword(password));
  if (!created) return res.status(409).json({ error: 'That username is already taken.' });
  await startSession(req, username);
  res.json({ user: { username } });
}));

router.post('/api/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Please enter a username and a password.' });
  }
  const ukey = req.ip + '|' + username.toLowerCase();
  const minutes = userLimiter.check(ukey) || ipLimiter.check(req.ip);
  if (minutes) return res.status(429).json({ error: `Too many attempts. Try again in ${minutes} min.` });

  const user = await store.find(username);
  const good = await verifyPassword(password, user ? user.hash : await dummyHash());
  if (!user || !good) {
    userLimiter.fail(ukey); ipLimiter.fail(req.ip);
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  userLimiter.success(ukey);
  await startSession(req, user.username);
  res.json({ user: { username: user.username } });
}));

router.post('/api/logout', (req, res) => {
  const done = () => { res.clearCookie('gomoku.sid'); res.json({ ok: true }); };
  if (!req.session) return done();
  req.session.destroy(done);
});

router.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: { username: req.session.user.username } });
});

module.exports = { router, requireAuth, storeDescription: store.description };
