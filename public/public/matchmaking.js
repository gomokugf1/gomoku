// matchmaking.js: quick match, create a room, join a room by code.
// All of them end in lobby.html?match=<id>.

var findBtn = document.getElementById('find');
var createBtn = document.getElementById('create');
var joinBtn = document.getElementById('join');
var codeInput = document.getElementById('code');
var localBtn = document.getElementById('local');
var noteEl = document.getElementById('note');

function showError(text) { noteEl.textContent = text; }

function setBusy(busy) {
  findBtn.disabled = busy;
  createBtn.disabled = busy;
  joinBtn.disabled = busy;
}

function toLobby(data) {
  window.location.href = 'lobby.html?match=' + encodeURIComponent(data.matchId);
}

// Runs one request, shows its error on the page, goes to the lobby when it works.
function run(method, url, body) {
  showError('');
  setBusy(true);
  api(method, url, body).then(toLobby).catch(function (e) {
    showError(e.message);
    setBusy(false);
  });
}

findBtn.onclick = function () { run('POST', '/api/matchmaking/find'); };
createBtn.onclick = function () { run('POST', '/api/match'); };

function joinRoom() {
  var code = codeInput.value.trim();
  if (!code) { showError('Enter a room code first.'); return; }
  run('POST', '/api/match/join', { code: code });
}
joinBtn.onclick = joinRoom;
codeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') joinRoom(); });

localBtn.onclick = function () { window.location.href = 'local.html'; };
