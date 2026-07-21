// Builds the group poll message text. The message is edited in place on every
// vote (editMessageText does NOT notify group members), so it acts as a live
// "who's coming" board without spamming notifications. Only people who
// answered are shown — non-responders are tracked in the dashboard, not here.

export function pollHeader(startTime: string, location: string): string {
  const t = (startTime || "06:30").slice(0, 5);
  return `🏃 Antrenament mâine, ${t}${location ? ", " + location : ""}. Vii?`;
}

export function buildPollText(
  header: string,
  yes: string[],
  no: string[],
): string {
  const lines = [header, ""];
  lines.push(`✅ Vin (${yes.length})${yes.length ? ": " + yes.join(", ") : ""}`);
  lines.push(`❌ Nu vin (${no.length})${no.length ? ": " + no.join(", ") : ""}`);
  return lines.join("\n");
}
