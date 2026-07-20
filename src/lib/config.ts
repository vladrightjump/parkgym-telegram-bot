import { createAdminClient } from "./supabase.js";

// Runtime bot configuration, stored as a single row (id=1) in Supabase and
// edited from the gym-app admin UI. Read fresh on every scheduler tick so
// changes take effect within a minute — no redeploy needed.
export interface BotConfig {
  enabled: boolean;
  pollDays: number[]; // 0=Sun … 6=Sat
  pollTime: string; // "HH:MM"
  summaryDays: number[];
  summaryTime: string; // "HH:MM"
  trainingTime: string; // "HH:MM" — shown in the poll
  location: string; // shown in the poll
}

// Mirrors the original hard-coded schedule; used if the row/DB is unavailable.
export const DEFAULT_CONFIG: BotConfig = {
  enabled: true,
  pollDays: [1, 3],
  pollTime: "20:00",
  summaryDays: [2, 4],
  summaryTime: "06:00",
  trainingTime: "06:30",
  location: "Parcul Dumitru Râșcanu",
};

export function normalizeTime(t: unknown): string | null {
  if (typeof t !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function normalizeDays(v: unknown, fallback: number[]): number[] {
  if (!Array.isArray(v)) return fallback;
  const days = v
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return days;
}

export async function getBotConfig(): Promise<BotConfig> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("bot_config")
      .select(
        "enabled, poll_days, poll_time, summary_days, summary_time, training_time, location",
      )
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return DEFAULT_CONFIG;
    return {
      enabled: data.enabled ?? true,
      pollDays: normalizeDays(data.poll_days, DEFAULT_CONFIG.pollDays),
      pollTime: normalizeTime(data.poll_time) ?? DEFAULT_CONFIG.pollTime,
      summaryDays: normalizeDays(data.summary_days, DEFAULT_CONFIG.summaryDays),
      summaryTime: normalizeTime(data.summary_time) ?? DEFAULT_CONFIG.summaryTime,
      trainingTime: normalizeTime(data.training_time) ?? DEFAULT_CONFIG.trainingTime,
      location:
        typeof data.location === "string" && data.location.trim()
          ? data.location
          : DEFAULT_CONFIG.location,
    };
  } catch (err) {
    console.error("[config] read failed, using defaults:", err);
    return DEFAULT_CONFIG;
  }
}
