// session.js: shows who is logged in and makes the Log out button work.
// Needs api.js first, and an element #user-name and a button #logout on the page.
// window.sessionReady is a promise: it gives { username } when logged in.
// (If nobody is logged in, api.js has already sent the player to login.html.)

window.sessionReady = api('GET', '/api/me').then(function (data) {
  var nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = data.user.username;
  return data.user;
});
window.sessionReady.catch(function () { /* each page shows its own error */ });

(function () {
  var logoutBtn = document.getElementById('logout');
  if (!logoutBtn) return;
  logoutBtn.onclick = function () {
    function toLogin() { window.location.replace('login.html'); }
    api('POST', '/api/logout').then(toLogin, toLogin);
  };
})();
