import { describe, expect, it } from "vitest";

import { classifyDoses, currentStreak, summarize, type ClassifiedDose, type DoseState } from "./adherence.js";

const at = (iso: string) => new Date(iso);
const now = at("2026-03-02T12:00:00Z");

describe("classifyDoses", () => {
  it("assigns taken, skipped, missed, due and upcoming", () => {
    const doses = classifyDoses(
      [
        at("2026-03-02T06:00:00Z"), // logged taken
        at("2026-03-02T07:00:00Z"), // logged skipped
        at("2026-03-02T09:00:00Z"), // 3h ago, unlogged → missed
        at("2026-03-02T11:30:00Z"), // 30 min ago → still due
        at("2026-03-02T18:00:00Z"), // future → upcoming
      ],
      [
        { scheduledFor: at("2026-03-02T06:00:00Z"), status: "taken", note: null },
        { scheduledFor: at("2026-03-02T07:00:00Z"), status: "skipped", note: "felt nauseous" },
      ],
      now,
    );
    expect(doses.map((d) => d.state)).toEqual(["taken", "skipped", "missed", "due", "upcoming"]);
    expect(doses[1]?.note).toBe("felt nauseous");
  });

  it("treats the end of the grace window as missed", () => {
    const [dose] = classifyDoses([at("2026-03-02T11:00:00Z")], [], now, 60);
    expect(dose?.state).toBe("missed");
  });
});

describe("summarize", () => {
  it("computes the rate over settled doses only", () => {
    const states: DoseState[] = ["taken", "taken", "taken", "skipped", "missed", "due", "upcoming"];
    const doses = states.map((state) => ({ scheduledFor: now, state, note: null }));
    expect(summarize(doses)).toEqual({ taken: 3, skipped: 1, missed: 1, settled: 5, rate: 0.6 });
  });

  it("returns a null rate when nothing is settled", () => {
    expect(summarize([{ scheduledFor: now, state: "upcoming", note: null }]).rate).toBeNull();
  });
});

describe("currentStreak", () => {
  const day = (...states: DoseState[]): ClassifiedDose[] =>
    states.map((state) => ({ scheduledFor: now, state, note: null }));

  it("counts consecutive fully-taken days back from today", () => {
    const days = new Map([
      ["2026-02-27", day("missed")],
      ["2026-02-28", day("taken", "taken")],
      ["2026-03-01", day("taken")],
      ["2026-03-02", day("taken", "taken")],
    ]);
    expect(currentStreak(days, "2026-03-02")).toBe(3);
  });

  it("doesn't break the streak for today's pending doses or days without doses", () => {
    const days = new Map([
      ["2026-02-28", day("taken")],
      ["2026-03-01", []],
      ["2026-03-02", day("taken", "upcoming")],
    ]);
    expect(currentStreak(days, "2026-03-02")).toBe(1);
  });

  it("is zero after a skipped dose today", () => {
    expect(currentStreak(new Map([["2026-03-02", day("taken", "skipped")]]), "2026-03-02")).toBe(0);
  });
});
