import { describe, expect, it } from "vitest";

import { expandSchedule, isScheduledInstant, TIME_PATTERN, type ScheduleRule } from "./schedule.js";

const NY = "America/New_York";
const twiceDaily: ScheduleRule = {
  times: ["20:00", "08:00"],
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startDate: "2026-03-01",
  endDate: null,
};

describe("expandSchedule", () => {
  it("returns local times in order as UTC instants", () => {
    const due = expandSchedule(twiceDaily, {
      from: new Date("2026-03-02T05:00:00Z"), // Mar 2, 00:00 in New York
      to: new Date("2026-03-03T05:00:00Z"),
      timeZone: NY,
    });
    expect(due.map((d) => d.toISOString())).toEqual(["2026-03-02T13:00:00.000Z", "2026-03-03T01:00:00.000Z"]);
  });

  it("keeps 08:00 local across the spring daylight-saving change", () => {
    const due = expandSchedule(
      { ...twiceDaily, times: ["08:00"] },
      { from: new Date("2026-03-07T05:00:00Z"), to: new Date("2026-03-10T04:00:00Z"), timeZone: NY },
    );
    expect(due.map((d) => d.toISOString())).toEqual([
      "2026-03-07T13:00:00.000Z", // EST, UTC-5
      "2026-03-08T12:00:00.000Z", // EDT from Mar 8, UTC-4
      "2026-03-09T12:00:00.000Z",
    ]);
  });

  it("respects weekdays and the start/end date range", () => {
    const weekdays: ScheduleRule = {
      times: ["09:00"],
      daysOfWeek: [1, 2, 3, 4, 5],
      startDate: "2026-03-03",
      endDate: "2026-03-05",
    };
    const due = expandSchedule(weekdays, {
      from: new Date("2026-03-01T00:00:00Z"),
      to: new Date("2026-03-10T00:00:00Z"),
      timeZone: "UTC",
    });
    // Mar 3 (Tue) to Mar 5 (Thu) only.
    expect(due.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-03-03", "2026-03-04", "2026-03-05"]);
  });

  it("clips doses outside the [from, to) window", () => {
    const due = expandSchedule(twiceDaily, {
      from: new Date("2026-03-02T14:00:00Z"),
      to: new Date("2026-03-03T01:00:00Z"),
      timeZone: NY,
    });
    expect(due).toEqual([]);
  });
});

describe("isScheduledInstant", () => {
  it("accepts due instants only", () => {
    expect(isScheduledInstant(twiceDaily, new Date("2026-03-02T13:00:00Z"), NY)).toBe(true);
    expect(isScheduledInstant(twiceDaily, new Date("2026-03-02T13:30:00Z"), NY)).toBe(false);
    expect(isScheduledInstant(twiceDaily, new Date("2026-02-27T13:00:00Z"), NY)).toBe(false);
  });
});

describe("TIME_PATTERN", () => {
  it("accepts 24-hour HH:MM", () => {
    expect(["00:00", "08:30", "23:59"].every((t) => TIME_PATTERN.test(t))).toBe(true);
    expect(["8:30", "24:00", "12:60", "noon"].some((t) => TIME_PATTERN.test(t))).toBe(false);
  });
});
