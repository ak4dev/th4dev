import { describe, it, expect } from "vitest";
import { interpolateMonthly } from "../interpolate-monthly";
import type { LineGraphEntry } from "../../types/types";

const entry = (y: number, alternateY: number, date: Date): LineGraphEntry => ({
  x: date,
  y,
  alternateY,
});

describe("interpolateMonthly", () => {
  it("returns the same array unchanged when given fewer than 2 entries", () => {
    const single = [entry(1000, 900, new Date("2026-01-01"))];
    expect(interpolateMonthly(single)).toStrictEqual(single);

    expect(interpolateMonthly([])).toStrictEqual([]);
  });

  it("produces 13 points for 2 yearly entries (12 months + 1 final)", () => {
    const yearly = [
      entry(1000, 900, new Date("2026-01-01")),
      entry(1200, 1080, new Date("2027-01-01")),
    ];
    expect(interpolateMonthly(yearly)).toHaveLength(13);
  });

  it("produces (N-1)×12+1 points for N yearly entries", () => {
    const makeYearly = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        entry(1000 + i * 200, 900 + i * 180, new Date(2026 + i, 0, 1)),
      );
    expect(interpolateMonthly(makeYearly(3))).toHaveLength(25);
    expect(interpolateMonthly(makeYearly(5))).toHaveLength(49);
  });

  it("first point y value equals the first yearly entry", () => {
    const yearly = [
      entry(1000, 900, new Date("2026-01-01")),
      entry(1200, 1080, new Date("2027-01-01")),
    ];
    const result = interpolateMonthly(yearly);
    expect(result[0].y).toBe(1000);
    expect(result[0].alternateY).toBe(900);
  });

  it("last point is exactly the final yearly entry", () => {
    const last = entry(1200, 1080, new Date("2027-01-01"));
    const yearly = [entry(1000, 900, new Date("2026-01-01")), last];
    const result = interpolateMonthly(yearly);
    expect(result[result.length - 1]).toStrictEqual(last);
  });

  it("intermediate values are linearly interpolated (floored)", () => {
    // y goes from 1000 → 1200 (+200 over 12 months)
    // month 1: t = 1/12, y = floor(1000 + 200 * 1/12) = floor(1016.666) = 1016
    const yearly = [
      entry(1000, 0, new Date("2026-01-01")),
      entry(1200, 0, new Date("2027-01-01")),
    ];
    const result = interpolateMonthly(yearly);
    expect(result[1].y).toBe(1016);
  });

  it("dates advance by one month per step", () => {
    const yearly = [
      entry(1000, 900, new Date("2026-01-01")),
      entry(1200, 1080, new Date("2027-01-01")),
    ];
    const result = interpolateMonthly(yearly);
    for (let i = 1; i < result.length - 1; i++) {
      const diff = result[i].x.getTime() - result[i - 1].x.getTime();
      // ~30 days in ms — just verify it's positive and less than 35 days
      const days = diff / (1000 * 60 * 60 * 24);
      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThan(35);
    }
  });
});
