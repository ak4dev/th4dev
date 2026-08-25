import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { solveForTarget, maxAchievable } from "../solve-for-target";
import type { TargetLever } from "../solve-for-target";
import { InvestmentCalculator } from "../investment-growth-calculator";
import {
  MAX_MONTHLY_CONTRIBUTION,
  MAX_MONTHLY_WITHDRAWAL,
  MAX_PROJECTED_GAIN,
} from "../../constants/app-constants";
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
  maxMonthlyWithdrawal: MAX_MONTHLY_WITHDRAWAL,
  depreciationRate: 0,
  advanced: true,
  ...overrides,
});

const finalValue = (props: InvestmentCalculatorProps, showInflation = false) =>
  new InvestmentCalculator(props).calculateGrowth(showInflation).numeric;

const FIXED_LEVERS: TargetLever[] = [
  "monthlyWithdrawal",
  "monthlyContribution",
  "projectedGain",
];
const DYNAMIC_LEVERS: TargetLever[] = ["monthlyContribution", "projectedGain"];
const BASIC_LEVERS: TargetLever[] = ["projectedGain"];

/**
 * Committed levers are rounded to their slider granularity (whole dollars, or
 * 0.01 for the rate), and one dollar of monthly cash flow compounds into far
 * more than a dollar of ending balance over a decade, so the round trip is
 * asserted in relative terms rather than to the cent.
 */
const expectOnTarget = (actual: number, target: number) =>
  expect(Math.abs(actual - target)).toBeLessThanOrEqual(
    Math.max(1, target * 0.005),
  );

/** Solves, then re-runs the calculator with the returned levers merged in */
const roundTrip = (
  props: InvestmentCalculatorProps,
  target: number,
  levers: TargetLever[],
  showInflation = false,
) => {
  const solution = solveForTarget(props, target, showInflation, levers);
  const rerun = finalValue({ ...props, ...solution.values }, showInflation);
  expect(rerun).toBe(solution.achieved);
  return { ...solution, rerun };
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15)); // Jan 15 local time -> month = 0
});

afterAll(() => {
  vi.useRealTimers();
});

describe("solveForTarget - basic mode", () => {
  const basic = makeProps({ advanced: false, monthlyContribution: 250 });

  it("lowers projectedGain for a target below the projection", () => {
    const target = Math.floor(finalValue(basic) * 0.6);
    const { values, achieved, clamped, rerun } = roundTrip(
      basic,
      target,
      BASIC_LEVERS,
    );

    expect(Object.keys(values)).toEqual(["projectedGain"]);
    expect(values.projectedGain).toBeLessThan(basic.projectedGain);
    expect(clamped).toBe(false);
    expectOnTarget(achieved, target);
    expectOnTarget(rerun, target);
  });

  it("raises projectedGain for a target above the projection", () => {
    const target = Math.floor(finalValue(basic) * 1.8);
    const { values, achieved, clamped } = roundTrip(
      basic,
      target,
      BASIC_LEVERS,
    );

    expect(values.projectedGain).toBeGreaterThan(basic.projectedGain);
    expect(values.projectedGain).toBeLessThanOrEqual(MAX_PROJECTED_GAIN);
    expect(clamped).toBe(false);
    expectOnTarget(achieved, target);
  });

  it("rounds projectedGain to 2 decimals", () => {
    const target = Math.floor(finalValue(basic) * 0.77);
    const { values } = roundTrip(basic, target, BASIC_LEVERS);
    const gain = values.projectedGain as number;
    expect(Number(gain.toFixed(2))).toBe(gain);
  });

  it("never hands back a monthlyWithdrawal, even when asked for one", () => {
    const target = Math.floor(finalValue(basic) * 0.5);
    const { values, achieved } = roundTrip(basic, target, FIXED_LEVERS);

    expect(values.monthlyWithdrawal).toBeUndefined();
    expectOnTarget(achieved, target);
  });
});

describe("solveForTarget - advanced with fixed withdrawals", () => {
  const advanced = makeProps({
    monthlyContribution: 300,
    monthlyWithdrawal: 150,
    yearWithdrawalsBegin: 2,
  });
  const noWithdrawal = finalValue({ ...advanced, monthlyWithdrawal: 0 });

  it("spends the surplus through monthlyWithdrawal when the target is below", () => {
    const target = Math.floor(finalValue(advanced) * 0.7);
    const { values, achieved, clamped } = roundTrip(
      advanced,
      target,
      FIXED_LEVERS,
    );

    expect(Object.keys(values)).toEqual(["monthlyWithdrawal"]);
    expect(values.monthlyWithdrawal).toBeGreaterThan(
      advanced.monthlyWithdrawal,
    );
    expect(Number.isInteger(values.monthlyWithdrawal)).toBe(true);
    expect(clamped).toBe(false);
    expectOnTarget(achieved, target);
  });

  it("cuts the withdrawal back first for a small shortfall", () => {
    const target = Math.floor(noWithdrawal * 0.95);
    const { values, achieved, clamped } = roundTrip(
      advanced,
      target,
      FIXED_LEVERS,
    );

    expect(Object.keys(values)).toEqual(["monthlyWithdrawal"]);
    expect(values.monthlyWithdrawal).toBeLessThan(advanced.monthlyWithdrawal);
    expect(values.monthlyWithdrawal).toBeGreaterThan(0);
    expect(clamped).toBe(false);
    expectOnTarget(achieved, target);
  });

  it("zeroes the withdrawal, then raises monthlyContribution", () => {
    const target = Math.floor(noWithdrawal * 1.6);
    const { values, achieved, clamped } = roundTrip(
      advanced,
      target,
      FIXED_LEVERS,
    );

    expect(values.monthlyWithdrawal).toBe(0);
    expect(values.monthlyContribution).toBeGreaterThan(
      advanced.monthlyContribution,
    );
    expect(values.monthlyContribution).toBeLessThan(MAX_MONTHLY_CONTRIBUTION);
    expect(values.projectedGain).toBeUndefined();
    expect(clamped).toBe(false);
    expectOnTarget(achieved, target);
  });

  it("pins withdrawal and contribution at their bounds before raising the gain", () => {
    const maxContribution = finalValue({
      ...advanced,
      monthlyWithdrawal: 0,
      monthlyContribution: MAX_MONTHLY_CONTRIBUTION,
    });
    const target = Math.floor(maxContribution * 1.5);
    const { values, achieved, clamped } = roundTrip(
      advanced,
      target,
      FIXED_LEVERS,
    );

    expect(values.monthlyWithdrawal).toBe(0);
    expect(values.monthlyContribution).toBe(MAX_MONTHLY_CONTRIBUTION);
    expect(values.projectedGain).toBeGreaterThan(advanced.projectedGain);
    expect(clamped).toBe(false);
    expectOnTarget(achieved, target);
  });

  it("solves against the inflation-adjusted balance when asked", () => {
    const inflating = makeProps({
      monthlyContribution: 300,
      depreciationRate: 2.5,
    });
    const target = Math.floor(finalValue(inflating, true) * 0.6);
    const { achieved, clamped } = roundTrip(
      inflating,
      target,
      FIXED_LEVERS,
      true,
    );

    expect(clamped).toBe(false);
    expectOnTarget(achieved, target);
  });
});

describe("solveForTarget - advanced with a dynamic withdrawal policy", () => {
  const dynamic = makeProps({
    monthlyContribution: 1000,
    yearWithdrawalsBegin: 3,
    dynamicWithdrawal: {
      ratePct: 4,
      floor: 0,
      ceiling: MAX_MONTHLY_WITHDRAWAL,
    },
  });

  it("lowers monthlyContribution for a target below the projection", () => {
    const target = Math.floor(finalValue(dynamic) * 0.75);
    const { values, achieved, clamped } = roundTrip(
      dynamic,
      target,
      DYNAMIC_LEVERS,
    );

    expect(Object.keys(values)).toEqual(["monthlyContribution"]);
    expect(values.monthlyContribution).toBeLessThan(
      dynamic.monthlyContribution,
    );
    expect(clamped).toBe(false);
    expectOnTarget(achieved, target);
  });

  it("zeroes the contribution, then lowers projectedGain", () => {
    const target = Math.floor(
      finalValue({ ...dynamic, monthlyContribution: 0 }) * 0.6,
    );
    const { values, achieved, clamped } = roundTrip(
      dynamic,
      target,
      DYNAMIC_LEVERS,
    );

    expect(values.monthlyContribution).toBe(0);
    expect(values.projectedGain).toBeLessThan(dynamic.projectedGain);
    expect(clamped).toBe(false);
    expectOnTarget(achieved, target);
  });

  it("raises monthlyContribution, then projectedGain, for a target above", () => {
    const near = Math.floor(finalValue(dynamic) * 1.4);
    const nearSolution = roundTrip(dynamic, near, DYNAMIC_LEVERS);
    expect(Object.keys(nearSolution.values)).toEqual(["monthlyContribution"]);
    expect(nearSolution.values.monthlyContribution).toBeGreaterThan(
      dynamic.monthlyContribution,
    );
    expectOnTarget(nearSolution.achieved, near);

    const far = Math.floor(
      finalValue({
        ...dynamic,
        monthlyContribution: MAX_MONTHLY_CONTRIBUTION,
      }) * 1.4,
    );
    const farSolution = roundTrip(dynamic, far, DYNAMIC_LEVERS);
    expect(farSolution.values.monthlyContribution).toBe(
      MAX_MONTHLY_CONTRIBUTION,
    );
    expect(farSolution.values.projectedGain).toBeGreaterThan(
      dynamic.projectedGain,
    );
    expect(farSolution.clamped).toBe(false);
    expectOnTarget(farSolution.achieved, far);
  });

  it("keeps the policy in force while solving, rather than neutralising it", () => {
    const withoutPolicy = makeProps({
      ...dynamic,
      dynamicWithdrawal: undefined,
    });
    const target = Math.floor(finalValue(dynamic) * 1.3);

    const withPolicy = solveForTarget(dynamic, target, false, DYNAMIC_LEVERS);
    const plain = solveForTarget(withoutPolicy, target, false, DYNAMIC_LEVERS);
    expect(withPolicy.values.monthlyContribution).not.toBe(
      plain.values.monthlyContribution,
    );

    // The re-run still takes the policy's withdrawals
    const calculator = new InvestmentCalculator({
      ...dynamic,
      ...withPolicy.values,
    });
    calculator.calculateGrowth(false);
    expect(
      calculator.getWithdrawalSchedule().some((amount) => amount > 0),
    ).toBe(true);
  });
});

describe("solveForTarget - partial years", () => {
  it("solves over a fractional horizon", () => {
    const partial = makeProps({
      yearsOfGrowth: 7.5,
      monthlyContribution: 400,
      yearWithdrawalsBegin: 2.5,
    });
    const target = Math.floor(finalValue(partial) * 1.35);
    const { values, achieved, clamped } = roundTrip(
      partial,
      target,
      FIXED_LEVERS,
    );

    expect(values.monthlyContribution).toBeGreaterThan(
      partial.monthlyContribution,
    );
    expect(clamped).toBe(false);
    expectOnTarget(achieved, target);
  });
});

describe("solveForTarget - a target that cannot be reached", () => {
  const advanced = makeProps({ monthlyContribution: 300 });

  it("clamps to the best achievable value with every lever at its bound", () => {
    const ceiling = maxAchievable(advanced, false, FIXED_LEVERS);
    const solution = solveForTarget(
      advanced,
      ceiling + 1_000_000,
      false,
      FIXED_LEVERS,
    );

    expect(solution.clamped).toBe(true);
    expect(solution.achieved).toBe(ceiling);
    expect(solution.values.monthlyContribution).toBe(MAX_MONTHLY_CONTRIBUTION);
    expect(solution.values.projectedGain).toBe(MAX_PROJECTED_GAIN);
    expect(solution.values.monthlyWithdrawal).toBeUndefined(); // already at 0
    expect(finalValue({ ...advanced, ...solution.values })).toBe(
      solution.achieved,
    );
  });

  it("clamps downward when the only lever bottoms out", () => {
    const rich = makeProps({ currentAmount: "10000000" });
    const solution = solveForTarget(rich, 1000, false, ["monthlyWithdrawal"]);

    expect(solution.clamped).toBe(true);
    expect(solution.values.monthlyWithdrawal).toBe(MAX_MONTHLY_WITHDRAWAL);
    expect(solution.achieved).toBeGreaterThan(1000);
    expect(finalValue({ ...rich, ...solution.values })).toBe(solution.achieved);
  });

  it("clamps when there is no lever to move at all", () => {
    const solution = solveForTarget(advanced, 1_000_000, false, []);
    expect(solution.values).toEqual({});
    expect(solution.clamped).toBe(true);
    expect(solution.achieved).toBe(finalValue(advanced));
  });
});

describe("solveForTarget - levers the plan ignores", () => {
  it("leaves a withdrawal that starts at the horizon alone rather than pinning it", () => {
    const inert = makeProps({
      yearsOfGrowth: 20,
      monthlyContribution: 500,
      yearWithdrawalsBegin: 20,
    });
    const base = finalValue(inert);
    expect(
      finalValue({ ...inert, monthlyWithdrawal: MAX_MONTHLY_WITHDRAWAL }),
    ).toBe(base);

    const solution = solveForTarget(inert, Math.floor(base * 0.5), false, [
      "monthlyWithdrawal",
    ]);

    expect(solution.values).toEqual({});
    expect(solution.clamped).toBe(true);
    expect(solution.achieved).toBe(base);
  });

  it("does not zero a withdrawal the horizon never reaches while solving upward", () => {
    const inert = makeProps({
      yearsOfGrowth: 30,
      monthlyContribution: 300,
      monthlyWithdrawal: 500,
      yearWithdrawalsBegin: 30,
    });
    const solution = solveForTarget(
      inert,
      Math.floor(finalValue(inert) * 1.5),
      false,
      FIXED_LEVERS,
    );

    expect(solution.values.monthlyWithdrawal).toBeUndefined();
    expect(solution.values.monthlyContribution).toBeGreaterThan(
      inert.monthlyContribution,
    );
    expectOnTarget(solution.achieved, Math.floor(finalValue(inert) * 1.5));
  });
});

describe("solveForTarget - the deflated track under a dynamic policy", () => {
  // A dynamic policy sizes its draw off the nominal balance, so raising the
  // gain can drive the inflation-adjusted balance down: the bisection's
  // monotonicity assumption breaks and the solve must own up to the miss.
  const extreme = makeProps({
    currentAmount: "10000",
    monthlyContribution: 500,
    yearsOfGrowth: 30,
    depreciationRate: 10,
    yearWithdrawalsBegin: 0,
    dynamicWithdrawal: {
      ratePct: 20,
      floor: 0,
      ceiling: MAX_MONTHLY_WITHDRAWAL,
    },
  });

  it("is not monotonic in projectedGain there", () => {
    const at = (projectedGain: number) =>
      finalValue({ ...extreme, projectedGain }, true);
    expect(at(MAX_PROJECTED_GAIN)).toBeLessThan(at(0));
  });

  it("never reports a bisected miss as an exact solve", () => {
    for (const target of [509, 3000, 25_000]) {
      const solution = solveForTarget(extreme, target, true, DYNAMIC_LEVERS);
      const rerun = finalValue({ ...extreme, ...solution.values }, true);
      expect(rerun).toBe(solution.achieved);
      if (!solution.clamped) expectOnTarget(solution.achieved, target);
    }
  });
});

describe("solveForTarget - cleared and degenerate targets", () => {
  const advanced = makeProps({ monthlyContribution: 300 });

  it("moves nothing for a target of 0", () => {
    const solution = solveForTarget(advanced, 0, false, FIXED_LEVERS);
    expect(solution.values).toEqual({});
    expect(solution.clamped).toBe(false);
    expect(solution.achieved).toBe(finalValue(advanced));
  });

  it("moves nothing for a negative or non-numeric target", () => {
    expect(solveForTarget(advanced, -5000, false, FIXED_LEVERS).values).toEqual(
      {},
    );
    expect(solveForTarget(advanced, NaN, false, FIXED_LEVERS).values).toEqual(
      {},
    );
  });

  it("moves nothing when the projection already sits on the target", () => {
    const solution = solveForTarget(
      advanced,
      finalValue(advanced),
      false,
      FIXED_LEVERS,
    );
    expect(solution.values).toEqual({});
    expect(solution.clamped).toBe(false);
  });
});

describe("maxAchievable", () => {
  const advanced = makeProps({
    monthlyContribution: 300,
    monthlyWithdrawal: 200,
  });

  it("agrees with a solve at the very top of the range", () => {
    const ceiling = maxAchievable(advanced, false, FIXED_LEVERS);
    const solution = solveForTarget(advanced, ceiling, false, FIXED_LEVERS);

    expect(solution.clamped).toBe(false);
    expect(solution.achieved).toBe(ceiling);
    expect(solution.values.monthlyWithdrawal).toBe(0);
    expect(solution.values.monthlyContribution).toBe(MAX_MONTHLY_CONTRIBUTION);
    expect(solution.values.projectedGain).toBe(MAX_PROJECTED_GAIN);
  });

  it("is the ceiling: nothing above it is reachable", () => {
    const ceiling = maxAchievable(advanced, false, FIXED_LEVERS);
    expect(ceiling).toBe(
      finalValue({
        ...advanced,
        monthlyWithdrawal: 0,
        monthlyContribution: MAX_MONTHLY_CONTRIBUTION,
        projectedGain: MAX_PROJECTED_GAIN,
      }),
    );
    expect(ceiling).toBeGreaterThan(finalValue(advanced));
  });

  it("only moves the levers it is given", () => {
    const gainOnly = maxAchievable(advanced, false, BASIC_LEVERS);
    expect(gainOnly).toBe(
      finalValue({ ...advanced, projectedGain: MAX_PROJECTED_GAIN }),
    );
    expect(gainOnly).toBeLessThan(maxAchievable(advanced, false, FIXED_LEVERS));
  });

  it("ignores monthlyWithdrawal outside advanced mode", () => {
    const basic = makeProps({ advanced: false, monthlyWithdrawal: 500 });
    expect(maxAchievable(basic, false, FIXED_LEVERS)).toBe(
      maxAchievable(basic, false, DYNAMIC_LEVERS),
    );
  });

  it("can go non-positive when a dynamic policy drains the plan, so callers floor it", () => {
    const draining = makeProps({
      currentAmount: "10000",
      yearsOfGrowth: 30,
      monthlyContribution: 0,
      yearWithdrawalsBegin: 0,
      dynamicWithdrawal: {
        ratePct: 4,
        floor: MAX_MONTHLY_WITHDRAWAL,
        ceiling: MAX_MONTHLY_WITHDRAWAL,
      },
    });
    const ceiling = maxAchievable(draining, false, DYNAMIC_LEVERS);

    expect(ceiling).toBeLessThan(0);
    expect(Math.max(ceiling, 1)).toBe(1);
  });

  it("measures the inflation-adjusted ceiling when asked", () => {
    const inflating = makeProps({ depreciationRate: 2.5 });
    expect(maxAchievable(inflating, true, FIXED_LEVERS)).toBeLessThan(
      maxAchievable(inflating, false, FIXED_LEVERS),
    );
  });
});
