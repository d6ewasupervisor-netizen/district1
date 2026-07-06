(function () {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    window.D1_CONFIG = { API_BASE: 'http://localhost:3000' };
    return;
  }
  const hashMatch = window.location.hash.match(/api=([^&]+)/);
  if (hashMatch) {
    window.D1_CONFIG = { API_BASE: decodeURIComponent(hashMatch[1]) };
    return;
  }
  window.D1_CONFIG = {
    API_BASE: 'https://district1-production.up.railway.app',
  };
})();
