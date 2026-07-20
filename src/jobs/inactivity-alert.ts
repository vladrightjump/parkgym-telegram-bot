import { createAdminClient } from "../lib/supabase.js";
import { sendMessage } from "../lib/telegram.js";
import { todayInTz } from "../lib/tz.js";
import { fmtDate } from "../lib/format.js";

interface StatRow {
  full_name: string;
  status: string;
  yes_count: number;
  last_attended: string | null;
}

function daysBetween(fromIso: string, toIso: string): number {
  const [ay, am, ad] = fromIso.split("-").map(Number);
  const [by, bm, bd] = toIso.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000,
  );
}

// DMs the admins a digest of active members who haven't confirmed a training in
// 2+ weeks, plus those who never have. Meant to run weekly. No-ops if everyone
// is active (no spam) or if config is missing.
export async function inactivityAlert(): Promise<{ ok: boolean; detail?: string }> {
  const adminIds = (process.env.TELEGRAM_ADMIN_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminIds.length === 0) return { ok: false, detail: "config" };

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("member_attendance_stats")
    .select("full_name, status, yes_count, last_attended")
    .eq("status", "active");
  const rows = (data ?? []) as StatRow[];

  const today = todayInTz();
  const inactive = rows
    .filter((r) => r.yes_count > 0 && r.last_attended)
    .map((r) => ({ ...r, days: daysBetween(r.last_attended as string, today) }))
    .filter((r) => r.days >= 14)
    .sort((a, b) => b.days - a.days);
  const never = rows.filter((r) => r.yes_count === 0);

  if (inactive.length === 0 && never.length === 0) {
    return { ok: true, detail: "nothing to report" };
  }

  const lines: string[] = ["📉 Membri de verificat"];
  lines.push("");
  lines.push(`⏳ Inactivi de 2+ săptămâni (${inactive.length}):`);
  if (inactive.length) {
    for (const r of inactive) {
      lines.push(`• ${r.full_name} — ultima ${fmtDate(r.last_attended as string)} (${r.days} zile)`);
    }
  } else {
    lines.push("• —");
  }
  lines.push("");
  lines.push(`🚫 Nevenit niciodată (${never.length}):`);
  if (never.length) {
    for (const r of never) lines.push(`• ${r.full_name}`);
  } else {
    lines.push("• —");
  }

  const message = lines.join("\n");
  await Promise.all(adminIds.map((chatId) => sendMessage(chatId, message)));
  console.log(
    `[inactivity-alert] sent to ${adminIds.length} admin(s): ${inactive.length} inactive, ${never.length} never`,
  );
  return { ok: true, detail: `sent (${inactive.length}+${never.length})` };
}
