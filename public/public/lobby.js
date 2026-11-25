// lobby.js (lobby.html?match=<id>)
// Asks the server 2 times a second who is in the match.
// As soon as the second player is in, game.html opens.

var roomCodeEl = document.getElementById('room-code');
var playersEl = document.getElementById('players');
var statusEl = document.getElementById('status');
var leaveBtn = document.getElementById('leave');
var startBtn = document.getElementById('start');

var matchId = new URLSearchParams(window.location.search).get('match');
var polling = false;
var timer = null;

function toMatchmaking() { window.location.replace('matchmaking.html'); }
function toGame() { window.location.href = 'game.html?match=' + encodeURIComponent(matchId); }

function seatLine(color, seat) {
  var el = document.createElement('div');
  el.className = 'lobby-seat ' + color;
  el.textContent = (color === 'black' ? 'Black: ' : 'White: ') + (seat ? seat.username : '(waiting…)');
  return el;
}

function render(m) {
  roomCodeEl.textContent = m.code;
  playersEl.innerHTML = '';
  playersEl.appendChild(seatLine('black', m.players.black));
  playersEl.appendChild(seatLine('white', m.players.white));
  if (m.status === 'waiting') {
    statusEl.textContent = 'Waiting for the other player…';
    statusEl.className = 'status';
  } else {
    statusEl.textContent = 'Both players are here. Starting…';
    statusEl.className = 'status ok';
    startBtn.hidden = false;
  }
}

function poll() {
  if (polling) return;
  polling = true;
  api('GET', '/api/match/' + encodeURIComponent(matchId) + '/state').then(function (data) {
    render(data.match);
    if (data.match.status !== 'waiting') { clearInterval(timer); toGame(); }
  }).catch(function (e) {
    if (e.status === 404 || e.status === 403) {
      clearInterval(timer);
      statusEl.textContent = 'This match does not exist any more.';
      statusEl.className = 'status error';
    } else {
      statusEl.textContent = e.message; // server hiccup: keep polling
      statusEl.className = 'status error';
    }
  }).then(function () { polling = false; });
}

leaveBtn.onclick = function () {
  clearInterval(timer);
  api('POST', '/api/match/' + encodeURIComponent(matchId) + '/leave').then(toMatchmaking, toMatchmaking);
};
startBtn.onclick = toGame;

if (!matchId) {
  toMatchmaking();
} else {
  window.sessionReady.then(function () {
    poll();
    timer = setInterval(poll, 500);
  }).catch(function () {});
}
