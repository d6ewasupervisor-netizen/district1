# Audit

## How it is built

- `backend/` (Railway service `district1`, project airy-freedom, deploys from `main`, root `/backend`): Express + Postgres. `lib/sas-sync.js` pulls PROD cycles, visits, field-data, and per-visit rosters into `prod_visits` every `SYNC_INTERVAL_MINUTES` (15).
- `lib/sas-session.js`: gateway mode (`SAS_GATEWAY_URL` + `SAS_GATEWAY_KEY`) sends SAS reads through the office gateway's `/sas` lane; otherwise the old pushed/pulled session.
- `frontend/`: GitHub Pages (`pages.yml`).

## Open

- No SAS while the office PC is off or the gateway is not signed in; the calendar shows the last sync.
- Rosters are re-read for every visit on every sync.
