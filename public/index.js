// index.js: logged in -> matchmaking, otherwise -> login.
fetch('/api/me', { credentials: 'same-origin' }).then(function (res) {
  window.location.replace(res.ok ? 'matchmaking.html' : 'login.html');
}, function () {
  window.location.replace('login.html');
});
