import { createAdminClient } from "../lib/supabase.js";
import { banChatMember, unbanChatMember } from "../lib/telegram.js";

interface ActionRow {
  id: string;
  action: string;
  telegram_user_id: number | null;
}

// Drains pending rows from bot_actions and executes them against Telegram.
// Called every scheduler tick. Kicks require the bot to be a group admin with
// ban permission; failures are recorded so the admin can see what happened.
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
        // Unban right away so it's a kick (removable + rejoinable), not a permaban.
        await unbanChatMember(groupChatId, cmd.telegram_user_id);
        ok = true;
        result = "kicked";
      } else {
        result = ban.description ?? "ban failed";
      }
    } else {
      result = "unsupported or missing telegram_user_id";
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
  }
}
