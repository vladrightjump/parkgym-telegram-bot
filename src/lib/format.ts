// Romanian date formatting — the subset used by the morning summary.

const RO_MONTHS_SHORT = [
  "ian",
  "feb",
  "mar",
  "apr",
  "mai",
  "iun",
  "iul",
  "aug",
  "sep",
  "oct",
  "noi",
  "dec",
];

// ISO "YYYY-MM-DD" -> "8 iul" (year appended only when not the current year).
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const thisYear = new Date().getFullYear();
  return `${d} ${RO_MONTHS_SHORT[m - 1]}${y !== thisYear ? " " + y : ""}`;
}
