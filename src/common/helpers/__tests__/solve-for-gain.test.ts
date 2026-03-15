import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { solveForGain } from "../solve-for-gain";
import { InvestmentCalculator } from "../investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../../types/types";
import { MAX_PROJECTED_GAIN } from "../../constants/app-constants";

const noop = (): void => {};

type BaseProps = Omit<InvestmentCalculatorProps, "projectedGain">;

const makeBase = (overrides: Partial<BaseProps> = {}): BaseProps => ({
  currentAmount: "10000",
  setCurrentAmount: noop,
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
  ...overrides,
});

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15)); // Jan 15 local time → month = 0
});

afterAll(() => {
  vi.useRealTimers();
});

describe("solveForGain", () => {
  it("returns 0 when target is 0 or negative", () => {
    expect(solveForGain(makeBase(), 0, false)).toBe(0);
    expect(solveForGain(makeBase(), -1000, false)).toBe(0);
  });

  it("returns MAX_PROJECTED_GAIN when target is unreachable", () => {
    // $10 000 cannot grow to $1 billion in 10 years even at max gain
    expect(solveForGain(makeBase(), 1_000_000_000, false)).toBe(
      MAX_PROJECTED_GAIN,
    );
  });

  it("returns 0 when 0% gain already exceeds target", () => {
    // Target less than initial → 0% is sufficient
    expect(solveForGain(makeBase(), 5000, false)).toBe(0);
  });

  it("converges: applying the solved rate produces the target value", () => {
    const base = makeBase();
    const target = 20000;
    const rate = solveForGain(base, target, false);

    const calc = new InvestmentCalculator({ ...base, projectedGain: rate });
    const actual = calc.calculateGrowth(false).numeric;

    // The gain is rounded to 1 decimal place; over 10 years that precision
    // shifts the final value by up to ~200. Use ±0.5% tolerance.
    expect(actual).toBeGreaterThanOrEqual(target * 0.995);
    expect(actual).toBeLessThanOrEqual(target * 1.005);
  });

  it("converges with inflation mode enabled", () => {
    const base = makeBase();
    const target = 15000;
    const rate = solveForGain(base, target, true);

    const calc = new InvestmentCalculator({ ...base, projectedGain: rate });
    const actual = calc.calculateGrowth(true).numeric;

    // Same tolerance for the inflation-adjusted path
    expect(actual).toBeGreaterThanOrEqual(target * 0.995);
    expect(actual).toBeLessThanOrEqual(target * 1.005);
  });
});
