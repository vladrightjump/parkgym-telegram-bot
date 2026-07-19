# parkgym.fit — Telegram attendance bot (Railway worker)

Standalone Telegram bot for the **parkgym.fit** gym, extracted from the
`gym-app` Next.js project to run as an always-on **Railway** worker.

It posts a "coming to training tomorrow?" poll into the gym's Telegram group,
records each tap into Supabase, and DMs the admins a morning roster — all
against the **same Supabase database** the web app uses (service-role key).

```
Railway (this worker)                         Supabase (shared DB)
  ├─ POST /telegram/webhook  ◀── Telegram ──▶  members / attendance /
  ├─ cron: send-poll (Mon,Wed) ──▶ group      training_sessions /
  └─ cron: morning-summary (Tue,Thu) ─▶ admins telegram_unmatched
                                                      ▲
                                        gym-app web ──┘  (/admin/prezente UI)
```

## Why Railway instead of the Vercel build-in

The logic is identical to what shipped inside `gym-app` (webhook + two cron
routes). The move to Railway swaps **Vercel Hobby cron** — which fires only
*somewhere within* its scheduled hour and needs manual DST offset juggling — for
**in-process `node-cron`** anchored to `Europe/Chisinau`, so the poll and the
summary fire at precise local times year-round.

---

## What has been done

Everything below is implemented and committed in this repo:

- **`src/webhook.ts`** — the Telegram update handler, copied verbatim from
  `gym-app/app/api/telegram/webhook/route.ts`:
  - `✅ Vin` / `❌ Nu vin` inline-button taps → upsert into `attendance`
    (re-voting allowed), flagging a member's first-ever `yes` as first training.
  - Unknown Telegram accounts → parked in `telegram_unmatched` for an admin.
  - `/start` in a private chat from a known member → sets `bot_dm_enabled` and
    replies with a welcome DM.
  - Secret-token header (`X-Telegram-Bot-Api-Secret-Token`) verified before
    processing; always answers `200` otherwise (no Telegram retry loops).
- **`src/jobs/send-poll.ts`** — idempotently creates tomorrow's
  `training_sessions` row and posts the attendance poll to the group.
- **`src/jobs/morning-summary.ts`** — DMs each admin today's roster
  (coming / declined / no-response; 🆓 marks a first training).
- **`src/index.ts`** — Express server exposing `POST /telegram/webhook` +
  `GET /health`, and the `node-cron` scheduler (times below).
- **`src/lib/`** — `telegram.ts` (Bot API fetch helper), `supabase.ts`
  (service-role client, now reads `SUPABASE_URL`), `tz.ts`, `format.ts` —
  all copied from `gym-app`.
- **`scripts/set-webhook.ts`** — one-time webhook registration against the
  Railway public URL.
- **`railway.json`** — Nixpacks build (`npm run build`) + start (`npm start`).

**Cron schedule** (local `Europe/Chisinau` time, DST-proof):

| Job              | Cron           | When              |
| ---------------- | -------------- | ----------------- |
| send-poll        | `0 20 * * 1,3` | 20:00 Mon & Wed   |
| morning-summary  | `0 6 * * 2,4`  | 06:00 Tue & Thu   |

> These mirror the local times the Vercel crons targeted. Adjust the hours in
> `src/index.ts` if the desired training days/times change.

---

## What is needed for the integration (to go live)

1. **Deploy to Railway.** New service from this repo (root = repo root). Nixpacks
   auto-detects Node; build/start come from `railway.json`. Note the generated
   public domain (e.g. `https://parkgym-telegram-bot-production.up.railway.app`).

2. **Set Railway environment variables** (see `.env.example`):

   | Variable                    | Notes                                        |
   | --------------------------- | -------------------------------------------- |
   | `TELEGRAM_BOT_TOKEN`        | from @BotFather                              |
   | `TELEGRAM_WEBHOOK_SECRET`   | random string; must match the webhook secret |
   | `TELEGRAM_GROUP_CHAT_ID`    | group chat id (negative, `-100…`)            |
   | `TELEGRAM_ADMIN_CHAT_IDS`   | comma-separated admin chat ids               |
   | `SUPABASE_URL`              | `https://<ref>.supabase.co`                  |
   | `SUPABASE_SERVICE_ROLE_KEY` | service-role key — never expose to a browser |
   | `TZ`                        | `Europe/Chisinau`                            |
   | `PUBLIC_URL`                | the Railway domain (for `set-webhook`)       |

3. **Register the webhook once** (locally with `.env` filled, or via Railway
   shell):
   ```bash
   npm run set-webhook
   ```
   Re-run only if `PUBLIC_URL` or `TELEGRAM_WEBHOOK_SECRET` changes.

4. **BotFather:** add the bot to the group and **disable group privacy** so it
   can post and receive callback taps.

5. **Decommission the old path in `gym-app`** (avoid running both at once):
   - Remove the two entries from `gym-app/vercel.json` `crons`.
   - The old Vercel webhook is replaced automatically the moment
     `set-webhook` points Telegram at the Railway URL (a bot has one webhook).
   - The `gym-app` route/cron files can stay as dead code or be deleted — this
     repo does not touch `gym-app`.

### Shared Supabase schema the bot relies on

The bot reads/writes these (owned by the `gym-app` Supabase project — this repo
adds no migrations). Confirm they exist:

- **`members`** — `id`, `full_name`, `status`, `telegram_user_id`,
  `telegram_username`, `bot_dm_enabled`.
- **`training_sessions`** — `id`, `session_date`, `starts_at`, `location`,
  `status`, `poll_message_id`.
- **`attendance`** — `id`, `session_id`, `member_id`, `response` (`yes`/`no`),
  `is_first_training`, `responded_at`; unique on `(session_id, member_id)`.
- **`telegram_unmatched`** — `telegram_user_id` (unique), `username`,
  `first_name`, `last_name`.

The `/admin/prezente` backoffice (linking parked accounts to members, viewing
per-session responses) **stays in the `gym-app` web app** and keeps working — it
talks to the same tables.

---

## Local development

```bash
npm install
cp .env.example .env      # fill in the values
npm run dev               # tsx watch — webhook on :3000 + cron registered
```

To test the webhook locally, expose port 3000 (e.g. with a tunnel) and point
`PUBLIC_URL` at the tunnel URL before running `npm run set-webhook`.

## Deploy

```bash
npm run build   # tsc -> dist/
npm start       # node dist/index.js
```

Railway runs these automatically per `railway.json`.
