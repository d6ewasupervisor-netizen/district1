# District 1 Shared Calendar

Team calendar for District 1 operations: live SAS PROD schedule sync, notes with auto-timestamps, role-based access, and Resend email notifications.

## Architecture

- **Frontend** (`/frontend`) — static HTML/JS on GitHub Pages ([d6ewasupervisor-netizen/district1](https://github.com/d6ewasupervisor-netizen/district1))
- **Backend** (`/backend`) — Node.js + Express + Postgres on Railway
- **Auth** — Dump Bin magic link via **eod-api** (`signin.html` → email link → shared `dumpBinSession` JWT)
- **Email** — Resend (`District 1 <info@retail-odyssey.com>`) for note notifications
- **PROD sync** — automatic; SAS session pushed from eod-api + fallback pull every 5 min

## Roles

| Role | Access |
|------|--------|
| **viewer** | Read calendar, visits, notes |
| **modifier** | + add notes/comments |
| **admin** | + invite users, manage roles |

Founding admins (seeded): Seth Newman, Tyson Gauthier, Amanda Mathews, April Gauthier.

## Sign in

Same flow as The Dump Bin:

1. Open `signin.html` and request a magic link
2. Email lands on `open-sign-in.html` (mobile mail apps) then `index.html?token=`
3. Session JWT is shared with Dump Bin tools on the same device

Users must be on the District 1 roster (`users` table) — Dump Bin sign-in alone is not enough.

## Local development

### Backend

```bash
cd backend
cp .env.example .env   # JWT_SECRET must match eod-api
npm install
npm run dev
```

### Frontend

Serve `frontend/` (Live Server). Override API: `#d1api=http://localhost:3000`

## Railway deploy

1. Connect repo; set **Root Directory** = `backend`
2. Add Postgres plugin
3. Set env vars from `backend/.env.example`:
   - **`JWT_SECRET`** — same value as eod-api
   - **`EOD_API_URL`** + **`EOD_API_INTERNAL_SECRET`** — for SAS session pull
   - **`SAS_SESSION_PUSH_SECRET`** — same as eod-api `DISTRICT1_SESSION_PUSH_SECRET`
4. On **eod-api** Railway: set `DISTRICT1_RAILWAY_URL` and `DISTRICT1_SESSION_PUSH_SECRET`
5. Deploy; migrations run on boot

## PROD connection (automatic)

No manual sync button. eod-api pushes SAS session on every refresh; district1 also pulls `/internal/sas-session/export` when local session is dead. Sync worker runs every 15 minutes.

## Initial sync window

Preloads **P06W3** (Jul 5–11) and **P06W4** (Jul 12–18), 2026.

## API overview

- `GET /api/auth/me` — current user (Dump Bin JWT + roster check)
- `GET /api/calendar/visits?from=&to=` — visits + notes
- `POST /api/notes` — add note (modifier+)
- `POST /api/users/invite` — add user + email Dump Bin sign-in link (admin)
- `GET /api/sync/status` — PROD session status
- `POST /internal/sas-session` — session push from eod-api (secret-gated)
