// login.js: the code behind the login page.
// It only sends the username and password to the server (through api.js) and
// shows the answer. The server decides everything.

var form = document.getElementById('form');
var usernameInput = document.getElementById('username');
var passwordInput = document.getElementById('password');
var confirmInput = document.getElementById('confirm');
var confirmRow = document.getElementById('confirm-row');
var errorBox = document.getElementById('error');
var submitButton = document.getElementById('submit');
var toggleButton = document.getElementById('toggle');
var tabLogin = document.getElementById('tab-login');
var tabRegister = document.getElementById('tab-register');
var tabIndicator = document.querySelector('.tab-indicator');
var modeNote = document.getElementById('mode-note');

var registering = false; // false = sign in, true = create account

function updateTabIndicator() {
  if (!tabIndicator || !tabLogin) return;
  var tabsRect = tabLogin.parentElement.getBoundingClientRect();
  var target = tabLogin;
  var active = document.querySelector('.tab.active');
  // Fall back to the Sign in tab when the active tab has no size
  // (e.g. the register tab starts hidden in some modes).
  if (active && active.getBoundingClientRect().width > 0) target = active;
  var rect = target.getBoundingClientRect();
  tabIndicator.style.left = (rect.left - tabsRect.left) + 'px';
  tabIndicator.style.width = rect.width + 'px';
  tabIndicator.style.opacity = '1';
}

function setMode(isRegister) {
  registering = isRegister;
  tabLogin.classList.toggle('active', !isRegister);
  tabRegister.classList.toggle('active', isRegister);
  confirmRow.hidden = !isRegister;
  submitButton.textContent = isRegister ? 'Create account' : 'Log in';
  passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
  errorBox.textContent = '';
  updateTabIndicator();
  usernameInput.focus();
}

tabLogin.onclick = function () { setMode(false); };
tabRegister.onclick = function () { setMode(true); };
updateTabIndicator();

toggleButton.onclick = function () {
  var show = passwordInput.type === 'password';
  passwordInput.type = show ? 'text' : 'password';
  confirmInput.type = passwordInput.type;
  toggleButton.textContent = show ? 'Hide' : 'Show';
};

form.onsubmit = function (event) {
  event.preventDefault();
  errorBox.textContent = '';

  var username = usernameInput.value.trim();
  var password = passwordInput.value;

  if (!username || !password) {
    errorBox.textContent = 'Please enter a username and a password.';
    return;
  }
  if (registering && password !== confirmInput.value) {
    errorBox.textContent = 'The two passwords are not the same.';
    return;
  }

  submitButton.disabled = true;
  api('POST', registering ? '/api/register' : '/api/login', { username: username, password: password })
    .then(function () {
      window.location.replace('matchmaking.html');
    })
    .catch(function (e) {
      errorBox.textContent = e.message;
      passwordInput.select();
      submitButton.disabled = false;
    });
};

// Already logged in? Skip this page.
api('GET', '/api/me').then(function () {
  window.location.replace('matchmaking.html');
}).catch(function () { /* not logged in: stay here */ });
