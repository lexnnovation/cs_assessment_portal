# CS Assessment Portal

A single-use-access-code knowledge test portal for customer service officers, plus an admin
dashboard to manage officers, questions, settings, and a live audit log.

Next.js (App Router) + SQLite (`better-sqlite3`). All quiz logic — question order, answer
shuffling, correct answers, and scoring — lives server-side; the client only ever receives the
current question's text and shuffled option labels, never the answer key.

## Features

**Officer test flow**
- Redeem a single-use access code (format `CS-XXXXX`) to start the test — once submitted, or if
  the code is reused, further attempts are logged and blocked.
- Questions are served one at a time, each on a configurable countdown (`secondsPerQuestion`).
- Question order and per-question option order are deterministically shuffled per officer (seeded
  off their code), so each officer sees a different arrangement that stays stable across page
  reloads/reopens without needing to persist the shuffled order server-side.
- Tab/window switches during the test are detected (`visibilitychange`) and recorded, not blocked
  — visible to admins as a signal, not an interruption to the officer.
- Scoring and the answer key never reach the client; only shuffled option text and labels do.

**Admin dashboard** (passcode-protected, `iron-session`)
- **Live log** — real-time feed of officer activity: opened, submitted, reopened, blocked reuse
  attempts.
- **Officers & codes** — generate single-use access codes, track per-officer status/score, reset
  an officer's attempt, export all results as CSV (scores, timestamps, tab-switch and reuse-attempt
  counts).
- **Questions** — add/edit/delete questions individually, or bulk-import from `.xlsx`/`.csv`
  (columns: Question, A, B, C, D, Correct) with per-row validation and a per-row error report for
  anything that fails to import.
- **Settings** — test title, quarter/period label, per-question time limit, and whether officers
  see their score after submitting.

**Security & operational design**
- Admin session is an encrypted, `httpOnly`, `secure`-in-production `iron-session` cookie with an
  8-hour expiry; rotating `SESSION_SECRET` logs every admin out.
- First-run-only passcode setup — there's no default/backdoor admin passcode.
- Per-IP rate limiting on access-code redemption and admin login.
- Bulk import enforces a real byte cap on the request stream (not just `Content-Length`), a max
  row count, and max per-cell text length, to keep imports bounded regardless of what a client
  claims about the payload.

## Tech stack

Next.js 14 (App Router) · React 18 · SQLite via `better-sqlite3` (WAL mode) · `iron-session` for
auth · `bcryptjs` for passcode hashing · SheetJS (`xlsx`) for spreadsheet import parsing · Docker
multi-stage build (`output: standalone`) for deployment.

## Local development

```bash
npm install
cp .env.example .env.local
# edit .env.local and set SESSION_SECRET (openssl rand -base64 32)
npm run dev
```

Open http://localhost:3000 for the officer flow, http://localhost:3000/admin for the admin
dashboard. The first admin visit prompts you to set a passcode (hashed with bcrypt and stored in
SQLite — there's no default/backdoor passcode).

The SQLite file is created at `./data/app.db` (configurable via `DATA_DIR`).

## Deploying to Coolify (Hetzner)

This repo ships a multi-stage `Dockerfile` (Next.js `output: standalone`), so Coolify's
**Dockerfile** build pack is all you need — no Nixpacks, no separate database service.

1. **Push this repo** to a git host Coolify can reach (GitHub/GitLab/Gitea, or your own Coolify
   git instance).
2. In Coolify: **New Resource → Application**, pick the repo/branch, and set the build pack to
   **Dockerfile**.
3. **Set environment variables** on the resource:
   - `SESSION_SECRET` — required, random string ≥32 chars. Generate with
     `openssl rand -base64 32`. Rotating this logs every admin out.
   - `DATA_DIR` — leave as `/app/data` (matches the volume mount below).
   - Coolify sets `PORT` automatically; the Dockerfile also defaults it to `3000`.
4. **Add a persistent volume**: mount path `/app/data`. This is where `app.db` (officers,
   questions, settings, admin passcode hash) lives — without this volume, a redeploy wipes all
   data.
5. Set the **FQDN/domain** for the app in Coolify. Coolify's Traefik layer handles HTTPS
   (Let's Encrypt) automatically once the domain's DNS points at your Hetzner server.
6. Deploy. Coolify will build the image from the `Dockerfile`, run it, and use the container's
   built-in `HEALTHCHECK` (`GET /api/health`) to know when it's ready.
7. Visit `https://<your-domain>/admin` once and set the admin passcode — this only works the
   first time (before a passcode exists); after that it requires the passcode to log in, not to
   set a new one.

### Notes

- **Single container, no external DB.** SQLite (WAL mode) is plenty for a team taking a
  quarterly/periodic test; there's no concurrent-write bottleneck at this scale. If you ever need
  multiple app replicas, swap SQLite for Coolify-managed Postgres — the SQLite bit is fully
  isolated in `lib/db.js`.
- **Backups.** Since all state lives in one SQLite file on the volume, back it up by copying
  `/app/data/app.db` off the volume periodically (Coolify supports scheduled backups on volumes,
  or run a cron/rsync from the host).
- **Admin session.** The admin cookie is an encrypted `iron-session` cookie (`SESSION_SECRET`),
  `httpOnly`, `secure` in production, 8-hour expiry. There's no separate session store, so it
  survives container restarts as long as `SESSION_SECRET` doesn't change.
- **Rate limiting** on `/api/officer/redeem` and `/api/admin/login` is in-memory and per-instance
  — fine for a single container, but resets on redeploy/restart.
