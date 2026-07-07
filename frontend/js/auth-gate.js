(function () {
  'use strict';

  var SESSION_KEY = 'dumpBinSession';
  var LEGACY_KEY = 'eodSession';
  var BASE_PATH = (function () {
    var m = (location.pathname || '').match(/^(\/district1)(?=\/|$)/i);
    return m ? m[1] : '';
  })();
  var SIGNIN_PATH = BASE_PATH + '/signin.html';
  var OPEN_SIGNIN_PATH = BASE_PATH + '/open-sign-in.html';
  var PUBLIC_PATHS = [SIGNIN_PATH.toLowerCase(), OPEN_SIGNIN_PATH.toLowerCase()];

  var EOD_API = (function () {
    var hashApi = (location.hash.match(/api=([^&]+)/) || [])[1];
    if (hashApi) return decodeURIComponent(hashApi).replace(/\/+$/, '');
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    return 'https://eod-api.the-dump-bin.com';
  })();

  function getSession() {
    try {
      var v = localStorage.getItem(SESSION_KEY);
      if (v) return v;
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        localStorage.setItem(SESSION_KEY, legacy);
        localStorage.removeItem(LEGACY_KEY);
        return legacy;
      }
    } catch (_) {}
    return '';
  }
  function setSession(v) { try { localStorage.setItem(SESSION_KEY, v); } catch (_) {} }
  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch (_) {}
  }

  function isPublicPath() {
    var p = (location.pathname || '/').toLowerCase();
    return PUBLIC_PATHS.indexOf(p) >= 0;
  }

  function bounceToSignIn(reason) {
    clearSession();
    if (isPublicPath()) return;
    try { console.warn('[d1-auth] redirect:', reason || ''); } catch (_) {}
    var next = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace(SIGNIN_PATH + '?next=' + next);
  }

  var _hideStyle = null;
  function hidePage() {
    if (_hideStyle) return;
    _hideStyle = document.createElement('style');
    _hideStyle.textContent = 'html,body{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(_hideStyle);
  }
  function revealPage() {
    if (_hideStyle && _hideStyle.parentNode) _hideStyle.parentNode.removeChild(_hideStyle);
    _hideStyle = null;
  }

  async function exchangeLinkToken() {
    var qp = new URLSearchParams(location.search);
    var linkToken = qp.get('token');
    if (!linkToken) return !!getSession();
    hidePage();
    try {
      var res = await fetch(EOD_API + '/api/verify-token?token=' + encodeURIComponent(linkToken));
      var data = await res.json().catch(function () { return {}; });
      qp.delete('token');
      var newUrl = location.pathname + (qp.toString() ? '?' + qp.toString() : '') + location.hash;
      try { history.replaceState({}, '', newUrl); } catch (_) {}
      if (!res.ok || !data.ok || !data.token) {
        try {
          sessionStorage.setItem('dumpBinSignInError', (data && data.error) || 'Sign-in link invalid or used.');
        } catch (_) {}
        return !!getSession();
      }
      setSession(data.token);
      return true;
    } catch (err) {
      return !!getSession();
    }
  }

  async function authFetch(url, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    var tok = getSession();
    if (tok) headers.Authorization = 'Bearer ' + tok;
    var fullUrl = url;
    if (typeof url === 'string' && url.indexOf('/api/') === 0) {
      fullUrl = EOD_API + url;
    }
    var pass = Object.assign({}, opts);
    delete pass.noBounceOn401;
    pass.headers = headers;
    var res = await fetch(fullUrl, pass);
    if (res.status === 401 && !opts.noBounceOn401) {
      bounceToSignIn('401');
    }
    return res;
  }

  function signOut() {
    clearSession();
    location.assign(SIGNIN_PATH);
  }

  var bootPromise = (async function boot() {
    if (isPublicPath()) {
      revealPage();
      return;
    }
    var qp = new URLSearchParams(location.search);
    var hasToken = !!qp.get('token');
    var hadSession = !!getSession();
    if (!hadSession && !hasToken) {
      hidePage();
      bounceToSignIn('no session');
      return;
    }
    if (hasToken) {
      hidePage();
      var ok = await exchangeLinkToken();
      if (!ok) {
        bounceToSignIn('verify failed');
        return;
      }
    }
    revealPage();
  })();

  window.dumpBinAuth = {
    EOD_API: EOD_API,
    BASE_PATH: BASE_PATH,
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    signOut: signOut,
    fetch: authFetch,
    bounceToSignIn: bounceToSignIn,
    bootPromise: bootPromise,
  };
  window.dumpBinAuthFetch = authFetch;
  window.dumpBinSignOut = signOut;
  window.dumpBinAuthReady = bootPromise;
})();
