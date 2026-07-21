// Pure scheduling predicate, kept separate so it can be unit-tested without a
// timer or DB. Returns true when a job configured for `days` at `time` is due
// at the given local `weekday`/`hhmm`.
//   days    — allowed weekdays, 0=Sun … 6=Sat
//   time    — "HH:MM"
//   weekday — current local weekday (0=Sun … 6=Sat)
//   hhmm    — current local time "HH:MM"
// "HH:MM" minus N minutes, wrapping over midnight.
export function minusMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let t = h * 60 + m - mins;
  while (t < 0) t += 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function isDue(
  days: number[],
  time: string,
  weekday: number,
  hhmm: string,
): boolean {
  return Array.isArray(days) && days.includes(weekday) && hhmm === time;
}
