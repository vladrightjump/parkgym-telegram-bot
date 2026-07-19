// Calendar-date helpers anchored to the gym's timezone. Cron jobs may fire in a
// different zone, but "today" / "tomorrow" for a training session must follow
// local (Chișinău) calendar days.

export const GYM_TZ = "Europe/Chisinau";

// A Date -> "YYYY-MM-DD" as seen in the given timezone.
export function ymdInTz(date: Date, tz: string = GYM_TZ): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayInTz(tz: string = GYM_TZ): string {
  return ymdInTz(new Date(), tz);
}

// The calendar day after today (in the given timezone), as "YYYY-MM-DD".
export function tomorrowInTz(tz: string = GYM_TZ): string {
  const [y, m, d] = todayInTz(tz).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

// Current local weekday (0=Sun … 6=Sat) and "HH:MM" in the given timezone.
// Used by the minute scheduler to compare against the configured schedule.
export function localWeekdayAndTime(
  tz: string = GYM_TZ,
): { weekday: number; hhmm: string } {
  const now = new Date();
  const weekday = new Date(ymdInTz(now, tz) + "T00:00:00Z").getUTCDay();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  let hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  if (hh === "24") hh = "00"; // some ICU builds render midnight as 24
  return { weekday, hhmm: `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}` };
}
