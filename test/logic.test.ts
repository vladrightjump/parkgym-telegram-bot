import { test } from "node:test";
import assert from "node:assert/strict";

import { isDue } from "../src/lib/schedule.js";
import { normalizeTime, normalizeDays } from "../src/lib/config.js";
import { fmtDate } from "../src/lib/format.js";
import { cleanName, isValidName } from "../src/webhook.js";

// ── Schedule matching ────────────────────────────────────────────────────────
test("isDue: fires only on a configured day at the exact time", () => {
  assert.equal(isDue([1, 3], "20:00", 1, "20:00"), true); // Mon 20:00
  assert.equal(isDue([1, 3], "20:00", 3, "20:00"), true); // Wed 20:00
});

test("isDue: does not fire on the wrong day", () => {
  assert.equal(isDue([1, 3], "20:00", 2, "20:00"), false); // Tue
  assert.equal(isDue([1, 3], "20:00", 0, "20:00"), false); // Sun
});

test("isDue: does not fire at the wrong minute", () => {
  assert.equal(isDue([1, 3], "20:00", 1, "20:01"), false);
  assert.equal(isDue([1, 3], "20:00", 1, "19:59"), false);
});

test("isDue: empty day list never fires", () => {
  assert.equal(isDue([], "20:00", 1, "20:00"), false);
});

// ── Config normalization ─────────────────────────────────────────────────────
test("normalizeTime: pads and trims to HH:MM", () => {
  assert.equal(normalizeTime("20:00"), "20:00");
  assert.equal(normalizeTime("9:05"), "09:05");
  assert.equal(normalizeTime("06:30:00"), "06:30");
  assert.equal(normalizeTime(" 7:15 "), "07:15");
});

test("normalizeTime: rejects junk", () => {
  assert.equal(normalizeTime("abc"), null);
  assert.equal(normalizeTime("9:5"), null); // minutes need 2 digits
  assert.equal(normalizeTime(123 as unknown), null);
  assert.equal(normalizeTime(null), null);
});

test("normalizeDays: keeps valid 0..6, drops the rest, falls back", () => {
  assert.deepEqual(normalizeDays([1, 3], []), [1, 3]);
  assert.deepEqual(normalizeDays(["1", "3"], []), [1, 3]);
  assert.deepEqual(normalizeDays([7, 1, -2, 6], []), [1, 6]);
  assert.deepEqual(normalizeDays("nope", [2, 4]), [2, 4]);
});

// ── Romanian date formatting ─────────────────────────────────────────────────
test("fmtDate: short RO month, year only when not current", () => {
  const y = new Date().getFullYear();
  assert.equal(fmtDate(`${y}-07-08`), "8 iul");
  assert.equal(fmtDate("2024-01-01"), "1 ian 2024");
});

// ── Onboarding name handling ─────────────────────────────────────────────────
test("cleanName: collapses whitespace and trims", () => {
  assert.equal(cleanName("  Vlad   Filip  "), "Vlad Filip");
  assert.equal(cleanName("Ana\tMaria"), "Ana Maria");
});

test("isValidName: accepts real names, rejects commands and edge lengths", () => {
  assert.equal(isValidName("Vlad Filip"), true);
  assert.equal(isValidName("/start"), false);
  assert.equal(isValidName("V"), false);
  assert.equal(isValidName("x".repeat(81)), false);
  assert.equal(isValidName("x".repeat(80)), true);
});
