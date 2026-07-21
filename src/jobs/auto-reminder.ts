import { createAdminClient } from "../lib/supabase.js";
import { sendMessage } from "../lib/telegram.js";
import { todayInTz } from "../lib/tz.js";

// Automatic group nudge ~2h before training (on the training day): if
// confirmations are below the threshold, post who hasn't answered yet.
// No-ops when there's no scheduled session today or enough people confirmed.
export async function autoReminder(
  threshold: number,
): Promise<{ ok: boolean; detail?: string }> {
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!groupChatId) return { ok: false, detail: "config" };

  const supabase = createAdminClient();
  const { data: sess } = await supabase
    .from("training_sessions")
    .select("id, starts_at, status")
    .eq("session_date", todayInTz())
    .maybeSingle();
  if (!sess || sess.status !== "scheduled") {
    return { ok: true, detail: "no session today" };
  }

  const [{ data: att }, { data: act }] = await Promise.all([
    supabase
      .from("attendance")
      .select("member_id, response")
      .eq("session_id", sess.id),
    supabase.from("members").select("id, full_name").eq("status", "active"),
  ]);
  const rows = att ?? [];
  const yes = rows.filter((a) => a.response === "yes").length;
  if (yes >= threshold) return { ok: true, detail: `enough (${yes})` };

  const voted = new Set(rows.map((a) => a.member_id));
  const missing = (act ?? []).filter((m) => !voted.has(m.id));
  const start = String(sess.starts_at ?? "").slice(0, 5);
  const names = missing.map((m) => m.full_name).join(", ");
  const tail = missing.length
    ? ` Încă n-au răspuns: ${names}.`
    : "";

  const r = await sendMessage(
    groupChatId,
    `⏰ Antrenamentul e azi la ${start} — doar ${yes} confirmați până acum.${tail} Apăsați ✅/❌ pe sondaj!`,
  );
  if (!r.ok) return { ok: false, detail: r.description ?? "telegram" };
  console.log(`[auto-reminder] sent (yes=${yes}, missing=${missing.length})`);
  return { ok: true, detail: `sent (${yes}/${threshold})` };
}
