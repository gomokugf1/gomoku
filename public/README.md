# GOMOKU (Five in a Row), browser version

One Node.js server delivers the pages, handles login and runs every match.
Players open the address in a browser. The browser only draws things and sends
clicks. The server decides who is logged in, who plays whom, whether a move is
legal and who wins.

## Run it on your computer

```
npm install
npm start
```

Open http://localhost:3000. To test two players, use one normal window and one
private/incognito window (each has its own login cookie).

Settings go in a `.env` file (copy `.env.example`). Without a `.env` everything
still starts, but you get a warning and everybody is logged out when the server restarts.

```
npm test      # tests for the game rules
```

## Files

```
server/
  server.js    Express on PORT (default 3000), trust proxy, sessions, serves public/
  auth.js      register, login, logout, sessions, password hashing, account storage
  matches.js   quick match, rooms, lobby, running matches
  rules.js     Gomoku rules: legal move, five in a row, draw
  db.js        PostgreSQL connection (only used when DATABASE_URL is set)
public/
  index.html (+ index.js)              sends you to login or matchmaking
  login / matchmaking / lobby / game   .html .css .js each
  local.html + local.js                two players on one computer (old local mode)
  api.js       the one fetch helper: api('POST', '/api/match/' + id + '/move', { row, col })
  session.js   shows the user name, Log out button
  style.css    shared colours, board and fonts
  assets/      icon
```

Page flow: login -> matchmaking -> lobby -> game. Leaving or finishing a game
goes back to matchmaking, logging out goes back to login. Every page checks
`GET /api/me` and goes to login.html when you are not logged in.

## API

All routes send and return JSON. Errors are a 4xx status with `{ "error": "text for the player" }`.

| Method | Route | Sends | Returns |
|---|---|---|---|
| POST | /api/register | { username, password } | { user } and logs in |
| POST | /api/login | { username, password } | { user } |
| POST | /api/logout | | { ok: true } |
| GET | /api/me | | { user } or 401 |
| POST | /api/matchmaking/find | | { matchId, status } (waiting or playing) |
| POST | /api/match | | { matchId, code } (new room) |
| POST | /api/match/join | { code } | { matchId } |
| GET | /api/match/:id/state | | { match } |
| POST | /api/match/:id/move | { row, col } | { match } |
| POST | /api/match/:id/restart | | { match } |
| POST | /api/match/:id/leave | | { ok: true } |

The match object has what the spec lists (`status`, `board`, `turn`, `moves`,
`winner`, `players`, `myRestartAccepted`, `otherRestartAccepted`) plus a few
extras the page needs: `id`, `code`, `myColor`, `lastMove`, `winningLine`,
`endReason` (`five`, `draw` or `left`) and `opponentLeft`.

## Rules (all checked in server/rules.js)

19x19 board, Black starts, a move needs status `playing`, your turn, a square
on the board and empty. Five **or more** in a row wins. A full board is a draw.
Restart needs both players to press it. If a player leaves during a game the
other player wins.

## Accounts

* Usernames 3-20 characters (letters, numbers, `_`), passwords at least 8.
* Only a salted scrypt hash is stored. Login cookie: `httpOnly`, `sameSite: 'lax'`, `secure` on https.
* **No `DATABASE_URL`:** accounts go in `data/users.json` (local testing).
  Accounts from the old Electron app can be copied here: same file format.
* **With `DATABASE_URL`:** PostgreSQL with a `users` table (`id`, `username`,
  `password_hash`, `created_at`). The SQL to create it is at the top of `server/db.js`.
  Queries use `$1`, `$2`. All account code is in `server/auth.js`.

## Going online

The server team runs it with pm2 and Tailscale Funnel. Deploy with:

```
git pull && npm install && pm2 restart gomoku
```

Matches and login sessions are kept in memory, so a restart ends running
matches and logs everybody out. Set `SESSION_SECRET` in `.env` on the server.

## Git

Never commit `node_modules/`, `.env`, `data/` or `dist/` (already in `.gitignore`).
Pull before you start, push small commits often.
