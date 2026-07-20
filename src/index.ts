import "dotenv/config";
import express from "express";
import cron from "node-cron";
import { handleUpdate, type TgUpdate } from "./webhook.js";
import { sendPoll } from "./jobs/send-poll.js";
import { morningSummary } from "./jobs/morning-summary.js";
import { processCommands } from "./jobs/process-commands.js";
import { inactivityAlert } from "./jobs/inactivity-alert.js";
import { GYM_TZ, localWeekdayAndTime } from "./lib/tz.js";
import { getBotConfig } from "./lib/config.js";
import { isDue } from "./lib/schedule.js";
import { alertAdmins } from "./lib/notify.js";

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

// ── Scheduled jobs — DB-driven (config editable from the gym-app admin UI) ────
// A single tick fires every minute (in GYM_TZ). Each tick reads the live
// bot_config row and, if the master switch is on and the current local
// weekday+time matches the configured poll/summary schedule, runs the job.
// Schedule changes therefore take effect within a minute, no redeploy needed.
//
//   send-poll        — posts tomorrow's attendance poll (idempotent)
//   morning-summary  — DMs admins today's roster
const firedThisMinute = new Set<string>();
let lastMinute = "";

cron.schedule(
  "* * * * *",
  async () => {
    try {
      // Always drain the command queue (kick, etc.), even if scheduling is off.
      await processCommands().catch((err) => console.error("[commands]", err));

      const cfg = await getBotConfig();
      if (!cfg.enabled) return;

      const { weekday, hhmm } = localWeekdayAndTime(GYM_TZ);
      if (hhmm !== lastMinute) {
        firedThisMinute.clear();
        lastMinute = hhmm;
      }

      if (
        isDue(cfg.pollDays, cfg.pollTime, weekday, hhmm) &&
        !firedThisMinute.has("poll")
      ) {
        firedThisMinute.add("poll");
        void sendPoll()
          .then((r) => {
            if (!r.ok)
              void alertAdmins(`⚠️ Sondajul automat n-a plecat — ${r.detail ?? "?"}`);
          })
          .catch((err) => {
            console.error("[cron/send-poll]", err);
            void alertAdmins(`⚠️ Eroare la trimiterea sondajului: ${err}`);
          });
      }

      if (
        isDue(cfg.summaryDays, cfg.summaryTime, weekday, hhmm) &&
        !firedThisMinute.has("summary")
      ) {
        firedThisMinute.add("summary");
        void morningSummary()
          .then((r) => {
            if (!r.ok)
              void alertAdmins(`⚠️ Raportul de dimineață n-a plecat — ${r.detail ?? "?"}`);
          })
          .catch((err) => {
            console.error("[cron/morning-summary]", err);
            void alertAdmins(`⚠️ Eroare la raportul de dimineață: ${err}`);
          });
      }

      // Weekly digest of inactive / never-attended members — Monday 09:00 local.
      if (
        weekday === 1 &&
        hhmm === "09:00" &&
        !firedThisMinute.has("inactivity")
      ) {
        firedThisMinute.add("inactivity");
        void inactivityAlert().catch((err) =>
          console.error("[cron/inactivity-alert]", err),
        );
      }
    } catch (err) {
      console.error("[cron/tick]", err);
    }
  },
  { timezone: GYM_TZ },
);

console.log(`[cron] DB-driven scheduler running (tz=${GYM_TZ}, tick=1m)`);
