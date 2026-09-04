import { describe, it, expect } from "vitest";
import { interpolateMonthly } from "../interpolate-monthly";
import type { LineGraphEntry } from "../../types/types";

const entry = (nominal: number, real: number, date: Date): LineGraphEntry => ({
  x: date,
  nominal,
  real,
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

  it("first point equals the first yearly entry on both tracks", () => {
    const yearly = [
      entry(1000, 900, new Date("2026-01-01")),
      entry(1200, 1080, new Date("2027-01-01")),
    ];
    const result = interpolateMonthly(yearly);
    expect(result[0].nominal).toBe(1000);
    expect(result[0].real).toBe(900);
  });

  it("last point is exactly the final yearly entry", () => {
    const last = entry(1200, 1080, new Date("2027-01-01"));
    const yearly = [entry(1000, 900, new Date("2026-01-01")), last];
    const result = interpolateMonthly(yearly);
    expect(result[result.length - 1]).toStrictEqual(last);
  });

  it("intermediate values are linearly interpolated (floored)", () => {
    // nominal goes from 1000 → 1200 (+200 over 12 months)
    // month 1: t = 1/12 → floor(1000 + 200 * 1/12) = floor(1016.666) = 1016
    const yearly = [
      entry(1000, 0, new Date("2026-01-01")),
      entry(1200, 0, new Date("2027-01-01")),
    ];
    const result = interpolateMonthly(yearly);
    expect(result[1].nominal).toBe(1016);
  });

  it("carries both tracks through, each interpolated on its own", () => {
    // The tracks move by different amounts over the same 12 months, so a row
    // that interpolated one and copied the other would be visible here
    const yearly = [
      entry(1000, 500, new Date(2026, 0, 1)),
      entry(1240, 620, new Date(2027, 0, 1)),
    ];
    const result = interpolateMonthly(yearly);
    result.slice(0, 12).forEach((pt, m) => {
      expect(pt.nominal).toBe(Math.floor(1000 + 240 * (m / 12)));
      expect(pt.real).toBe(Math.floor(500 + 120 * (m / 12)));
    });
    expect(result[12]).toStrictEqual(yearly[1]);
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

// ── additional edge cases ─────────────────────────────────────────────────────

describe("interpolateMonthly – edge cases", () => {
  it("handles negative values (portfolio going below 0)", () => {
    const yearly = [
      entry(500, 450, new Date("2026-01-01")),
      entry(-100, -90, new Date("2027-01-01")),
    ];
    const result = interpolateMonthly(yearly);
    expect(result).toHaveLength(13);
    // First point positive, last point negative
    expect(result[0].nominal).toBe(500);
    expect(result[result.length - 1].nominal).toBe(-100);
    // Should cross zero somewhere in between
    const hasNegative = result.some((p) => p.nominal < 0);
    expect(hasNegative).toBe(true);
  });

  it("single-year horizon (2 entries) produces exactly 13 months", () => {
    const yearly = [
      entry(10000, 9000, new Date("2026-06-01")),
      entry(11000, 9900, new Date("2027-06-01")),
    ];
    const result = interpolateMonthly(yearly);
    // (2-1)×12 + 1 = 13
    expect(result).toHaveLength(13);
  });
});
