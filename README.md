# District 1 Shared Calendar

Team calendar for District 1 operations: live SAS PROD schedule sync, notes with auto-timestamps, role-based access, and Resend email notifications.

## Architecture

- **Frontend** (`/frontend`) — static HTML/JS on GitHub Pages (`the-dump-bin/district1`)
- **Backend** (`/backend`) — Node.js + Express + Postgres on Railway
- **Email** — Resend (`District 1 <info@retail-odyssey.com>`)
- **PROD sync** — SAS team-scheduling + field-data, session pushed via `morning-auth.js`

## Roles

| Role | Access |
|------|--------|
| **viewer** | Read calendar, visits, notes |
| **modifier** | + add notes/comments |
| **admin** | + invite users, manage roles, manual sync |

Founding admins (seeded): Seth Newman, Tyson Gauthier, Amanda Mathews, April Gauthier.

## Local development

### Backend

```bash
cd backend
cp .env.example .env   # fill DATABASE_URL, JWT_SECRET, RESEND_API_KEY
npm install
npm run dev
```

### Frontend

Open `frontend/index.html` with Live Server. On localhost, API defaults to `http://localhost:3000`. Override: `#api=http://localhost:3000`

## Railway deploy

1. Connect repo; set **Root Directory** = `backend`
2. Add Postgres plugin
3. Set env vars from `backend/.env.example` (never commit secrets)
4. Deploy; migrations run on boot
5. Update `frontend/js/config.js` `API_BASE` to Railway URL
6. Enable GitHub Pages from `/frontend`

## SAS session push

Extend `sas-auth/morning-auth.js` to POST to:

```
POST https://<district1-railway>/internal/sas-session
Authorization: Bearer $SAS_SESSION_PUSH_SECRET
{ "cookieHeader", "csrfToken", "authToken" }
```

Set `DISTRICT1_RAILWAY_URL` and `DISTRICT1_SESSION_PUSH_SECRET` in sas-auth `.env`.

## Initial sync window

Preloads **P06W3** (Jul 5–11) and **P06W4** (Jul 12–18), 2026.

## API overview

- `POST /api/auth/request-link` — magic link login
- `GET /api/auth/verify-token?token=` — exchange for session JWT
- `GET /api/calendar/visits?from=&to=` — visits + notes
- `POST /api/notes` — add note (modifier+)
- `POST /api/users/invite` — invite user (admin)
- `POST /api/sync/run` — manual PROD sync (admin)
- `POST /internal/sas-session` — session push (secret-gated)
