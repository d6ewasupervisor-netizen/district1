import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const KEY = 'd1-key-'.padEnd(40, 'x');
const seen = [];
let status = { ok: true, session: { alive: true, receivedAt: '2026-11-13T20:00:00Z' }, blocked: { active: false } };

const server = http.createServer((req, res) => {
  seen.push({ url: req.url, key: req.headers['x-gateway-key'], cookie: req.headers.cookie, auth: req.headers.authorization });
  if (req.headers['x-gateway-key'] !== KEY) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(req.url === '/status' ? status : { results: [] }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
process.env.SAS_GATEWAY_URL = `http://127.0.0.1:${server.address().port}`;
process.env.SAS_GATEWAY_KEY = KEY;
const s = await import('../lib/sas-session.js');

test.after(() => server.close());

test('gateway mode sends SAS reads to /sas with the key and no SAS credentials', async () => {
  assert.equal(s.isGatewayMode(), true);
  assert.equal(s.isSessionAlive(), false, 'down until the gateway says alive');
  await s.refreshGatewayStatus();
  assert.equal(s.isSessionAlive(), true);
  await s.sasGet('/api/v1/projects/project-cycles/', { project: 1, page_size: 100 });
  const call = seen.at(-1);
  assert.equal(call.url, '/sas/api/v1/projects/project-cycles/?project=1&page_size=100');
  assert.equal(call.key, KEY);
  assert.equal(call.cookie, undefined);
  assert.equal(call.auth, undefined);
});

test('a blocked or unreachable gateway reads as no session', async () => {
  status = { ok: true, session: { alive: true }, blocked: { active: true } };
  await s.refreshGatewayStatus();
  assert.equal(s.isSessionAlive(), false);
  process.env.SAS_GATEWAY_URL = 'http://127.0.0.1:1';
  await s.refreshGatewayStatus();
  assert.equal(s.isSessionAlive(), false);
  assert.throws(() => s.applySession({ cookieHeader: 'a=b', csrfToken: 'c' }), /gateway/);
});
