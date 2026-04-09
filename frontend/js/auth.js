(function () {
  'use strict';

  function buildUserPool() {
    var cfg = window._config.cognito;
    return new AmazonCognitoIdentity.CognitoUserPool({
      UserPoolId: cfg.userPoolId,
      ClientId: cfg.userPoolClientId,
    });
  }

  function signIn(email, password) {
    return new Promise(function (resolve, reject) {
      var userPool = buildUserPool();
      var cognitoUser = new AmazonCognitoIdentity.CognitoUser({
        Username: email,
        Pool: userPool,
      });
      cognitoUser.authenticateUser(
        new AmazonCognitoIdentity.AuthenticationDetails({
          Username: email,
          Password: password,
        }),
        {
          onSuccess: function () { resolve(); },
          onFailure: function (err) { reject(err); },
          newPasswordRequired: function () {
            reject(new Error('New password required. Please contact an administrator.'));
          },
        }
      );
    });
  }

  function restoreSession() {
    return new Promise(function (resolve) {
      var currentUser = buildUserPool().getCurrentUser();
      if (!currentUser) return resolve(false);
      currentUser.getSession(function (err, session) {
        resolve(!err && session && session.isValid());
      });
    });
  }

  function signOut() {
    var currentUser = buildUserPool().getCurrentUser();
    if (currentUser) currentUser.signOut();
    window.location.href = (window._config.basePath || '') + '/signin.html';
  }

  function getToken() {
    return new Promise(function (resolve, reject) {
      var currentUser = buildUserPool().getCurrentUser();
      if (!currentUser) return reject(new Error('No user session. Please sign in.'));
      currentUser.getSession(function (err, session) {
        if (err || !session || !session.isValid()) {
          return reject(err || new Error('Invalid session. Please sign in.'));
        }
        resolve(session.getAccessToken().getJwtToken());
      });
    });
  }

  function apiFetch(path, options) {
    return getToken().catch(function (err) {
      window.location.href = 'signin.html?ref=' + encodeURIComponent(window.location.href);
      throw err;
    }).then(function (token) {
      var url = window._config.api.url + path;
      var opts = Object.assign({}, options || {});
      opts.headers = Object.assign({}, opts.headers || {}, {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      });
      return fetch(url, opts).then(function (res) {
        if (res.status === 401) {
          signOut();
          throw new Error('Unauthorized');
        }
        if (!res.ok) {
          return res.text().then(function (text) {
            throw new Error('API error ' + res.status + ': ' + text);
          });
        }
        return res.json();
      });
    });
  }

  window.Auth = {
    signIn: signIn,
    restoreSession: restoreSession,
    signOut: signOut,
    getToken: getToken,
    apiFetch: apiFetch,
  };
})();
