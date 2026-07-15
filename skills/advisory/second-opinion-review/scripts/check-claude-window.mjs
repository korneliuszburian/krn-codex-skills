#!/usr/bin/env node

const TIME_ZONE = "Europe/Warsaw";
const DENIED_START_HOUR = 8;
const DENIED_END_HOUR = 12;
const TEMPORARY_FAILURE = 75;

function localClock(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  );
}

function isDenied(date) {
  const hour = Number(localClock(date).hour);
  return hour >= DENIED_START_HOUR && hour < DENIED_END_HOUR;
}

function describe(date) {
  const clock = localClock(date);
  return `${clock.year}-${clock.month}-${clock.day} ${clock.hour}:${clock.minute}:${clock.second} ${clock.timeZoneName}`;
}

function checkNow() {
  const now = new Date();
  if (isDenied(now)) {
    console.error(
      `Claude execution denied at ${describe(now)} (${TIME_ZONE}); retry at or after 12:00 local time.`,
    );
    return TEMPORARY_FAILURE;
  }
  console.log(`Claude execution window open at ${describe(now)} (${TIME_ZONE}).`);
  return 0;
}

function selfTest() {
  const cases = [
    ["winter before", "2026-01-15T06:59:59Z", false],
    ["winter start", "2026-01-15T07:00:00Z", true],
    ["winter before end", "2026-01-15T10:59:59Z", true],
    ["winter end", "2026-01-15T11:00:00Z", false],
    ["summer before", "2026-07-15T05:59:59Z", false],
    ["summer start", "2026-07-15T06:00:00Z", true],
    ["summer before end", "2026-07-15T09:59:59Z", true],
    ["summer end", "2026-07-15T10:00:00Z", false],
  ];
  const failures = cases.filter(([, instant, expected]) => isDenied(new Date(instant)) !== expected);
  if (failures.length) {
    for (const [label, instant, expected] of failures) {
      console.error(`${label}: ${instant} expected denied=${expected}`);
    }
    return 1;
  }
  console.log(`validated ${cases.length} Europe/Warsaw Claude-window boundaries`);
  return 0;
}

const command = process.argv[2] ?? "check";
if (command === "check") process.exit(checkNow());
if (command === "self-test") process.exit(selfTest());
console.error("usage: check-claude-window.mjs [check|self-test]");
process.exit(64);
