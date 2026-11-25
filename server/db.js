// server/db.js
// PostgreSQL connection. Only used when DATABASE_URL is set in .env.
// The password is in DATABASE_URL, never in the code.
//
// Table the server team creates:
//   CREATE TABLE users (
//     id            SERIAL PRIMARY KEY,
//     username      TEXT NOT NULL,
//     password_hash TEXT NOT NULL,
//     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
//   );
//   CREATE UNIQUE INDEX users_username_lower ON users (lower(username));

'use strict';

let pool = null;

function getPool() {
  if (!pool) {
    const { Pool } = require('pg'); // loaded only when needed
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on('error', (err) => console.error('PostgreSQL error:', err.message));
  }
  return pool;
}

module.exports = { getPool };
