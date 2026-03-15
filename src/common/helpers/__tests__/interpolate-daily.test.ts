import { describe, it, expect } from "vitest";
import { getDaysInMonth } from "date-fns";
import { interpolateDailyForMonth } from "../interpolate-daily";
import type { LineGraphEntry } from "../../types/types";

const entry = (y: number, alternateY: number, date: Date): LineGraphEntry => ({
  x: date,
  y,
  alternateY,
});

describe("interpolateDailyForMonth", () => {
  it("returns one entry per calendar day in the source month", () => {
    const jan = new Date("2026-01-01");
    const feb = new Date("2026-02-01");
    const result = interpolateDailyForMonth(
      entry(300, 280, jan),
      entry(331, 308, feb),
    );
    expect(result).toHaveLength(getDaysInMonth(jan)); // 31
  });

  it("first day value equals the 'from' value exactly", () => {
    const result = interpolateDailyForMonth(
      entry(500, 450, new Date("2026-03-01")),
      entry(531, 478, new Date("2026-04-01")),
    );
    expect(result[0].y).toBe(500);
    expect(result[0].alternateY).toBe(450);
  });

  it("last day value is just below the 'to' value (t = (days-1)/days)", () => {
    const from = entry(0, 0, new Date("2026-01-01"));
    const to = entry(310, 310, new Date("2026-02-01")); // 31 days in Jan
    const result = interpolateDailyForMonth(from, to);
    const daysInJan = 31;
    const expected = Math.floor(310 * (30 / 31)); // t = 30/31
    expect(result[30].y).toBe(expected);
  });

  it("values are monotonically non-decreasing for a positive range", () => {
    const result = interpolateDailyForMonth(
      entry(100, 90, new Date("2026-06-01")),
      entry(130, 117, new Date("2026-07-01")),
    );
    for (let i = 1; i < result.length; i++) {
      expect(result[i].y).toBeGreaterThanOrEqual(result[i - 1].y);
    }
  });

  it("handles February correctly (28 days in a non-leap year)", () => {
    const result = interpolateDailyForMonth(
      entry(280, 252, new Date(2025, 1, 1)), // Feb 1 2025 local time
      entry(308, 277, new Date(2025, 2, 1)), // Mar 1 2025 local time
    );
    expect(result).toHaveLength(28);
  });

  it("handles February in a leap year (29 days)", () => {
    const result = interpolateDailyForMonth(
      entry(290, 260, new Date(2024, 1, 1)), // Feb 1 2024 local time
      entry(319, 287, new Date(2024, 2, 1)), // Mar 1 2024 local time
    );
    expect(result).toHaveLength(29);
  });

  it("dates start at 'from' and increment daily", () => {
    const from = new Date("2026-05-01");
    const result = interpolateDailyForMonth(
      entry(0, 0, from),
      entry(30, 27, new Date("2026-06-01")),
    );
    result.forEach((pt, i) => {
      const expected = new Date(from);
      expected.setDate(expected.getDate() + i);
      expect(pt.x.toDateString()).toBe(expected.toDateString());
    });
  });
});
