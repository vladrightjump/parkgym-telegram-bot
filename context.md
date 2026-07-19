# parkgym.fit Telegram bot — deployment handoff / context

Handoff notes so this can be continued from the Claude app (or any new session).
Last updated: 2026-07-19. **STATUS: DEPLOYED & LIVE on Railway** (validated end-to-end).

---

## What this project is

Standalone **Telegram attendance bot** for the parkgym.fit gym, built to run as an
always-on **Railway worker**. Extracted from the `gym-app` Next.js project.

What it does, automatically:
- Posts a "coming to training tomorrow?" poll into the gym's Telegram group
  (**Mon & Wed 20:00**, `Europe/Chisinau`).
- Records each ✅ Vin / ❌ Nu vin tap into Supabase (re-voting allowed; flags a
  member's first-ever `yes` as their first training).
- DMs the admins the morning roster (**Tue & Thu 06:00**).
- Parks unknown Telegram accounts in `telegram_unmatched` for an admin to link.

Architecture:
```
Railway (compute)                         Supabase (shared data)
  ├─ POST /telegram/webhook ◀─Telegram─▶  members / attendance /
  ├─ cron send-poll (Mon,Wed 20:00)       training_sessions / telegram_unmatched
  └─ cron morning-summary (Tue,Thu 06:00)          ▲
                                    gym-app web ────┘  (/admin/prezente UI)
```

---

## Current status — LIVE

Deployed on Railway 2026-07-19 and validated end-to-end (poll posted → button tap →
webhook → attendance written to Supabase with the first-training flag).

Deployment facts:
- **Railway project:** `parkgym-telegram-bot` (id `ff769e8b-d09a-4e06-a3e4-415494f2d67f`)
- **Service:** `bot` (id `82538ece-1007-4845-a495-7524d09b5981`), env `production`
- **Public domain:** `https://bot-production-8909.up.railway.app` (`/health` returns ok)
- **Source:** deploys from GitHub `vladrightjump/parkgym-telegram-bot`, branch `main`
- **Supabase project:** `ironworks-gym` (ref `whyndrjcezmtajbykeil`) — the shared DB.
  All 4 tables present with the right constraints (`training_sessions.session_date`
  UNIQUE, `members.telegram_user_id` UNIQUE, `attendance(session_id,member_id)` UNIQUE).
- **Env vars set on the service:** TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_GROUP_CHAT_ID, TELEGRAM_ADMIN_CHAT_IDS, SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, TZ, **NIXPACKS_NODE_VERSION=22**.
- **Webhook:** registered with Telegram → `<domain>/telegram/webhook` (secret-token verified).

Two bugs found & fixed during deploy:
1. **Railway couldn't read the repo** (private + GitHub App not authorized) → repo was
   made public. To go private again, install/authorize the Railway GitHub App on the repo.
2. **Node 20 crashed `@supabase/supabase-js`** ("native WebSocket not found") — every
   Supabase call threw. Fixed by forcing **Node 22** (`NIXPACKS_NODE_VERSION=22` env var,
   plus `engines.node >=22` added to `package.json` so it's permanent in code).

Currently bound to a **TEST group** (`-5517583047`), not the real gym group — see below.

---

## Architecture decisions made (context from the discussion)

**Q: Do we need Supabase, or make our own DB on Railway for cleaner architecture?**
Decision: **keep the shared Supabase DB.** The bot is only *one* of two apps that
use these tables — the `gym-app` web app's `/admin/prezente` backoffice reads/writes
the same data. A separate Railway DB would fork the data and blind the website. The
bot is a stateless worker; Railway = compute, Supabase = the shared data layer both
apps talk to. This is the clean split, not a mess.

**Q: What about building the whole stack on Railway (bot + web + Postgres)?**
Possible, but the cost is in migrating `gym-app`, not Railway. Supabase ≠ just a DB:
`@supabase/supabase-js` talks to Supabase's PostgREST API, so dropping it means
rewriting every query in **both** repos, plus replacing Supabase Auth **if** the web
app uses it (the big unknown). Deferred — revisit as a separate project. Deploy the
bot on shared Supabase now.

**Q: Building a UI to deploy/manage the bot?**
- Deploy/logs/env/restart UI → **don't build it**, Railway's dashboard already is it.
- Operational control UI (a "Send poll now" button, edit schedule, live status) →
  **worth building**, as an extension of the existing `gym-app` `/admin/prezente`
  page calling a small bot admin API. Deferred until after the bot is live; needs
  the `gym-app` repo.

**How the bot is managed once live:**
1. Day-to-day gym stuff → the **gym website** `/admin/prezente` (link accounts, view
   attendance). Bot otherwise runs itself.
2. Running/logs/settings → **Railway dashboard** (or ask Claude to do it via the MCP).
3. Bot identity (name/pic) → **@BotFather**, rarely.

---

## 🔐 Security follow-ups (recommended)

- **Rotate the two secrets that were shared in plaintext chat during setup:**
  - **Telegram bot token** — @BotFather → the bot → *API Token* → **Revoke current token**,
    then update `TELEGRAM_BOT_TOKEN` on Railway and re-register the webhook.
  - **Supabase secret key** (`sb_secret_…`) — Supabase → Project Settings → API →
    Secret keys → create a new one / roll it, update `SUPABASE_SERVICE_ROLE_KEY` on Railway.
    ⚠️ **First confirm whether `gym-app` uses the same key** — if it does, rotate in both
    places together, or give the bot its own dedicated secret key so gym-app is untouched.
- **Repo visibility:** the repo is currently **public** (was flipped to unblock Railway).
  It contains no secrets (`.env` is git-ignored), but for hygiene make it private again and
  install the Railway GitHub App on it so redeploys keep working.
- Webhook secret and RLS are fine as-is (strong random secret; service-role stays server-side).

## Remaining steps (bot already runs; these are for the real gym rollout)

Original go-live values (kept for reference — all already set on Railway):

| Variable | Where to get it |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/mybots` → bot → API Token (`123456:ABC-…`). No bot yet → `/newbot`. |
| `TELEGRAM_GROUP_CHAT_ID` | Gym group chat id (negative, `-100…`). Get via @getidsbot in the group. |
| `TELEGRAM_ADMIN_CHAT_IDS` | Vlad's chat id (+ other admins), comma-separated. Get via @userinfobot. |
| `SUPABASE_URL` | `https://<ref>.supabase.co` (Supabase → Project Settings → API). Claude can pull this via MCP. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** key (secret — bypasses RLS, never expose). |

Auto-handled (no need to provide):
- `TELEGRAM_WEBHOOK_SECRET` — Claude generates a random one.
- `PUBLIC_URL` — the Railway domain, known after the service is created.
- `TZ=Europe/Chisinau`, `PORT` — Railway injects / set at deploy.

### Two manual Telegram steps (only Vlad can do; can be done in parallel)
1. **Add the bot to the gym group.**
2. **@BotFather → bot → Bot Settings → Group Privacy → Turn OFF** (so it can read
   callback taps and post).

---

## Deploy plan Claude will run once the values are in

1. Create Railway project + service from this repo (Nixpacks; build/start from
   `railway.json`).
2. Set all env vars (the 5 above + generated `TELEGRAM_WEBHOOK_SECRET` + `TZ`).
3. Deploy; note the generated public domain → set `PUBLIC_URL`.
4. Register the Telegram webhook once: `npm run set-webhook`
   (points Telegram at `<PUBLIC_URL>/telegram/webhook`; this auto-replaces any old
   Vercel webhook — a bot has only one).
5. Verify: `GET /health`, check Railway logs, confirm the shared Supabase tables
   exist (`members`, `training_sessions`, `attendance`, `telegram_unmatched`).

### Decommission old path in gym-app (avoid double-runs)
- Remove the two cron entries from `gym-app/vercel.json` `crons`.
- Old Vercel webhook is replaced automatically once `set-webhook` runs.

---

## Handy references
- Env template: `.env.example`
- Full checklist / schema notes: `README.md`
- Webhook registration script: `scripts/set-webhook.ts`
- Cron times / server: `src/index.ts`
