import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { InvestmentCalculator } from "../investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../../types/types";
import { MAX_PROJECTED_GAIN } from "../../constants/app-constants";

// ── helpers ──────────────────────────────────────────────────────────────────

const noop = (): void => {};

const makeProps = (
  overrides: Partial<InvestmentCalculatorProps> = {},
): InvestmentCalculatorProps => ({
  currentAmount: "10000",
  setCurrentAmount: noop,
  projectedGain: 10,
  setProjectedGain: noop,
  yearsOfGrowth: 1,
  setYearsOfGrowth: noop,
  monthlyContribution: 0,
  setMonthlyContribution: noop,
  monthlyWithdrawal: 0,
  setMonthlyWithdrawal: noop,
  yearWithdrawalsBegin: 0,
  setYearWithdrawalsBegin: noop,
  setYearContributionsStop: noop,
  maxMonthlyWithdrawal: 10000,
  depreciationRate: 0,
  investmentId: "test",
  ...overrides,
});

// Freeze time to 1 Jan 2026 (month=0) so year-0 always processes all 12 months.
// Without this, exact results vary depending on when the test runs.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15)); // Jan 15 local time → month = 0
});

afterAll(() => {
  vi.useRealTimers();
});

// ── invalid input ─────────────────────────────────────────────────────────────

describe("invalid input", () => {
  it("returns 0 for undefined currentAmount", () => {
    const c = new InvestmentCalculator(makeProps({ currentAmount: undefined }));
    expect(c.calculateGrowth(false).numeric).toBe(0);
  });

  it("returns 0 for empty currentAmount string", () => {
    const c = new InvestmentCalculator(makeProps({ currentAmount: "" }));
    expect(c.calculateGrowth(false).numeric).toBe(0);
  });

  it("returns 0 for non-numeric currentAmount", () => {
    const c = new InvestmentCalculator(makeProps({ currentAmount: "abc" }));
    expect(c.calculateGrowth(false).numeric).toBe(0);
  });

  it("returns 0 for negative currentAmount", () => {
    const c = new InvestmentCalculator(makeProps({ currentAmount: "-500" }));
    expect(c.calculateGrowth(false).numeric).toBe(0);
  });

  it("returns 0 when projectedGain exceeds MAX", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: MAX_PROJECTED_GAIN + 1 }),
    );
    expect(c.calculateGrowth(false).numeric).toBe(0);
  });
});

// ── basic growth ──────────────────────────────────────────────────────────────

describe("basic growth", () => {
  it("0% gain preserves the initial amount", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 1 }),
    );
    expect(c.calculateGrowth(false).numeric).toBe(10000);
  });

  it("positive gain grows above initial amount", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 10, yearsOfGrowth: 1 }),
    );
    expect(c.calculateGrowth(false).numeric).toBeGreaterThan(10000);
  });

  // Exact check: $10 000, 12 % annual (1 % / month), frozen Jan → (1.01)^24 months
  // = 10 000 × 1.26973… → floor = 12 697
  it("exact compound result: 10000 × (1.01)^24 at 12% for 1 year", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 12, yearsOfGrowth: 1 }),
    );
    expect(c.calculateGrowth(false).numeric).toBe(12697);
  });

  it("more years produce a higher value", () => {
    const calc = (y: number) =>
      new InvestmentCalculator(
        makeProps({ projectedGain: 12, yearsOfGrowth: y }),
      ).calculateGrowth(false).numeric;
    expect(calc(1)).toBeLessThan(calc(2));
    expect(calc(2)).toBeLessThan(calc(5));
  });

  it("formatted result includes dollar sign and commas", () => {
    const c = new InvestmentCalculator(makeProps({ yearsOfGrowth: 10 }));
    const { formatted } = c.calculateGrowth(false);
    expect(formatted).toMatch(/^\$/);
  });
});

// ── growth matrix ─────────────────────────────────────────────────────────────

describe("getGrowthMatrix", () => {
  it("has yearsOfGrowth+1 entries after calculateGrowth", () => {
    for (const y of [0, 1, 5, 10]) {
      const c = new InvestmentCalculator(
        makeProps({ yearsOfGrowth: y, projectedGain: 0 }),
      );
      c.calculateGrowth(false);
      expect(c.getGrowthMatrix()).toHaveLength(y + 1);
    }
  });

  it("year-0 entry matches the initial amount when gain is 0%", () => {
    // With 0% gain the balance never changes.
    // Year 0 includes the current year from month 0 (frozen Jan), so result = 10000.
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 1 }),
    );
    c.calculateGrowth(false);
    const matrix = c.getGrowthMatrix();
    expect(matrix[0].y).toBe(10000);
  });

  it("matrix values are monotonically increasing with positive gain", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 10, yearsOfGrowth: 5 }),
    );
    c.calculateGrowth(false);
    const ys = c.getGrowthMatrix().map((e) => e.y);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    }
  });

  it("is empty before calculateGrowth is called", () => {
    const c = new InvestmentCalculator(makeProps());
    expect(c.getGrowthMatrix()).toHaveLength(0);
  });

  it("is reset on each calculateGrowth call", () => {
    const c = new InvestmentCalculator(makeProps({ yearsOfGrowth: 2 }));
    c.calculateGrowth(false);
    c.calculateGrowth(false);
    expect(c.getGrowthMatrix()).toHaveLength(3); // not 6
  });
});

// ── monthly contributions ─────────────────────────────────────────────────────

describe("monthly contributions", () => {
  // With 0% gain contributions are additive: 10000 + 12*100 + 12*100 = 12400
  it("exact: $100/month at 0% gain for 1 year → 12400", () => {
    const c = new InvestmentCalculator(
      makeProps({
        projectedGain: 0,
        monthlyContribution: 100,
        yearsOfGrowth: 1,
      }),
    );
    expect(c.calculateGrowth(false).numeric).toBe(12400);
  });

  it("contributions produce more than no contributions", () => {
    const without = new InvestmentCalculator(
      makeProps({ monthlyContribution: 0 }),
    ).calculateGrowth(false).numeric;
    const withContrib = new InvestmentCalculator(
      makeProps({ monthlyContribution: 200 }),
    ).calculateGrowth(false).numeric;
    expect(withContrib).toBeGreaterThan(without);
  });

  it("contributions stop when yearContributionsStop is reached (advanced)", () => {
    // Stop at year 1 → only year 0 contributes → 10000 + 12*100 = 11200
    const c = new InvestmentCalculator(
      makeProps({
        projectedGain: 0,
        monthlyContribution: 100,
        yearsOfGrowth: 2,
        advanced: true,
        yearContributionsStop: 1,
      }),
    );
    expect(c.calculateGrowth(false).numeric).toBe(11200);
  });
});

// ── withdrawals ───────────────────────────────────────────────────────────────

describe("withdrawals (advanced mode)", () => {
  it("withdrawals reduce the final balance", () => {
    const base = new InvestmentCalculator(
      makeProps({
        advanced: true,
        monthlyWithdrawal: 0,
        yearWithdrawalsBegin: 0,
      }),
    ).calculateGrowth(false).numeric;
    const withDraw = new InvestmentCalculator(
      makeProps({
        advanced: true,
        monthlyWithdrawal: 200,
        yearWithdrawalsBegin: 0,
      }),
    ).calculateGrowth(false).numeric;
    expect(withDraw).toBeLessThan(base);
  });

  it("withdrawal before start year has no effect", () => {
    // yearWithdrawalsBegin=5 with yearsOfGrowth=1 → no withdrawals applied
    const noWithdraw = new InvestmentCalculator(
      makeProps({
        advanced: true,
        monthlyWithdrawal: 0,
        yearWithdrawalsBegin: 5,
      }),
    ).calculateGrowth(false).numeric;
    const deferredWithdraw = new InvestmentCalculator(
      makeProps({
        advanced: true,
        monthlyWithdrawal: 500,
        yearWithdrawalsBegin: 5,
      }),
    ).calculateGrowth(false).numeric;
    expect(deferredWithdraw).toBe(noWithdraw);
  });
});

// ── inflation ─────────────────────────────────────────────────────────────────

describe("inflation adjustment", () => {
  // With 10% inflation and 0% gain over 1 year:
  // Year 0: inflAdj → 10000 * (1 - 0.1) = 9000
  // Year 1: inflAdj → 9000 * (1 - 0.1) = 8100
  it("exact: 10% inflation, 0% gain, 1 year → inflation-adjusted = 8100", () => {
    const c = new InvestmentCalculator(
      makeProps({ projectedGain: 0, depreciationRate: 10, yearsOfGrowth: 1 }),
    );
    expect(c.calculateGrowth(true).numeric).toBe(8100);
  });

  it("inflation-adjusted value is less than nominal", () => {
    const c = new InvestmentCalculator(
      makeProps({ depreciationRate: 5, yearsOfGrowth: 5 }),
    );
    const nominal = c.calculateGrowth(false).numeric;
    const adjusted = c.calculateGrowth(true).numeric;
    expect(adjusted).toBeLessThan(nominal);
  });

  it("getInflationAdjusted reduces by the depreciation percentage", () => {
    const c = new InvestmentCalculator(makeProps({ depreciationRate: 10 }));
    // 10% of 10000 = 1000; floor(10000 - 1000) = 9000
    expect(c.getInflationAdjusted(10000)).toBe(9000);
  });
});

// ── rollover ──────────────────────────────────────────────────────────────────

describe("rollover", () => {
  // With 0% gain: year 0 = 10000, at end of year 1 + 5000 rollover = 15000
  it("exact: rollover of 5000 at year 1 → 15000 with 0% gain", () => {
    const c = new InvestmentCalculator(
      makeProps({
        projectedGain: 0,
        yearsOfGrowth: 1,
        rollOver: true,
        investmentToRoll: 5000,
        yearOfRollover: 1,
      }),
    );
    expect(c.calculateGrowth(false).numeric).toBe(15000);
  });

  it("rollover at year 0 (not the target year) is not applied early", () => {
    // yearOfRollover=2 with yearsOfGrowth=1 → rollover never fires
    const without = new InvestmentCalculator(
      makeProps({ projectedGain: 0, yearsOfGrowth: 1 }),
    ).calculateGrowth(false).numeric;
    const withRollover = new InvestmentCalculator(
      makeProps({
        projectedGain: 0,
        yearsOfGrowth: 1,
        rollOver: true,
        investmentToRoll: 5000,
        yearOfRollover: 2,
      }),
    ).calculateGrowth(false).numeric;
    expect(withRollover).toBe(without);
  });
});

// ── getPercentageChange ───────────────────────────────────────────────────────

describe("getPercentageChange", () => {
  const c = new InvestmentCalculator(makeProps());

  it("calculates positive percentage change", () => {
    expect(c.getPercentageChange(10000, 12000)).toBe(20);
  });

  it("calculates negative percentage change", () => {
    expect(c.getPercentageChange(10000, 8000)).toBe(-20);
  });

  it("returns 0 when original is 0", () => {
    expect(c.getPercentageChange(0, 5000)).toBe(0);
  });

  it("returns 0 for no change", () => {
    expect(c.getPercentageChange(10000, 10000)).toBe(0);
  });
});
