# Agent log

## 2026-11-13 — SAS through the office gateway

SAS's Cloudflare refuses Railway, and eod-api no longer exports or pushes its SAS session (it lives on the gateway on Tyson's office PC). With `SAS_GATEWAY_URL` + `SAS_GATEWAY_KEY` set, `sasGet` calls `<gw>/sas/...` with `X-Gateway-Key` and no SAS credentials; the gateway adds the shared session. `isSessionAlive()` is the gateway's `/status` (session alive and not blocked), polled every 60 s in place of the eod-api pull; the first poll that finds it alive runs the bootstrap and a sync. `POST /internal/sas-session` answers 409 in this mode. Railway service `district1` (project airy-freedom) has both variables; the key is this service's own (`SAS_GATEWAY_KEYS` in sas-auth `.env`). Test: `backend/test/sas-session.test.js` 2/2.
