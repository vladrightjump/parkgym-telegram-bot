import { test } from "node:test";
import assert from "node:assert/strict";

import { pollHeader, buildPollText } from "../src/lib/poll-text.js";

// ── pollHeader ───────────────────────────────────────────────────────────────
test("pollHeader: formats time (HH:MM) and location", () => {
  assert.equal(
    pollHeader("06:30", "Parcul Dumitru Râșcanu"),
    "🏃 Antrenament mâine, 06:30, Parcul Dumitru Râșcanu. Vii?",
  );
});

test("pollHeader: trims seconds off the time", () => {
  assert.equal(pollHeader("06:30:00", "Parc"), "🏃 Antrenament mâine, 06:30, Parc. Vii?");
});

test("pollHeader: omits location when empty; falls back on empty time", () => {
  assert.equal(pollHeader("08:00", ""), "🏃 Antrenament mâine, 08:00. Vii?");
  assert.equal(pollHeader("", "Parc"), "🏃 Antrenament mâine, 06:30, Parc. Vii?");
});

// ── buildPollText ────────────────────────────────────────────────────────────
test("buildPollText: lists names with counts, no non-responder line", () => {
  const out = buildPollText("H", ["Ana", "Vlad"], ["Ion"]);
  assert.equal(out, "H\n\n✅ Vin (2): Ana, Vlad\n❌ Nu vin (1): Ion");
  assert.ok(!out.includes("N-au răspuns"));
});

test("buildPollText: empty lists show only counts", () => {
  const out = buildPollText("H", [], []);
  assert.equal(out, "H\n\n✅ Vin (0)\n❌ Nu vin (0)");
});
