import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { solveForTarget, maxAchievable } from "../solve-for-target";
import type { TargetLever, TargetSolution } from "../solve-for-target";
import { InvestmentCalculator } from "../investment-growth-calculator";
import {
  MAX_MONTHLY_CONTRIBUTION,
  MAX_MONTHLY_WITHDRAWAL,
  MAX_PROJECTED_GAIN,
} from "../../constants/app-constants";
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

const FIXED_LEVERS: TargetLever[] = [
  "monthlyWithdrawal",
  "monthlyContribution",
  "projectedGain",
];
const DYNAMIC_LEVERS: TargetLever[] = ["monthlyContribution", "projectedGain"];
const BASIC_LEVERS: TargetLever[] = ["projectedGain"];

/** Which way the ending balance moves when a lever is raised */
const LEVER_SLOPE: Record<TargetLever, 1 | -1> = {
  monthlyWithdrawal: -1,
  monthlyContribution: 1,
  projectedGain: 1,
};

/** Granularity of each lever's slider, which is all the solver can commit to */
const LEVER_STEP: Record<TargetLever, number> = {
  monthlyWithdrawal: 1,
  monthlyContribution: 1,
  projectedGain: 0.01,
};

/** Top of each lever's slider range; all three bottom out at 0 */
const LEVER_MAX: Record<TargetLever, number> = {
  monthlyWithdrawal: MAX_MONTHLY_WITHDRAWAL,
  monthlyContribution: MAX_MONTHLY_CONTRIBUTION,
  projectedGain: MAX_PROJECTED_GAIN,
};

/** What expectStepOptimal actually asserted, so its guards can be tested */
interface StepOptimality {
  /** The bisected lever, or null when the cascade bisected none */
  lever: TargetLever | null;
  /** In-range neighbouring steps that were compared against the solution */
  neighbours: number[];
}

/**
 * Asserts the solution is step-optimal: moving the bisected lever one slider
 * step either way lands no closer to the target. That is the best a stepped
 * lever can do, and - unlike a tolerance on |achieved - target| - it cannot be
 * satisfied by the very predicate solve-for-target uses to decide `clamped`,
 * so the suite is no longer measuring the solver against itself.
 *
 * The bisected lever is the last one in the cascade that moved: a lever that
 * cannot close the gap on its own is pinned at a bound and the cascade walks
 * on, and the solver returns the moment one lever is bisected.
 *
 * Two cases are skipped rather than asserted, and reported so a caller can
 * check that they were:
 *  (a) A neighbour outside the lever's slider range is never evaluated - a
 *      withdrawal solved to 0 has no -1 step, a contribution at its ceiling
 *      has no +1 - because the solver could not have committed to one either.
 *  (b) A solve that bisected nothing claims nothing. A lever the cascade
 *      pinned never spanned the target: the balance falls short even at the
 *      bound that helps most, so "no step lands closer" says nothing about it.
 *      The same goes for a solve that moved no lever at all.
 */
const expectStepOptimal = (
  props: InvestmentCalculatorProps,
  target: number,
  solution: TargetSolution,
  levers: readonly TargetLever[],
  track: DisplayTrack = "nominal",
): StepOptimality => {
  const skipped: StepOptimality = { lever: null, neighbours: [] };
  const lever =
    levers
      .filter((candidate) => solution.values[candidate] !== undefined)
      .pop() ?? null;
  if (lever === null) return skipped;

  const solved = { ...props, ...solution.values };
  const at = (value: number) =>
    finalValue({ ...solved, [lever]: value }, track);
  const max = LEVER_MAX[lever];
  const step = LEVER_STEP[lever];
  const rising = target > finalValue(props, track);

  // (b) the bound of this lever that pushes the balance toward the target
  const helpful = rising === LEVER_SLOPE[lever] > 0 ? max : 0;
  const atHelpful = at(helpful);
  if (rising ? atHelpful < target : atHelpful > target) return skipped;

  const value = solution.values[lever] as number;
  const miss = Math.abs(at(value) - target);
  const neighbours = [value - step, value + step]
    .map((neighbour) => Number(neighbour.toFixed(step < 1 ? 2 : 0)))
    .filter((neighbour) => neighbour >= 0 && neighbour <= max); // (a)
  for (const neighbour of neighbours) {
    expect(
      Math.abs(at(neighbour) - target),
      `${lever} at ${neighbour} lands closer to ${target} than ${value} does`,
    ).toBeGreaterThanOrEqual(miss);
  }
  return { lever, neighbours };
};

/** Solves, then re-runs the calculator with the returned levers merged in */
const roundTrip = (
  props: InvestmentCalculatorProps,
  target: number,
  levers: TargetLever[],
  track: DisplayTrack = "nominal",
) => {
  const solution = solveForTarget(props, target, track, levers);
  const rerun = finalValue({ ...props, ...solution.values }, track);
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
  // A basic-mode lane as the hub resolves it: no withdrawal, and only
  // projectedGain offered as a lever.
  const basic = makeProps({ monthlyContribution: 250 });

  it("lowers projectedGain for a target below the projection", () => {
    const target = Math.floor(finalValue(basic) * 0.6);
    const solution = roundTrip(basic, target, BASIC_LEVERS);

    expect(Object.keys(solution.values)).toEqual(["projectedGain"]);
    expect(solution.values.projectedGain).toBeLessThan(basic.projectedGain);
    expect(solution.clamped).toBe(false);
    const stepped = expectStepOptimal(basic, target, solution, BASIC_LEVERS);
    expect(stepped.lever).toBe("projectedGain");
  });

  it("raises projectedGain for a target above the projection", () => {
    const target = Math.floor(finalValue(basic) * 1.8);
    const solution = roundTrip(basic, target, BASIC_LEVERS);

    expect(solution.values.projectedGain).toBeGreaterThan(basic.projectedGain);
    expect(solution.values.projectedGain).toBeLessThanOrEqual(
      MAX_PROJECTED_GAIN,
    );
    expect(solution.clamped).toBe(false);
    const stepped = expectStepOptimal(basic, target, solution, BASIC_LEVERS);
    expect(stepped.lever).toBe("projectedGain");
  });

  it("rounds projectedGain to 2 decimals", () => {
    const target = Math.floor(finalValue(basic) * 0.77);
    const { values } = roundTrip(basic, target, BASIC_LEVERS);
    const gain = values.projectedGain as number;
    expect(Number(gain.toFixed(2))).toBe(gain);
  });

  it("leaves a withdrawal alone when the plan has none to move", () => {
    // Which levers are legal is the caller's call: the hub hands over only
    // projectedGain in basic mode AND resolves the plan's cash flows there, so
    // a basic-mode plan reaches the solver with monthlyWithdrawal already 0.
    // Handing it the full lever list must not invent a withdrawal to raise the
    // balance, because raising one cannot help a target above the projection.
    const target = Math.floor(finalValue(basic) * 1.8);
    const solution = roundTrip(basic, target, FIXED_LEVERS);

    expect(solution.values.monthlyWithdrawal).toBeUndefined();
    const stepped = expectStepOptimal(basic, target, solution, FIXED_LEVERS);
    expect(stepped.lever).toBe("monthlyContribution");
  });
});

describe("solveForTarget - advanced with fixed withdrawals", () => {
  const advanced = makeProps({
    monthlyContribution: 300,
    monthlyWithdrawal: 150,
    withdrawalStartYear: 2,
  });
  const noWithdrawal = finalValue({ ...advanced, monthlyWithdrawal: 0 });

  it("spends the surplus through monthlyWithdrawal when the target is below", () => {
    const target = Math.floor(finalValue(advanced) * 0.7);
    const solution = roundTrip(advanced, target, FIXED_LEVERS);

    expect(Object.keys(solution.values)).toEqual(["monthlyWithdrawal"]);
    expect(solution.values.monthlyWithdrawal).toBeGreaterThan(
      advanced.monthlyWithdrawal,
    );
    expect(Number.isInteger(solution.values.monthlyWithdrawal)).toBe(true);
    expect(solution.clamped).toBe(false);
    const stepped = expectStepOptimal(advanced, target, solution, FIXED_LEVERS);
    expect(stepped.lever).toBe("monthlyWithdrawal");
  });

  it("cuts the withdrawal back first for a small shortfall", () => {
    const target = Math.floor(noWithdrawal * 0.95);
    const solution = roundTrip(advanced, target, FIXED_LEVERS);

    expect(Object.keys(solution.values)).toEqual(["monthlyWithdrawal"]);
    expect(solution.values.monthlyWithdrawal).toBeLessThan(
      advanced.monthlyWithdrawal,
    );
    expect(solution.values.monthlyWithdrawal).toBeGreaterThan(0);
    expect(solution.clamped).toBe(false);
    const stepped = expectStepOptimal(advanced, target, solution, FIXED_LEVERS);
    expect(stepped.lever).toBe("monthlyWithdrawal");
  });

  it("zeroes the withdrawal, then raises monthlyContribution", () => {
    const target = Math.floor(noWithdrawal * 1.6);
    const solution = roundTrip(advanced, target, FIXED_LEVERS);

    expect(solution.values.monthlyWithdrawal).toBe(0);
    expect(solution.values.monthlyContribution).toBeGreaterThan(
      advanced.monthlyContribution,
    );
    expect(solution.values.monthlyContribution).toBeLessThan(
      MAX_MONTHLY_CONTRIBUTION,
    );
    expect(solution.values.projectedGain).toBeUndefined();
    expect(solution.clamped).toBe(false);
    const stepped = expectStepOptimal(advanced, target, solution, FIXED_LEVERS);
    expect(stepped.lever).toBe("monthlyContribution");
  });

  it("pins withdrawal and contribution at their bounds before raising the gain", () => {
    const maxContribution = finalValue({
      ...advanced,
      monthlyWithdrawal: 0,
      monthlyContribution: MAX_MONTHLY_CONTRIBUTION,
    });
    const target = Math.floor(maxContribution * 1.5);
    const solution = roundTrip(advanced, target, FIXED_LEVERS);

    expect(solution.values.monthlyWithdrawal).toBe(0);
    expect(solution.values.monthlyContribution).toBe(MAX_MONTHLY_CONTRIBUTION);
    expect(solution.values.projectedGain).toBeGreaterThan(
      advanced.projectedGain,
    );
    expect(solution.clamped).toBe(false);
    const stepped = expectStepOptimal(advanced, target, solution, FIXED_LEVERS);
    expect(stepped.lever).toBe("projectedGain");
  });

  it("solves against the inflation-adjusted balance when asked", () => {
    const inflating = makeProps({
      monthlyContribution: 300,
      inflationPct: 2.5,
    });
    const target = Math.floor(finalValue(inflating, "real") * 0.6);
    const solution = roundTrip(inflating, target, FIXED_LEVERS, "real");

    expect(solution.clamped).toBe(false);
    const stepped = expectStepOptimal(
      inflating,
      target,
      solution,
      FIXED_LEVERS,
      "real",
    );
    expect(stepped.lever).toBe("monthlyWithdrawal");
  });
});

describe("solveForTarget - advanced with a dynamic withdrawal policy", () => {
  const dynamic = makeProps({
    monthlyContribution: 1000,
    withdrawalStartYear: 3,
    dynamicWithdrawal: {
      ratePct: 4,
      floor: 0,
      ceiling: MAX_MONTHLY_WITHDRAWAL,
    },
  });

  it("lowers monthlyContribution for a target below the projection", () => {
    const target = Math.floor(finalValue(dynamic) * 0.75);
    const solution = roundTrip(dynamic, target, DYNAMIC_LEVERS);

    expect(Object.keys(solution.values)).toEqual(["monthlyContribution"]);
    expect(solution.values.monthlyContribution).toBeLessThan(
      dynamic.monthlyContribution,
    );
    expect(solution.clamped).toBe(false);
    const stepped = expectStepOptimal(
      dynamic,
      target,
      solution,
      DYNAMIC_LEVERS,
    );
    expect(stepped.lever).toBe("monthlyContribution");
  });

  it("zeroes the contribution, then lowers projectedGain", () => {
    const target = Math.floor(
      finalValue({ ...dynamic, monthlyContribution: 0 }) * 0.6,
    );
    const solution = roundTrip(dynamic, target, DYNAMIC_LEVERS);

    expect(solution.values.monthlyContribution).toBe(0);
    expect(solution.values.projectedGain).toBeLessThan(dynamic.projectedGain);
    expect(solution.clamped).toBe(false);
    const stepped = expectStepOptimal(
      dynamic,
      target,
      solution,
      DYNAMIC_LEVERS,
    );
    expect(stepped.lever).toBe("projectedGain");
  });

  it("raises monthlyContribution, then projectedGain, for a target above", () => {
    const near = Math.floor(finalValue(dynamic) * 1.4);
    const nearSolution = roundTrip(dynamic, near, DYNAMIC_LEVERS);
    expect(Object.keys(nearSolution.values)).toEqual(["monthlyContribution"]);
    expect(nearSolution.values.monthlyContribution).toBeGreaterThan(
      dynamic.monthlyContribution,
    );
    expect(
      expectStepOptimal(dynamic, near, nearSolution, DYNAMIC_LEVERS).lever,
    ).toBe("monthlyContribution");

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
    expect(
      expectStepOptimal(dynamic, far, farSolution, DYNAMIC_LEVERS).lever,
    ).toBe("projectedGain");
  });

  it("keeps the policy in force while solving, rather than neutralising it", () => {
    const withoutPolicy = makeProps({
      ...dynamic,
      dynamicWithdrawal: undefined,
    });
    const target = Math.floor(finalValue(dynamic) * 1.3);

    const withPolicy = solveForTarget(
      dynamic,
      target,
      "nominal",
      DYNAMIC_LEVERS,
    );
    const plain = solveForTarget(
      withoutPolicy,
      target,
      "nominal",
      DYNAMIC_LEVERS,
    );
    expect(withPolicy.values.monthlyContribution).not.toBe(
      plain.values.monthlyContribution,
    );

    // The re-run still takes the policy's withdrawals
    const calculator = new InvestmentCalculator({
      ...dynamic,
      ...withPolicy.values,
    });
    calculator.calculateGrowth();
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
      withdrawalStartYear: 2.5,
    });
    const target = Math.floor(finalValue(partial) * 1.35);
    const solution = roundTrip(partial, target, FIXED_LEVERS);

    expect(solution.values.monthlyContribution).toBeGreaterThan(
      partial.monthlyContribution,
    );
    expect(solution.clamped).toBe(false);
    const stepped = expectStepOptimal(partial, target, solution, FIXED_LEVERS);
    expect(stepped.lever).toBe("monthlyContribution");
  });
});

describe("solveForTarget - a target that cannot be reached", () => {
  const advanced = makeProps({ monthlyContribution: 300 });

  it("clamps to the best achievable value with every lever at its bound", () => {
    const ceiling = maxAchievable(advanced, "nominal", FIXED_LEVERS);
    const solution = solveForTarget(
      advanced,
      ceiling + 1_000_000,
      "nominal",
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
    const rich = makeProps({ initialAmount: 10_000_000 });
    const solution = solveForTarget(rich, 1000, "nominal", [
      "monthlyWithdrawal",
    ]);

    expect(solution.clamped).toBe(true);
    expect(solution.values.monthlyWithdrawal).toBe(MAX_MONTHLY_WITHDRAWAL);
    expect(solution.achieved).toBeGreaterThan(1000);
    expect(finalValue({ ...rich, ...solution.values })).toBe(solution.achieved);
  });

  it("clamps when there is no lever to move at all", () => {
    const solution = solveForTarget(advanced, 1_000_000, "nominal", []);
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
      withdrawalStartYear: 20,
    });
    const base = finalValue(inert);
    expect(
      finalValue({ ...inert, monthlyWithdrawal: MAX_MONTHLY_WITHDRAWAL }),
    ).toBe(base);

    const solution = solveForTarget(inert, Math.floor(base * 0.5), "nominal", [
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
      withdrawalStartYear: 30,
    });
    const target = Math.floor(finalValue(inert) * 1.5);
    const solution = solveForTarget(inert, target, "nominal", FIXED_LEVERS);

    expect(solution.values.monthlyWithdrawal).toBeUndefined();
    expect(solution.values.monthlyContribution).toBeGreaterThan(
      inert.monthlyContribution,
    );
    const stepped = expectStepOptimal(inert, target, solution, FIXED_LEVERS);
    expect(stepped.lever).toBe("monthlyContribution");
  });
});

describe("solveForTarget - the deflated track under a dynamic policy", () => {
  // The real track is the one nominal balance deflated by (1 + i)^-t, a fixed
  // positive factor at a given horizon, so it rises and falls with the nominal
  // balance and the bisection's monotonicity assumption holds on both tracks.
  // A solve can still miss when the reachable range does not span the target,
  // and it must own up to that rather than report an exact solve.
  const extreme = makeProps({
    initialAmount: 10000,
    monthlyContribution: 500,
    yearsOfGrowth: 30,
    inflationPct: 10,
    withdrawalStartYear: 0,
    dynamicWithdrawal: {
      ratePct: 20,
      floor: 0,
      ceiling: MAX_MONTHLY_WITHDRAWAL,
    },
  });

  it("stays monotonic in projectedGain on the deflated track", () => {
    const at = (projectedGain: number) =>
      finalValue({ ...extreme, projectedGain }, "real");
    expect(at(MAX_PROJECTED_GAIN)).toBeGreaterThan(at(0));
  });

  it("deflates the nominal track by exactly (1 + i)^-years", () => {
    const nominal = finalValue(extreme, "nominal");
    const real = finalValue(extreme, "real");
    const deflator = Math.pow(
      1 + extreme.inflationPct / 100,
      -extreme.yearsOfGrowth,
    );
    expect(real).toBeCloseTo(nominal * deflator, -1);
  });

  it("never reports a bisected miss as an exact solve", () => {
    for (const target of [509, 3000, 25_000]) {
      const solution = solveForTarget(extreme, target, "real", DYNAMIC_LEVERS);
      const rerun = finalValue({ ...extreme, ...solution.values }, "real");
      expect(rerun).toBe(solution.achieved);
      if (!solution.clamped) {
        // An unclamped solve here bisected something, so the step check has
        // to have run: naming the lever keeps the guards from quietly
        // turning this case into a no-op
        const stepped = expectStepOptimal(
          extreme,
          target,
          solution,
          DYNAMIC_LEVERS,
          "real",
        );
        expect(stepped.lever).toBe("monthlyContribution");
      }
    }
  });

  it("reports a solve that visibly misses as clamped", () => {
    // The only case that exercises the bisected-miss branch of `clamped`
    // (solve-for-target.ts's `Math.abs(achieved - target) > ...`). The three
    // targets above all became reachable once the deflated track was made
    // monotonic, so without a target the lever genuinely cannot land on,
    // that predicate has no coverage and the hub's " (capped)" suffix could
    // be wrong with a green suite.
    //
    // Asserted as "a double-digit relative miss must be reported", not as the
    // 0.5% threshold the solver itself defines, so the test does not restate
    // the thing it is checking.
    const target = 21;
    const solution = solveForTarget(extreme, target, "real", DYNAMIC_LEVERS);
    expect(solution.clamped).toBe(true);
    expect(Math.abs(solution.achieved - target) / target).toBeGreaterThan(0.05);
  });
});

describe("solveForTarget - cleared and degenerate targets", () => {
  const advanced = makeProps({ monthlyContribution: 300 });

  it("moves nothing for a target of 0", () => {
    const solution = solveForTarget(advanced, 0, "nominal", FIXED_LEVERS);
    expect(solution.values).toEqual({});
    expect(solution.clamped).toBe(false);
    expect(solution.achieved).toBe(finalValue(advanced));
  });

  it("moves nothing for a negative or non-numeric target", () => {
    expect(
      solveForTarget(advanced, -5000, "nominal", FIXED_LEVERS).values,
    ).toEqual({});
    expect(
      solveForTarget(advanced, NaN, "nominal", FIXED_LEVERS).values,
    ).toEqual({});
  });

  it("moves nothing when the projection already sits on the target", () => {
    const solution = solveForTarget(
      advanced,
      finalValue(advanced),
      "nominal",
      FIXED_LEVERS,
    );
    expect(solution.values).toEqual({});
    expect(solution.clamped).toBe(false);
  });
});

/**
 * A plan that spends the ceiling every month from day one and is empty well
 * before its 30-year horizon. Its balance used to run millions of dollars
 * negative and compound there, which made the projection, the ceiling and
 * every bisection against them meaningless.
 */
const DRAINING = makeProps({
  initialAmount: 10000,
  yearsOfGrowth: 30,
  monthlyContribution: 0,
  withdrawalStartYear: 0,
  dynamicWithdrawal: {
    ratePct: 4,
    floor: MAX_MONTHLY_WITHDRAWAL,
    ceiling: MAX_MONTHLY_WITHDRAWAL,
  },
});

describe("solveForTarget - a plan that runs dry", () => {
  it("converges against the floored balance instead of a negative one", () => {
    expect(finalValue(DRAINING)).toBe(0);
    const ceiling = maxAchievable(DRAINING, "nominal", DYNAMIC_LEVERS);
    const target = Math.floor(ceiling / 2);
    const solution = roundTrip(DRAINING, target, DYNAMIC_LEVERS);

    // Contributions alone can carry the plan to half the ceiling, so the
    // solve lands on the target rather than reporting a clamp
    expect(solution.values.monthlyContribution).toBeGreaterThan(0);
    expect(solution.clamped).toBe(false);
    const stepped = expectStepOptimal(
      DRAINING,
      target,
      solution,
      DYNAMIC_LEVERS,
    );
    expect(stepped.lever).toBe("monthlyContribution");
  });

  it("still clamps honestly above the ceiling", () => {
    const ceiling = maxAchievable(DRAINING, "nominal", DYNAMIC_LEVERS);
    const solution = solveForTarget(
      DRAINING,
      ceiling + 1_000_000,
      "nominal",
      DYNAMIC_LEVERS,
    );

    expect(solution.clamped).toBe(true);
    expect(solution.achieved).toBe(ceiling);
  });
});

describe("solveForTarget - what step optimality can claim", () => {
  const advanced = makeProps({
    monthlyContribution: 300,
    monthlyWithdrawal: 200,
  });

  it("claims nothing about a solve that bisected no lever", () => {
    const target = maxAchievable(advanced, "nominal", FIXED_LEVERS) + 1_000_000;
    const solution = solveForTarget(advanced, target, "nominal", FIXED_LEVERS);

    // Every lever is pinned at the bound that helps most and the target is
    // still out of reach, so none of them was bisected onto anything and
    // there is no step to be optimal about
    expect(solution.clamped).toBe(true);
    expect(solution.values.projectedGain).toBe(MAX_PROJECTED_GAIN);
    const pinned = expectStepOptimal(advanced, target, solution, FIXED_LEVERS);
    expect(pinned).toEqual({ lever: null, neighbours: [] });

    // A cleared goal moves nothing at all, which is the same skip
    const cleared = solveForTarget(advanced, 0, "nominal", FIXED_LEVERS);
    expect(expectStepOptimal(advanced, 0, cleared, FIXED_LEVERS)).toEqual({
      lever: null,
      neighbours: [],
    });
  });

  it("fails a solution that sits one slider step off the best one", () => {
    // The point of the check: unlike a tolerance the solver itself defines,
    // it can actually fail. Both neighbours of the committed withdrawal are
    // in range, and stepping onto either one is worse
    const spending = makeProps({
      monthlyContribution: 300,
      monthlyWithdrawal: 150,
      withdrawalStartYear: 2,
    });
    const target = Math.floor(finalValue(spending) * 0.7);
    const solution = solveForTarget(spending, target, "nominal", FIXED_LEVERS);
    const committed = solution.values.monthlyWithdrawal as number;

    expect(
      expectStepOptimal(spending, target, solution, FIXED_LEVERS).neighbours,
    ).toEqual([committed - 1, committed + 1]);

    for (const drift of [-1, 1]) {
      const off = {
        ...solution,
        values: { monthlyWithdrawal: committed + drift },
      };
      expect(() =>
        expectStepOptimal(spending, target, off, FIXED_LEVERS),
      ).toThrow();
    }
  });

  it("skips a neighbouring step outside the lever's slider range", () => {
    // Solving for exactly the ceiling bisects the gain onto its own maximum,
    // where there is no step above to compare against
    const ceiling = maxAchievable(advanced, "nominal", FIXED_LEVERS);
    const atTop = solveForTarget(advanced, ceiling, "nominal", FIXED_LEVERS);

    expect(atTop.values.projectedGain).toBe(MAX_PROJECTED_GAIN);
    expect(expectStepOptimal(advanced, ceiling, atTop, FIXED_LEVERS)).toEqual({
      lever: "projectedGain",
      neighbours: [Number((MAX_PROJECTED_GAIN - 0.01).toFixed(2))],
    });

    // The bottom of a range behaves the same way: a withdrawal bisected onto
    // 0 has no step below it
    const unspent = finalValue({ ...advanced, monthlyWithdrawal: 0 });
    const atFloor = solveForTarget(advanced, unspent, "nominal", FIXED_LEVERS);

    expect(atFloor.values.monthlyWithdrawal).toBe(0);
    const stepped = expectStepOptimal(advanced, unspent, atFloor, FIXED_LEVERS);
    expect(stepped).toEqual({ lever: "monthlyWithdrawal", neighbours: [1] });
  });
});

describe("maxAchievable", () => {
  const advanced = makeProps({
    monthlyContribution: 300,
    monthlyWithdrawal: 200,
  });

  it("agrees with a solve at the very top of the range", () => {
    const ceiling = maxAchievable(advanced, "nominal", FIXED_LEVERS);
    const solution = solveForTarget(advanced, ceiling, "nominal", FIXED_LEVERS);

    expect(solution.clamped).toBe(false);
    expect(solution.achieved).toBe(ceiling);
    expect(solution.values.monthlyWithdrawal).toBe(0);
    expect(solution.values.monthlyContribution).toBe(MAX_MONTHLY_CONTRIBUTION);
    expect(solution.values.projectedGain).toBe(MAX_PROJECTED_GAIN);
  });

  it("is the ceiling: nothing above it is reachable", () => {
    const ceiling = maxAchievable(advanced, "nominal", FIXED_LEVERS);
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
    const gainOnly = maxAchievable(advanced, "nominal", BASIC_LEVERS);
    expect(gainOnly).toBe(
      finalValue({ ...advanced, projectedGain: MAX_PROJECTED_GAIN }),
    );
    expect(gainOnly).toBeLessThan(
      maxAchievable(advanced, "nominal", FIXED_LEVERS),
    );
  });

  it("ignores a withdrawal lever the plan has already zeroed", () => {
    // How a basic-mode plan actually arrives: the hub resolved the mode at the
    // boundary, so the withdrawal is 0 and its helpful bound for a maximum is
    // also 0. Offering the lever therefore changes nothing.
    const resolved = makeProps({ monthlyWithdrawal: 0 });
    expect(maxAchievable(resolved, "nominal", FIXED_LEVERS)).toBe(
      maxAchievable(resolved, "nominal", DYNAMIC_LEVERS),
    );
  });

  it("stays non-negative when a dynamic policy drains the plan", () => {
    const ceiling = maxAchievable(DRAINING, "nominal", DYNAMIC_LEVERS);

    // The plan on its own is empty long before its horizon; the levers can
    // still refill it, and neither figure is allowed below zero any more
    expect(finalValue(DRAINING)).toBe(0);
    expect(ceiling).toBeGreaterThan(0);
  });

  it("measures the inflation-adjusted ceiling when asked", () => {
    const inflating = makeProps({ inflationPct: 2.5 });
    expect(maxAchievable(inflating, "real", FIXED_LEVERS)).toBeLessThan(
      maxAchievable(inflating, "nominal", FIXED_LEVERS),
    );
  });
});
