// server/server.js
// One Node.js process: delivers the files in public/ and answers the /api/... routes.
//   npm start   ->   http://localhost:3000

'use strict';

try { require('dotenv').config(); } catch (e) { /* dotenv is optional, settings can come from the system */ }

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const auth = require('./auth');
const matchesRouter = require('./matches');

const PORT = Number(process.env.PORT) || 3000;

let secret = process.env.SESSION_SECRET;
if (!secret || secret === 'change-me') {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('WARNING: SESSION_SECRET is not set in .env. Using a random one, so everybody is logged out when the server restarts.');
}

const app = express();
app.set('trust proxy', 1);       // online traffic arrives through Tailscale Funnel; without this secure cookies fail
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});

app.use(session({
  name: 'gomoku.sid',
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto',               // secure when the request came in over https (needs trust proxy above)
    maxAge: 12 * 60 * 60 * 1000,  // 12 hours
  },
}));

app.use(express.json({ limit: '10kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.use(auth.router);            // /api/register /api/login /api/logout /api/me
app.use(matchesRouter);          // /api/matchmaking/... /api/match/...
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

// Errors always come back as { error: "text" }
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Server error. Please try again.' : 'Bad request.' });
});

app.listen(PORT, () => {
  console.log('GOMOKU server on http://localhost:' + PORT + '  (accounts: ' + auth.storeDescription + ')');
});
