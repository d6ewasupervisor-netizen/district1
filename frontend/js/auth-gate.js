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

  // Scanner safety: do NOT exchange on load (mail scanners fetch URLs and some
  // run page scripts — an automatic exchange burns the single-use link). Show
  // one "Continue to sign in" button and POST /api/verify-token on that click.
  function exchangeLinkToken() {
    var qp = new URLSearchParams(location.search);
    var linkToken = qp.get('token');
    if (!linkToken) return Promise.resolve(!!getSession());

    qp.delete('token');
    var newUrl = location.pathname + (qp.toString() ? '?' + qp.toString() : '') + location.hash;
    try { history.replaceState({}, '', newUrl); } catch (_) {}

    return new Promise(function (resolve) {
      revealPage();
      var overlay = document.createElement('div');
      overlay.id = '__dumpbin_auth_gate_continue';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,32,.78);z-index:2147483000;'
        + 'display:flex;align-items:center;justify-content:center;font-family:Calibri,Arial,sans-serif;';
      var card = document.createElement('div');
      card.style.cssText = 'background:#fff;border-radius:12px;padding:28px 30px;max-width:340px;text-align:center;';
      var title = document.createElement('div');
      title.textContent = 'Sign in';
      title.style.cssText = 'font-size:18px;font-weight:600;color:#1b2733;margin-bottom:10px;';
      var note = document.createElement('div');
      note.textContent = 'One click finishes signing you in.';
      note.style.cssText = 'font-size:13px;color:#5b6b7b;margin-bottom:18px;';
      var btn = document.createElement('button');
      btn.textContent = 'Continue to sign in';
      btn.style.cssText = 'font-size:15px;padding:10px 22px;border:0;border-radius:8px;background:#2F6FB0;color:#fff;cursor:pointer;';
      var err = document.createElement('div');
      err.style.cssText = 'font-size:13px;color:#b3261e;margin-top:12px;min-height:16px;';
      var alt = document.createElement('div');
      alt.style.cssText = 'font-size:12px;color:#5b6b7b;margin-top:14px;';
      var altLink = document.createElement('a');
      altLink.href = SIGNIN_PATH;
      altLink.textContent = 'Request a new link';
      altLink.style.cssText = 'color:#2F6FB0;';
      alt.appendChild(altLink);
      card.appendChild(title);
      card.appendChild(note);
      card.appendChild(btn);
      card.appendChild(err);
      card.appendChild(alt);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      btn.addEventListener('click', async function () {
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        err.textContent = '';
        try {
          var res = await fetch(EOD_API + '/api/verify-token', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: linkToken }),
          });
          var data = await res.json().catch(function () { return {}; });
          if (!res.ok || !data.ok || !data.token) {
            err.textContent = (data && data.error) || 'Sign-in link invalid or used.';
            btn.disabled = false;
            btn.textContent = 'Continue to sign in';
            return;
          }
          setSession(data.token);
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(true);
        } catch (_) {
          err.textContent = 'Could not reach the sign-in service. Check your connection and try again.';
          btn.disabled = false;
          btn.textContent = 'Continue to sign in';
        }
      });
    });
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
