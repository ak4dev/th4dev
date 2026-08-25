import { describe, it, expect } from "vitest";
import { interpolateDailyForMonth } from "../interpolate-daily";
import type { LineGraphEntry } from "../../types/types";

const entry = (y: number, alternateY: number, date: Date): LineGraphEntry => ({
  x: date,
  y,
  alternateY,
});

describe("interpolateDailyForMonth", () => {
  it("returns one entry per calendar day in the source month", () => {
    const result = interpolateDailyForMonth(
      entry(300, 280, new Date("2026-01-01")),
      entry(331, 308, new Date("2026-02-01")),
    );
    expect(result).toHaveLength(31);
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

  it("spans exactly the days until the next row when rows are anchored late in the month", () => {
    // Rows anchored on the 31st clamp to Feb 28 / Mar 31 (date-fns addMonths)
    const jan31 = new Date(2026, 0, 31);
    const feb28 = new Date(2026, 1, 28);
    const mar31 = new Date(2026, 2, 31);

    const janRows = interpolateDailyForMonth(
      entry(0, 0, jan31),
      entry(280, 280, feb28),
    );
    expect(janRows).toHaveLength(28);
    expect(janRows[27].x).toEqual(new Date(2026, 1, 27));
    expect(janRows[27].y).toBe(270); // 280 × 27/28

    const febRows = interpolateDailyForMonth(
      entry(0, 0, feb28),
      entry(310, 310, mar31),
    );
    expect(febRows).toHaveLength(31);
    expect(febRows[30].x).toEqual(new Date(2026, 2, 30));
  });

  it("emits a single row when both entries fall on the same day", () => {
    const day = new Date(2026, 3, 1);
    const result = interpolateDailyForMonth(
      entry(100, 90, day),
      entry(200, 180, day),
    );
    expect(result).toEqual([entry(100, 90, day)]);
  });
});

// ── additional edge cases ─────────────────────────────────────────────────────

describe("interpolateDailyForMonth – edge cases", () => {
  it("negative growth produces monotonically decreasing values", () => {
    const result = interpolateDailyForMonth(
      entry(1000, 900, new Date("2026-03-01")),
      entry(700, 630, new Date("2026-04-01")),
    );
    for (let i = 1; i < result.length; i++) {
      expect(result[i].y).toBeLessThanOrEqual(result[i - 1].y);
    }
  });

  it("equal from/to produces constant values", () => {
    const result = interpolateDailyForMonth(
      entry(500, 450, new Date("2026-04-01")),
      entry(500, 450, new Date("2026-05-01")),
    );
    result.forEach((pt) => {
      expect(pt.y).toBe(500);
      expect(pt.alternateY).toBe(450);
    });
  });
});
