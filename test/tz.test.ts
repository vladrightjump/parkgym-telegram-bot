import { test } from "node:test";
import assert from "node:assert/strict";

import { ymdInTz, localWeekdayAndTime, GYM_TZ } from "../src/lib/tz.js";

// Europe/Chisinau is UTC+3 in summer (EEST) and UTC+2 in winter (EET). These
// fixed instants pin down the timezone maths the scheduler depends on.

test("ymdInTz: rolls to the next calendar day past local midnight", () => {
  // 22:30 UTC on 19 Jul → 01:30 (next day) in Chisinau (UTC+3).
  assert.equal(ymdInTz(new Date("2026-07-19T22:30:00Z"), GYM_TZ), "2026-07-20");
  // 18:30 UTC same day → 21:30 local, still the 19th.
  assert.equal(ymdInTz(new Date("2026-07-19T18:30:00Z"), GYM_TZ), "2026-07-19");
});

test("localWeekdayAndTime: summer offset (+3, EEST)", () => {
  const r = localWeekdayAndTime(GYM_TZ, new Date("2026-07-19T18:30:00Z"));
  assert.deepEqual(r, { weekday: 0, hhmm: "21:30" }); // Sunday 21:30
});

test("localWeekdayAndTime: rolls into the next day and weekday", () => {
  const r = localWeekdayAndTime(GYM_TZ, new Date("2026-07-19T22:30:00Z"));
  assert.deepEqual(r, { weekday: 1, hhmm: "01:30" }); // Monday 01:30
});

test("localWeekdayAndTime: winter offset (+2, EET)", () => {
  const r = localWeekdayAndTime(GYM_TZ, new Date("2026-01-15T20:30:00Z"));
  assert.deepEqual(r, { weekday: 4, hhmm: "22:30" }); // Thursday 22:30
});
