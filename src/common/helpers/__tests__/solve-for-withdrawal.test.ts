import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { solveForWithdrawal } from "../solve-for-withdrawal";
import { InvestmentCalculator } from "../investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../../types/types";

const makeProps = (
  overrides: Partial<InvestmentCalculatorProps> = {},
): InvestmentCalculatorProps => ({
  currentAmount: "10000",
  projectedGain: 10,
  yearsOfGrowth: 10,
  monthlyContribution: 0,
  monthlyWithdrawal: 0,
  yearWithdrawalsBegin: 0,
  maxMonthlyWithdrawal: 10000,
  depreciationRate: 0,
  advanced: true,
  ...overrides,
});

const finalValue = (props: InvestmentCalculatorProps) =>
  new InvestmentCalculator(props).calculateGrowth(false).numeric;

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
    expect(solveForWithdrawal(makeProps(), -999999, false)).toBe(0);
  });

  it("returns 0 when 0-withdrawal result already meets or exceeds target", () => {
    // Target above the no-withdrawal projection is unreachable via withdrawal
    const noWithdraw = finalValue(makeProps());
    expect(solveForWithdrawal(makeProps(), noWithdraw + 5000, false)).toBe(0);
    expect(solveForWithdrawal(makeProps(), noWithdraw + 100000, false)).toBe(0);
  });

  it("returns 0 outside advanced mode, where withdrawals are inert", () => {
    expect(
      solveForWithdrawal(makeProps({ advanced: false }), 5000, false),
    ).toBe(0);
  });

  it("converges: applying the solved withdrawal produces the target value", () => {
    const base = makeProps();
    // Pick a target between min (heavy withdrawal) and max (no withdrawal)
    const target = Math.floor(finalValue(base) * 0.6);
    const withdrawal = solveForWithdrawal(base, target, false);
    const actual = finalValue({ ...base, monthlyWithdrawal: withdrawal });

    // The withdrawal is rounded to the nearest dollar, and over a 10-year
    // (120-month) horizon that up-to-$0.50 rounding error compounds monthly
    // with the rest of the balance — use ±1% tolerance to accommodate it.
    expect(actual).toBeGreaterThanOrEqual(target * 0.99);
    expect(actual).toBeLessThanOrEqual(target * 1.01);
  });

  it("converges over a shorter horizon", () => {
    const base = makeProps({ yearsOfGrowth: 5 });
    const target = Math.floor(finalValue(base) * 0.5);
    const withdrawal = solveForWithdrawal(base, target, false);
    const actual = finalValue({ ...base, monthlyWithdrawal: withdrawal });
    expect(actual).toBeGreaterThanOrEqual(target * 0.995);
    expect(actual).toBeLessThanOrEqual(target * 1.005);
  });

  it("higher withdrawal → lower final balance (monotonicity)", () => {
    expect(finalValue(makeProps({ monthlyWithdrawal: 500 }))).toBeLessThan(
      finalValue(makeProps({ monthlyWithdrawal: 100 })),
    );
  });

  it("handles targetValue = 0 without error and returns a positive withdrawal", () => {
    // Target of 0 means "drain the portfolio"; the solver should return a
    // positive withdrawal amount (not 0).
    expect(solveForWithdrawal(makeProps(), 0, false)).toBeGreaterThan(0);
  });

  it("never returns more than maxMonthlyWithdrawal when the target is unreachable", () => {
    expect(
      solveForWithdrawal(makeProps({ currentAmount: "10000000" }), 0, false),
    ).toBe(10000);
    expect(
      solveForWithdrawal(
        makeProps({ currentAmount: "2000000", projectedGain: 5 }),
        0,
        false,
      ),
    ).toBe(10000);
  });

  it("solves for the fixed amount even when a dynamic policy is present", () => {
    const base = makeProps();
    const target = Math.floor(finalValue(base) * 0.6);
    const withDynamic = makeProps({
      dynamicWithdrawal: { ratePct: 4, floor: 0, ceiling: 10000 },
    });
    expect(solveForWithdrawal(withDynamic, target, false)).toBe(
      solveForWithdrawal(base, target, false),
    );
  });
});
