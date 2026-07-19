import { createAdminClient } from "../lib/supabase.js";
import { sendMessage } from "../lib/telegram.js";
import { todayInTz } from "../lib/tz.js";
import { fmtDate } from "../lib/format.js";

interface AttendanceRow {
  member_id: string;
  response: "yes" | "no";
  is_first_training: boolean;
  member: { full_name: string } | null;
}

// DMs each admin a summary of today's session: who's coming (🆓 = first
// training), who declined, and which active members haven't answered.
export async function morningSummary(): Promise<{ ok: boolean; detail?: string }> {
  const adminIds = (process.env.TELEGRAM_ADMIN_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminIds.length === 0) {
    console.error("[morning-summary] Missing TELEGRAM_ADMIN_CHAT_IDS");
    return { ok: false, detail: "config" };
  }

  const supabase = createAdminClient();
  const today = todayInTz();

  const { data: session } = await supabase
    .from("training_sessions")
    .select("id, session_date, starts_at, location")
    .eq("session_date", today)
    .maybeSingle();

  let message: string;

  if (!session) {
    message = `📋 ${fmtDate(today)} — niciun antrenament programat azi.`;
  } else {
    const [{ data: attData }, { data: activeData }] = await Promise.all([
      supabase
        .from("attendance")
        .select("member_id, response, is_first_training, member:members(full_name)")
        .eq("session_id", session.id),
      supabase.from("members").select("id, full_name").eq("status", "active"),
    ]);

    const attendance = (attData ?? []) as unknown as AttendanceRow[];
    const activeMembers = (activeData ?? []) as { id: string; full_name: string }[];

    const yes = attendance.filter((a) => a.response === "yes");
    const no = attendance.filter((a) => a.response === "no");
    const respondedIds = new Set(attendance.map((a) => a.member_id));
    const noResponse = activeMembers.filter((m) => !respondedIds.has(m.id));

    const nameOf = (a: AttendanceRow) => a.member?.full_name ?? "necunoscut";

    const lines: string[] = [];
    const startTime = (session.starts_at as string).slice(0, 5);
    lines.push(`📋 Prezențe — ${fmtDate(today)} (${startTime}, ${session.location})`);
    lines.push("");

    lines.push(`✅ Vin (${yes.length}):`);
    if (yes.length) {
      for (const a of yes) {
        lines.push(`• ${nameOf(a)}${a.is_first_training ? " 🆓" : ""}`);
      }
    } else {
      lines.push("• —");
    }
    lines.push("");

    lines.push(`❌ Nu vin (${no.length}):`);
    if (no.length) {
      for (const a of no) lines.push(`• ${nameOf(a)}`);
    } else {
      lines.push("• —");
    }
    lines.push("");

    lines.push(`❔ Fără răspuns (${noResponse.length}):`);
    if (noResponse.length) {
      for (const m of noResponse) lines.push(`• ${m.full_name}`);
    } else {
      lines.push("• —");
    }

    message = lines.join("\n");
  }

  const results = await Promise.all(
    adminIds.map((chatId) => sendMessage(chatId, message)),
  );
  const failed = results.filter((r) => !r.ok).length;
  if (failed) console.error(`[morning-summary] ${failed} DM(s) failed`);

  console.log(
    `[morning-summary] sent ${adminIds.length - failed}/${adminIds.length} DM(s) for ${today}`,
  );
  return { ok: true, detail: `sent ${adminIds.length - failed}/${adminIds.length}` };
}
