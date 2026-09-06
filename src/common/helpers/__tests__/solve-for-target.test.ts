import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { solveForTarget, noWithdrawalBalance } from "../solve-for-target";
import type { TargetSolution } from "../solve-for-target";
import { InvestmentCalculator } from "../investment-growth-calculator";
import { MAX_MONTHLY_WITHDRAWAL } from "../../constants/app-constants";
import type {
  DisplayTrack,
  InvestmentCalculatorProps,
} from "../../types/types";

const makeProps = (
  overrides: Partial<InvestmentCalculatorProps> = {},
): InvestmentCalculatorProps => ({
  initialAmount: 10000,
  projectedGain: 10,
  yearsOfGrowth: 10,
  monthlyContribution: 0,
  monthlyWithdrawal: 0,
  withdrawalStartYear: 0,
  inflationPct: 0,
  ...overrides,
});

const finalValue = (
  props: InvestmentCalculatorProps,
  track: DisplayTrack = "nominal",
) => new InvestmentCalculator(props).calculateGrowth()[track];

/** The withdrawal a solution leaves the plan with */
const withdrawalOf = (
  props: InvestmentCalculatorProps,
  solution: TargetSolution,
) => solution.monthlyWithdrawal ?? props.monthlyWithdrawal;

/**
 * Asserts the solution is step-optimal: moving the withdrawal one dollar
 * either way lands no closer to the target. That is the best a whole-dollar
 * control can do, and - unlike a tolerance on |achieved - target| - it cannot
 * be satisfied by a predicate the solver itself defines. A neighbour outside
 * the slider range is skipped, since the solver could not have committed to
 * it either; the in-range neighbours it did compare are returned.
 */
const expectStepOptimal = (
  props: InvestmentCalculatorProps,
  target: number,
  solution: TargetSolution,
  track: DisplayTrack = "nominal",
  max = MAX_MONTHLY_WITHDRAWAL,
): number[] => {
  const value = withdrawalOf(props, solution);
  const at = (monthlyWithdrawal: number) =>
    finalValue({ ...props, monthlyWithdrawal }, track);
  const miss = Math.abs(at(value) - target);
  const neighbours = [value - 1, value + 1].filter((n) => n >= 0 && n <= max);
  for (const neighbour of neighbours) {
    expect(
      Math.abs(at(neighbour) - target),
      `a withdrawal of ${neighbour} lands closer to ${target} than ${value} does`,
    ).toBeGreaterThanOrEqual(miss);
  }
  return neighbours;
};

/** Solves, then re-runs the calculator with the returned withdrawal merged in */
const roundTrip = (
  props: InvestmentCalculatorProps,
  target: number,
  track: DisplayTrack = "nominal",
  max?: number,
) => {
  const solution = solveForTarget(props, target, track, max);
  const rerun = finalValue(
    { ...props, monthlyWithdrawal: withdrawalOf(props, solution) },
    track,
  );
  expect(rerun).toBe(solution.achieved);
  return solution;
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15)); // Jan 15 local time -> month = 0
});

afterAll(() => {
  vi.useRealTimers();
});

describe("solveForTarget - the withdrawal is the only lever", () => {
  const advanced = makeProps({
    monthlyContribution: 300,
    monthlyWithdrawal: 150,
    withdrawalStartYear: 2,
  });
  const noWithdrawal = finalValue({ ...advanced, monthlyWithdrawal: 0 });

  it("raises the withdrawal for a target below the projection", () => {
    const target = Math.floor(finalValue(advanced) * 0.7);
    const solution = roundTrip(advanced, target);

    expect(solution.monthlyWithdrawal).toBeGreaterThan(
      advanced.monthlyWithdrawal,
    );
    expect(Number.isInteger(solution.monthlyWithdrawal)).toBe(true);
    expect(solution.capped).toBe(false);
    expect(expectStepOptimal(advanced, target, solution)).toHaveLength(2);
  });

  it("cuts the withdrawal for a target above the projection", () => {
    const target = Math.floor(noWithdrawal * 0.95);
    const solution = roundTrip(advanced, target);

    expect(solution.monthlyWithdrawal).toBeLessThan(advanced.monthlyWithdrawal);
    expect(solution.monthlyWithdrawal).toBeGreaterThan(0);
    expect(solution.capped).toBe(false);
    expect(expectStepOptimal(advanced, target, solution)).toHaveLength(2);
  });

  it("returns the withdrawal and nothing else the plan could be changed by", () => {
    // The whole contract in one assertion: a solution carries no return, no
    // contribution, no horizon - only the withdrawal, the balance it reaches
    // and whether it capped. A lever added here is a lever the hub would
    // write into the user's sliders.
    const target = Math.floor(finalValue(advanced) * 0.7);
    const solution = solveForTarget(advanced, target, "nominal");
    expect(Object.keys(solution).sort()).toEqual([
      "achieved",
      "capped",
      "monthlyWithdrawal",
    ]);
  });

  it("solves against the inflation-adjusted balance when asked", () => {
    const inflating = makeProps({
      monthlyContribution: 300,
      inflationPct: 2.5,
    });
    const target = Math.floor(finalValue(inflating, "real") * 0.6);
    const solution = roundTrip(inflating, target, "real");

    expect(solution.monthlyWithdrawal).toBeGreaterThan(0);
    expect(solution.capped).toBe(false);
    expect(expectStepOptimal(inflating, target, solution, "real")).toHaveLength(
      2,
    );
  });

  it("solves over a fractional horizon", () => {
    const partial = makeProps({
      yearsOfGrowth: 7.5,
      monthlyContribution: 400,
      monthlyWithdrawal: 100,
      withdrawalStartYear: 2.5,
    });
    const target = Math.floor(finalValue(partial) * 0.8);
    const solution = roundTrip(partial, target);

    expect(solution.monthlyWithdrawal).toBeGreaterThan(
      partial.monthlyWithdrawal,
    );
    expect(solution.capped).toBe(false);
    expect(expectStepOptimal(partial, target, solution)).toHaveLength(2);
  });

  it("searches the span the lane's own control offers", () => {
    // A $3M pot drawn at 4% needs more than the default $10,000/mo span, and
    // the lane widens its control to fit; the solver searches that span
    const rich = makeProps({ initialAmount: 3_000_000, yearsOfGrowth: 20 });
    const target = finalValue({ ...rich, monthlyWithdrawal: 15_000 });

    const wide = roundTrip(rich, target, "nominal", 25_000);
    expect(wide.monthlyWithdrawal).toBe(15_000);
    expect(wide.capped).toBe(false);

    const narrow = roundTrip(rich, target);
    expect(narrow.monthlyWithdrawal).toBe(MAX_MONTHLY_WITHDRAWAL);
    expect(narrow.capped).toBe(true);
  });
});

describe("solveForTarget - a target the withdrawal cannot reach", () => {
  const advanced = makeProps({
    monthlyContribution: 300,
    monthlyWithdrawal: 150,
    withdrawalStartYear: 2,
  });
  const noWithdrawal = finalValue({ ...advanced, monthlyWithdrawal: 0 });

  it("zeroes the withdrawal and reports capped above the no-withdrawal balance", () => {
    const solution = roundTrip(advanced, noWithdrawal + 1_000_000);

    expect(solution.monthlyWithdrawal).toBe(0);
    expect(solution.capped).toBe(true);
    // The plan reaches its best, and the goal is reported as missed rather
    // than being replaced by that best
    expect(solution.achieved).toBe(noWithdrawal);
  });

  it("pins the withdrawal at the ceiling and reports capped below its reach", () => {
    const rich = makeProps({ initialAmount: 10_000_000 });
    const solution = roundTrip(rich, 1000);

    expect(solution.monthlyWithdrawal).toBe(MAX_MONTHLY_WITHDRAWAL);
    expect(solution.capped).toBe(true);
    expect(solution.achieved).toBeGreaterThan(1000);
  });

  it("does not report capped when a bound lands exactly on the target", () => {
    const solution = roundTrip(advanced, noWithdrawal);
    expect(solution.monthlyWithdrawal).toBe(0);
    expect(solution.capped).toBe(false);
    expect(solution.achieved).toBe(noWithdrawal);
  });

  it("leaves a withdrawal the plan ignores alone rather than pinning it", () => {
    const inert = makeProps({
      yearsOfGrowth: 20,
      monthlyContribution: 500,
      monthlyWithdrawal: 400,
      withdrawalStartYear: 20,
    });
    const base = finalValue(inert);
    expect(
      finalValue({ ...inert, monthlyWithdrawal: MAX_MONTHLY_WITHDRAWAL }),
    ).toBe(base);

    for (const target of [Math.floor(base * 0.5), Math.floor(base * 1.5)]) {
      const solution = solveForTarget(inert, target, "nominal");
      // The slider stays where the user left it: moving it changes nothing
      // about the outcome, and the goal is simply out of reach
      expect(solution.monthlyWithdrawal).toBeUndefined();
      expect(solution.capped).toBe(true);
      expect(solution.achieved).toBe(base);
    }
  });

  it("does not move a withdrawal already sitting on the helpful bound", () => {
    const unspent = makeProps({ monthlyContribution: 300 });
    const solution = solveForTarget(
      unspent,
      finalValue(unspent) * 2,
      "nominal",
    );
    expect(solution.monthlyWithdrawal).toBeUndefined();
    expect(solution.capped).toBe(true);
  });
});

describe("solveForTarget - cleared and degenerate targets", () => {
  const advanced = makeProps({
    monthlyContribution: 300,
    monthlyWithdrawal: 150,
  });

  it("moves nothing for a target of 0", () => {
    const solution = solveForTarget(advanced, 0, "nominal");
    expect(solution).toEqual({ achieved: finalValue(advanced), capped: false });
  });

  it("moves nothing for a negative or non-numeric target", () => {
    for (const target of [-5000, NaN, Infinity]) {
      const solution = solveForTarget(advanced, target, "nominal");
      expect(solution.monthlyWithdrawal).toBeUndefined();
      expect(solution.capped).toBe(false);
    }
  });

  it("moves nothing when the projection already sits on the target", () => {
    const solution = solveForTarget(advanced, finalValue(advanced), "nominal");
    expect(solution.monthlyWithdrawal).toBeUndefined();
    expect(solution.capped).toBe(false);
  });
});

describe("solveForTarget - a plan that runs dry", () => {
  /**
   * Spends the ceiling every month from day one and is empty within two
   * years of its 30-year horizon. Its balance used to run millions of dollars
   * negative and compound there, which made every bisection against it
   * meaningless; the floored balance is what the solve converges against.
   */
  const draining = makeProps({
    initialAmount: 10000,
    yearsOfGrowth: 30,
    monthlyWithdrawal: MAX_MONTHLY_WITHDRAWAL,
    withdrawalStartYear: 0,
  });

  it("converges against the floored balance instead of a negative one", () => {
    expect(finalValue(draining)).toBe(0);
    const target = 5000;
    const solution = roundTrip(draining, target);

    // A small withdrawal leaves $5,000 of a $10,000 pot after 30 years of
    // growth, so the solve lands rather than capping
    expect(solution.monthlyWithdrawal).toBeGreaterThan(0);
    expect(solution.monthlyWithdrawal).toBeLessThan(MAX_MONTHLY_WITHDRAWAL);
    expect(solution.capped).toBe(false);
    expect(expectStepOptimal(draining, target, solution)).toHaveLength(2);
  });

  it("still caps honestly above the no-withdrawal balance", () => {
    const ceiling = noWithdrawalBalance(draining, "nominal");
    const solution = roundTrip(draining, ceiling + 1_000_000);
    expect(solution.monthlyWithdrawal).toBe(0);
    expect(solution.capped).toBe(true);
    expect(solution.achieved).toBe(ceiling);
  });
});

describe("solveForTarget - what step optimality can claim", () => {
  it("fails a solution that sits one dollar off the best one", () => {
    // The point of the check: unlike a tolerance the solver itself defines,
    // it can actually fail. Both neighbours of the committed withdrawal are
    // in range, and stepping onto either one is worse
    const spending = makeProps({
      monthlyContribution: 300,
      monthlyWithdrawal: 150,
      withdrawalStartYear: 2,
    });
    const target = Math.floor(finalValue(spending) * 0.7);
    const solution = solveForTarget(spending, target, "nominal");
    const committed = solution.monthlyWithdrawal as number;

    expect(expectStepOptimal(spending, target, solution)).toEqual([
      committed - 1,
      committed + 1,
    ]);

    for (const drift of [-1, 1]) {
      const off = { ...solution, monthlyWithdrawal: committed + drift };
      expect(() => expectStepOptimal(spending, target, off)).toThrow();
    }
  });

  it("skips a neighbouring dollar outside the slider range", () => {
    const advanced = makeProps({
      monthlyContribution: 300,
      monthlyWithdrawal: 200,
    });
    // Solving for exactly the no-withdrawal balance bisects onto 0, where
    // there is no dollar below to compare against
    const unspent = finalValue({ ...advanced, monthlyWithdrawal: 0 });
    const atFloor = solveForTarget(advanced, unspent, "nominal");
    expect(atFloor.monthlyWithdrawal).toBe(0);
    expect(expectStepOptimal(advanced, unspent, atFloor)).toEqual([1]);
  });
});

describe("noWithdrawalBalance", () => {
  const advanced = makeProps({
    monthlyContribution: 300,
    monthlyWithdrawal: 200,
  });

  it("is the plan's own ending balance with the withdrawal set to 0", () => {
    expect(noWithdrawalBalance(advanced, "nominal")).toBe(
      finalValue({ ...advanced, monthlyWithdrawal: 0 }),
    );
    expect(noWithdrawalBalance(advanced, "nominal")).toBeGreaterThan(
      finalValue(advanced),
    );
  });

  it("moves no other input: the return and contribution stay the user's", () => {
    // What the old ceiling did - every lever at its most favourable bound -
    // is exactly what this must never be: the same plan at a 30% return
    // reaches a figure this ceiling does not approach
    const ceiling = noWithdrawalBalance(advanced, "nominal");
    expect(ceiling).toBeLessThan(
      finalValue({ ...advanced, monthlyWithdrawal: 0, projectedGain: 30 }),
    );
    expect(ceiling).toBeLessThan(
      finalValue({
        ...advanced,
        monthlyWithdrawal: 0,
        monthlyContribution: 5000,
      }),
    );
  });

  it("agrees with a solve at the very top of the range", () => {
    const ceiling = noWithdrawalBalance(advanced, "nominal");
    const solution = solveForTarget(advanced, ceiling, "nominal");
    expect(solution.monthlyWithdrawal).toBe(0);
    expect(solution.capped).toBe(false);
    expect(solution.achieved).toBe(ceiling);
  });

  it("measures the inflation-adjusted ceiling when asked", () => {
    const inflating = makeProps({ inflationPct: 2.5 });
    expect(noWithdrawalBalance(inflating, "real")).toBeLessThan(
      noWithdrawalBalance(inflating, "nominal"),
    );
  });
});
