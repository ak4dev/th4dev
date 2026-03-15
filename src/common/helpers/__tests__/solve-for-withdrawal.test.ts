import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { solveForWithdrawal } from "../solve-for-withdrawal";
import { InvestmentCalculator } from "../investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../../types/types";

const noop = (): void => {};

const makeProps = (
  overrides: Partial<InvestmentCalculatorProps> = {},
): InvestmentCalculatorProps => ({
  currentAmount: "10000",
  setCurrentAmount: noop,
  projectedGain: 10,
  setProjectedGain: noop,
  yearsOfGrowth: 10,
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
  advanced: true,
  ...overrides,
});

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15)); // Jan 15 local time → month = 0
});

afterAll(() => {
  vi.useRealTimers();
});

describe("solveForWithdrawal", () => {
  it("returns 0 for a negative target", () => {
    expect(solveForWithdrawal(makeProps(), -1000, false)).toBe(0);
  });

  it("returns 0 when 0-withdrawal result already meets or exceeds target", () => {
    // Target above the no-withdrawal projection is unreachable via withdrawal
    const noWithdraw = new InvestmentCalculator(
      makeProps({ monthlyWithdrawal: 0 }),
    ).calculateGrowth(false).numeric;

    const result = solveForWithdrawal(makeProps(), noWithdraw + 5000, false);
    expect(result).toBe(0);
  });

  it("converges: applying the solved withdrawal produces the target value", () => {
    const base = makeProps();
    // Pick a target between min (heavy withdrawal) and max (no withdrawal)
    const noWithdrawResult = new InvestmentCalculator(
      makeProps({ monthlyWithdrawal: 0 }),
    ).calculateGrowth(false).numeric;

    const target = Math.floor(noWithdrawResult * 0.6); // 60 % of max

    const withdrawal = solveForWithdrawal(base, target, false);

    const calc = new InvestmentCalculator({
      ...base,
      monthlyWithdrawal: withdrawal,
    });
    const actual = calc.calculateGrowth(false).numeric;

    // The withdrawal is rounded to nearest dollar; use ±0.5% tolerance.
    expect(actual).toBeGreaterThanOrEqual(target * 0.995);
    expect(actual).toBeLessThanOrEqual(target * 1.005);
  });

  it("higher withdrawal → lower final balance (monotonicity)", () => {
    const low = new InvestmentCalculator(
      makeProps({ monthlyWithdrawal: 100 }),
    ).calculateGrowth(false).numeric;
    const high = new InvestmentCalculator(
      makeProps({ monthlyWithdrawal: 500 }),
    ).calculateGrowth(false).numeric;
    expect(high).toBeLessThan(low);
  });
});
