# Agent log

## 2026-11-13 — Retired

Not in use: four accounts made 2026-07-07, Tyson the only one ever signed in (that night), one note, no comments, 0 Pages views in 14 days, no HTTP requests on record. The sync still ran every 15 minutes (12,329 runs) and upserted 0 visits for the last 5 days while pulling division-wide SAS pages. Tyson retired it: data exported to `Downloads/district1-final-export-20261113.json` on his PC, Railway project airy-freedom (service `district1` + Postgres) deleted, GitHub Pages turned off, repo archived. eod-api's District 1 push, export secret, and sign-in return path are removed on its side.

## 2026-11-13 — SAS through the office gateway

SAS's Cloudflare refuses Railway, and eod-api no longer exports or pushes its SAS session (it lives on the gateway on Tyson's office PC). With `SAS_GATEWAY_URL` + `SAS_GATEWAY_KEY` set, `sasGet` calls `<gw>/sas/...` with `X-Gateway-Key` and no SAS credentials; the gateway adds the shared session. `isSessionAlive()` is the gateway's `/status` (session alive and not blocked), polled every 60 s in place of the eod-api pull; the first poll that finds it alive runs the bootstrap and a sync. `POST /internal/sas-session` answers 409 in this mode. Railway service `district1` (project airy-freedom) has both variables; the key is this service's own (`SAS_GATEWAY_KEYS` in sas-auth `.env`). Test: `backend/test/sas-session.test.js` 2/2.
