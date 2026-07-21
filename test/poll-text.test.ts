import { test } from "node:test";
import assert from "node:assert/strict";

import { pollHeader, buildPollText, esc } from "../src/lib/poll-text.js";

// ── esc ──────────────────────────────────────────────────────────────────────
test("esc: escapes Telegram-HTML special chars", () => {
  assert.equal(esc("A <B> & C"), "A &lt;B&gt; &amp; C");
});

// ── pollHeader ───────────────────────────────────────────────────────────────
test("pollHeader: bold title with RO weekday+date, time and location", () => {
  assert.equal(
    pollHeader("2026-07-22", "06:30", "Parcul Dumitru Râșcanu"),
    "🏃 <b>Antrenament mâine — Miercuri, 22 iul</b>\n🕕 06:30 · 📍 Parcul Dumitru Râșcanu",
  );
});

test("pollHeader: no date / no location fallbacks", () => {
  assert.equal(
    pollHeader("", "08:00", ""),
    "🏃 <b>Antrenament mâine</b>\n🕕 08:00",
  );
  assert.equal(
    pollHeader("", "06:30:00", "Parc"),
    "🏃 <b>Antrenament mâine</b>\n🕕 06:30 · 📍 Parc",
  );
});

// ── buildPollText ────────────────────────────────────────────────────────────
test("buildPollText: call-to-action when nobody voted", () => {
  const out = buildPollText("H", [], []);
  assert.equal(out, "H\n\nCine vine? Apasă mai jos 👇");
});

test("buildPollText: bulleted names, only non-empty sections, escaping", () => {
  const out = buildPollText("H", ["Ana", "V<lad"], []);
  assert.equal(out, "H\n\n✅ <b>Vin (2)</b>\n• Ana\n• V&lt;lad");
  assert.ok(!out.includes("Nu pot"));
});

test("buildPollText: both sections separated by a blank line", () => {
  const out = buildPollText("H", ["Ana"], ["Ion"]);
  assert.equal(
    out,
    "H\n\n✅ <b>Vin (1)</b>\n• Ana\n\n❌ <b>Nu pot (1)</b>\n• Ion",
  );
});
