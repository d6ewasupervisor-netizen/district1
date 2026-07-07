(function () {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const hashMatch = window.location.hash.match(/d1api=([^&]+)/);
  const d1Api = hashMatch
    ? decodeURIComponent(hashMatch[1]).replace(/\/+$/, '')
    : (isLocal ? 'http://localhost:3000' : 'https://district1-production.up.railway.app');

  window.D1_CONFIG = { API_BASE: d1Api };
})();
