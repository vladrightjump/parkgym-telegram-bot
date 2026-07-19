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
