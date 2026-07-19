// Registers the Telegram webhook so updates are delivered to this Railway
// worker. Run ONCE after the service is deployed (and again if the public URL or
// the webhook secret changes).
//
//   npm run set-webhook
//
// Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_URL from the env
// (a local .env works via dotenv). See the README for the full checklist.

import "dotenv/config";

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const publicUrl = process.env.PUBLIC_URL;

  if (!token || !secret || !publicUrl) {
    console.error(
      "Missing env. Required: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, PUBLIC_URL",
    );
    process.exit(1);
  }

  const webhookUrl = `${publicUrl.replace(/\/$/, "")}/telegram/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
    }),
  });

  const body = (await res.json()) as { ok: boolean; description?: string };
  if (!body.ok) {
    console.error("setWebhook failed:", body.description ?? res.statusText);
    process.exit(1);
  }

  console.log(`✅ Webhook set to ${webhookUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
