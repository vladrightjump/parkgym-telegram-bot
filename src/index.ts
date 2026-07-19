import "dotenv/config";
import express from "express";
import cron from "node-cron";
import { handleUpdate, type TgUpdate } from "./webhook.js";
import { sendPoll } from "./jobs/send-poll.js";
import { morningSummary } from "./jobs/morning-summary.js";
import { GYM_TZ } from "./lib/tz.js";

const PORT = Number(process.env.PORT ?? 3000);

// ── Webhook HTTP server ───────────────────────────────────────────────────────
// Telegram POSTs updates here. We verify the secret-token header, then answer
// 200 for everything (Telegram retries on any non-2xx). Only unauthenticated
// callers get 401.
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "parkgym-telegram-bot" });
});

app.post("/telegram/webhook", async (req, res) => {
  const secret = req.header("x-telegram-bot-api-secret-token");
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false });
  }

  await handleUpdate(req.body as TgUpdate);
  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[server] webhook listening on :${PORT}`);
});

// ── Scheduled jobs (replaces Vercel cron) ─────────────────────────────────────
// Times are LOCAL to the gym timezone and DST-proof — node-cron re-evaluates
// against GYM_TZ, so no seasonal offset juggling is needed.
//
//   send-poll        — 20:00, Mon & Wed  (posts tomorrow's attendance poll)
//   morning-summary  — 06:00, Tue & Thu  (DMs admins today's roster)
const cronOpts = { timezone: GYM_TZ } as const;

cron.schedule(
  "0 20 * * 1,3",
  () => {
    void sendPoll().catch((err) => console.error("[cron/send-poll]", err));
  },
  cronOpts,
);

cron.schedule(
  "0 6 * * 2,4",
  () => {
    void morningSummary().catch((err) =>
      console.error("[cron/morning-summary]", err),
    );
  },
  cronOpts,
);

console.log(`[cron] scheduled jobs registered (tz=${GYM_TZ})`);
