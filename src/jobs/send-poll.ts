import { createAdminClient } from "../lib/supabase.js";
import { sendMessage, type InlineKeyboard } from "../lib/telegram.js";
import { tomorrowInTz } from "../lib/tz.js";
import { buildPollText, pollHeader } from "../lib/poll-text.js";

const START_TIME = "06:30";
const LOCATION = "Parcul Dumitru Râșcanu";

// Creates (idempotently) tomorrow's training session and posts the attendance
// poll into the Telegram group. Safe to run more than once: if tomorrow's
// session already has a poll_message_id, nothing is sent.
export async function sendPoll(): Promise<{ ok: boolean; detail?: string }> {
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!groupChatId) {
    console.error("[send-poll] Missing TELEGRAM_GROUP_CHAT_ID");
    return { ok: false, detail: "config" };
  }

  const supabase = createAdminClient();
  const sessionDate = tomorrowInTz();

  const { data: existing, error: selErr } = await supabase
    .from("training_sessions")
    .select("id, poll_message_id")
    .eq("session_date", sessionDate)
    .maybeSingle();
  if (selErr) {
    console.error("[send-poll] select error:", selErr);
    return { ok: false, detail: "select" };
  }

  if (existing?.poll_message_id) {
    return { ok: true, detail: "already-sent" };
  }

  let sessionId = existing?.id as string | undefined;
  if (!sessionId) {
    const { data: inserted, error: insErr } = await supabase
      .from("training_sessions")
      .insert({
        session_date: sessionDate,
        starts_at: START_TIME,
        location: LOCATION,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      console.error("[send-poll] insert error:", insErr);
      return { ok: false, detail: "insert" };
    }
    sessionId = inserted.id as string;
  }

  const keyboard: InlineKeyboard = [
    [
      { text: "✅ Vin", callback_data: `att:yes:${sessionId}` },
      { text: "❌ Nu vin", callback_data: `att:no:${sessionId}` },
    ],
  ];

  // Initial message with a 0-tally board; edited live as people vote.
  const { count: activeCount } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const text = buildPollText(
    pollHeader(START_TIME, LOCATION),
    [],
    [],
    activeCount ?? 0,
  );

  const sent = await sendMessage(groupChatId, text, {
    reply_markup: { inline_keyboard: keyboard },
  });

  if (!sent.ok || !sent.result) {
    console.error("[send-poll] sendMessage failed:", sent.description);
    return { ok: false, detail: "telegram" };
  }

  const { error: updErr } = await supabase
    .from("training_sessions")
    .update({ poll_message_id: sent.result.message_id })
    .eq("id", sessionId);
  if (updErr) {
    console.error("[send-poll] poll_message_id update error:", updErr);
  }

  console.log(
    `[send-poll] posted poll for ${sessionDate} (session ${sessionId}, msg ${sent.result.message_id})`,
  );
  return { ok: true, detail: "sent" };
}
