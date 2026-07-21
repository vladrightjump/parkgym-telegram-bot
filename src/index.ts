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
import { isDue, minusMinutes } from "./lib/schedule.js";
import { alertAdmins } from "./lib/notify.js";
import { autoReminder } from "./jobs/auto-reminder.js";
import { getWebhookInfo } from "./lib/telegram.js";

const PORT = Number(process.env.PORT ?? 3000);

// ── Webhook HTTP server ───────────────────────────────────────────────────────
// Telegram POSTs updates here. We verify the secret-token header. Successful /
// ignorable updates get 200; a TRANSIENT processing failure (e.g. DB write
// error) gets 500 so Telegram REDELIVERS the update — no vote is ever silently
// dropped. The attendance upsert is idempotent, so redelivery is safe.
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

  const ok = await handleUpdate(req.body as TgUpdate);
  if (!ok) return res.status(500).json({ ok: false }); // Telegram will retry
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

      // Auto-reminder ~2h before training on the training day, if confirmations
      // are still below the configured threshold.
      if (
        cfg.autoReminderEnabled &&
        hhmm === minusMinutes(cfg.trainingTime, 120) &&
        !firedThisMinute.has("autorem")
      ) {
        firedThisMinute.add("autorem");
        void autoReminder(cfg.reminderThreshold).catch((err) =>
          console.error("[cron/auto-reminder]", err),
        );
      }

      // Weekly webhook self-check — Monday 09:05. Alerts only on problems.
      if (
        weekday === 1 &&
        hhmm === "09:05" &&
        !firedThisMinute.has("webhookcheck")
      ) {
        firedThisMinute.add("webhookcheck");
        void (async () => {
          const info = await getWebhookInfo();
          const i = info.result;
          if (!info.ok || !i) {
            return alertAdmins("⚠️ Verificare webhook: nu am putut citi starea de la Telegram.");
          }
          const expected =
            (process.env.PUBLIC_URL ?? "").replace(/\/$/, "") + "/telegram/webhook";
          const probs: string[] = [];
          if (process.env.PUBLIC_URL && i.url !== expected) {
            probs.push(`URL greșit (${i.url || "gol"})`);
          }
          if ((i.pending_update_count ?? 0) > 20) {
            probs.push(`${i.pending_update_count} update-uri în așteptare`);
          }
          if (
            i.last_error_message &&
            i.last_error_date &&
            Date.now() / 1000 - i.last_error_date < 3 * 86400
          ) {
            probs.push(`eroare recentă: ${i.last_error_message}`);
          }
          if (probs.length) {
            await alertAdmins(`⚠️ Webhook Telegram: ${probs.join("; ")}`);
          } else {
            console.log("[webhook-check] OK");
          }
        })().catch((err) => console.error("[cron/webhook-check]", err));
      }
    } catch (err) {
      console.error("[cron/tick]", err);
    }
  },
  { timezone: GYM_TZ },
);

console.log(`[cron] DB-driven scheduler running (tz=${GYM_TZ}, tick=1m)`);
