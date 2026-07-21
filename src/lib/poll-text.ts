// Builds the group poll message (Telegram HTML parse mode). The message is
// edited in place on every vote (editMessageText does NOT notify members), so
// it acts as a friendly live "who's coming" board. Only people who answered
// are shown — non-responders live in the dashboard, not in the group.

const RO_DOW = [
  "Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă",
];
const RO_MON = [
  "ian", "feb", "mar", "apr", "mai", "iun",
  "iul", "aug", "sep", "oct", "noi", "dec",
];

// Escape user-provided text for Telegram HTML mode.
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "🏃 <b>Antrenament mâine — Miercuri, 22 iul</b>\n🕕 06:30 · 📍 Parcul …"
export function pollHeader(
  dateIso: string,
  startTime: string,
  location: string,
): string {
  const t = (startTime || "06:30").slice(0, 5);
  let when = "";
  if (/^\d{4}-\d{2}-\d{2}/.test(dateIso)) {
    const [y, m, d] = dateIso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    when = ` — ${RO_DOW[dt.getUTCDay()]}, ${d} ${RO_MON[m - 1]}`;
  }
  const loc = location ? ` · 📍 ${esc(location)}` : "";
  return `🏃 <b>Antrenament mâine${when}</b>\n🕕 ${t}${loc}`;
}

export function buildPollText(
  header: string,
  yes: string[],
  no: string[],
): string {
  const bullet = (names: string[]) => names.map((n) => `• ${esc(n)}`);
  const lines = [header, ""];
  if (yes.length === 0 && no.length === 0) {
    lines.push("Cine vine? Apasă mai jos 👇");
  } else {
    if (yes.length) {
      lines.push(`✅ <b>Vin (${yes.length})</b>`, ...bullet(yes));
    }
    if (no.length) {
      if (yes.length) lines.push("");
      lines.push(`❌ <b>Nu pot (${no.length})</b>`, ...bullet(no));
    }
  }
  return lines.join("\n");
}
