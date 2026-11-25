// api.js: the ONE fetch helper every page uses.
//   api('POST', '/api/match/' + id + '/move', { row, col })
// Returns a promise with the JSON answer. On an error it rejects with an Error
// whose message is a text the player can read (and .status is the HTTP status).
// A 401 (not logged in) sends the player to login.html.

function api(method, url, body) {
  var options = { method: method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  function fail(message, status) {
    var e = new Error(message);
    e.status = status;
    return e;
  }

  return fetch(url, options).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) {
        if (res.status === 401 && !/login\.html$/.test(window.location.pathname)) {
          window.location.replace('login.html');
        }
        throw fail(data.error || 'Something went wrong.', res.status);
      }
      return data;
    });
  }, function () {
    throw fail('Cannot reach the server. Check your connection.', 0);
  });
}
