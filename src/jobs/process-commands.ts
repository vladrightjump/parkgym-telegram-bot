import { createAdminClient } from "../lib/supabase.js";
import { banChatMember, sendMessage, unbanChatMember } from "../lib/telegram.js";
import { tomorrowInTz } from "../lib/tz.js";
import { alertAdmins } from "../lib/notify.js";
import { sendPoll } from "./send-poll.js";
import { morningSummary } from "./morning-summary.js";

interface ActionRow {
  id: string;
  action: string;
  telegram_user_id: number | null;
}

// Drains pending rows from bot_actions and executes them. Called every tick.
//   kick_member — removes a user from the group (bot must be group admin)
//   send_poll   — posts a fresh poll to the group immediately ("send now")
// Failures are recorded in the row AND DM'd to the admins.
export async function processCommands(): Promise<void> {
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!groupChatId) return;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bot_actions")
    .select("id, action, telegram_user_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);
  if (error || !data || data.length === 0) return;

  for (const cmd of data as ActionRow[]) {
    let ok = false;
    let result = "";

    if (cmd.action === "kick_member" && cmd.telegram_user_id) {
      const ban = await banChatMember(groupChatId, cmd.telegram_user_id);
      if (ban.ok) {
        await unbanChatMember(groupChatId, cmd.telegram_user_id); // kick, not permaban
        ok = true;
        result = "kicked";
      } else {
        result = ban.description ?? "ban failed";
      }
    } else if (cmd.action === "send_reminder") {
      // Gentle group nudge listing active members who haven't voted yet on
      // tomorrow's session.
      const { data: sess } = await supabase
        .from("training_sessions")
        .select("id")
        .eq("session_date", tomorrowInTz())
        .maybeSingle();
      if (!sess) {
        result = "no session for tomorrow";
      } else {
        const [{ data: att }, { data: act }] = await Promise.all([
          supabase.from("attendance").select("member_id").eq("session_id", sess.id),
          supabase.from("members").select("id, full_name").eq("status", "active"),
        ]);
        const voted = new Set((att ?? []).map((a) => a.member_id));
        const missing = (act ?? []).filter((m) => !voted.has(m.id));
        if (missing.length === 0) {
          result = "everyone voted";
          ok = true;
        } else {
          const names = missing.map((m) => m.full_name).join(", ");
          const r = await sendMessage(
            groupChatId,
            `👋 Reamintire — încă n-au răspuns la sondaj (${missing.length}): ${names}. Apăsați ✅/❌ pe sondajul de mai sus!`,
          );
          ok = r.ok;
          result = r.ok ? `reminded ${missing.length}` : (r.description ?? "send failed");
        }
      }
    } else if (cmd.action === "send_summary") {
      const r = await morningSummary();
      ok = r.ok;
      result = r.ok ? "summary sent" : `failed: ${r.detail ?? "?"}`;
    } else if (cmd.action === "send_poll") {
      // Force a fresh poll: clear tomorrow's poll_message_id so it re-posts.
      await supabase
        .from("training_sessions")
        .update({ poll_message_id: null })
        .eq("session_date", tomorrowInTz());
      const r = await sendPoll();
      ok = r.ok;
      result = r.ok ? "poll sent" : `failed: ${r.detail ?? "?"}`;
    } else {
      result = "unsupported or missing data";
    }

    await supabase
      .from("bot_actions")
      .update({
        status: ok ? "done" : "failed",
        result,
        processed_at: new Date().toISOString(),
      })
      .eq("id", cmd.id);

    console.log(`[commands] ${cmd.action} #${cmd.id} → ${ok ? "done" : "failed"} (${result})`);
    if (!ok) {
      await alertAdmins(`⚠️ Acțiune eșuată: ${cmd.action} — ${result}`);
    }
  }
}
