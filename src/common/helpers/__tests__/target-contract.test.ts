/* ==================================================
 * Target Value Contract
 *
 * The rules the Target Value control must keep, checked
 * over generated plans in every mode rather than a
 * handful of hand-picked ones. Rules 1 to 3 were each
 * broken once, by a change that passed the suite of its
 * day; the rest are the invariants that give the first
 * three their meaning.
 *
 *  1. A target moves NO input but the fixed monthly
 *     withdrawal, and that only where the withdrawal is
 *     on screen. The assumed return and the contribution
 *     are the user's own. (A solver once raised Return %
 *     to whatever closed the gap: one slider drag turned a
 *     $198,000 plan into a $5,000,000 one.)
 *  2. The goal is stored exactly as asked. (It was once
 *     replaced by the balance the plan reached, so it
 *     could not be lowered past the withdrawal's reach.)
 *  3. The slider spans THIS plan's reachable range, never
 *     a balance some other plan could reach. (It once ran
 *     to the balance at a 30% return, about $72,000,000 on
 *     the default plan, so the projection sat at 0.3% of
 *     the track.)
 *  4. Where the withdrawal is solved, a reachable goal is
 *     landed on to the dollar and an unreachable one is
 *     reported as capped, with the withdrawal at the bound
 *     that helps. The expected decision is derived here
 *     from the plan itself, never read back from the
 *     solver.
 *  5. Where the target moves nothing, the ending balance
 *     does not move either; and a stored goal on its own
 *     never changes what the plan reaches.
 *  6. A goal set to the projection on one track still
 *     reads as reached on the other after Inflated flips.
 *
 * Plans are drawn from a seeded generator, one seed per
 * mode, so a failure names the plan that produced it and
 * reproduces on every run. Change the seeds only to widen
 * the net, never to make a red run green.
 * ================================================== */

import { describe, it, expect } from "vitest";
import {
  buildLane,
  solveLaneTarget,
  targetSolvesWithdrawal,
  type Lane,
  type LaneContext,
} from "../lane-model";
import {
  InvestmentCalculator,
  toMonths,
} from "../investment-growth-calculator";
import {
  DEFAULT_INPUTS,
  DEFAULT_SLIDERS,
  DEFAULT_TOGGLES,
} from "../state-manager";
import type { SliderValues, TogglesState } from "../../types/types";

const TODAY = new Date(2026, 0, 1);

const GOAL = "targetValueA";
const WITHDRAWAL = "monthlyWithdrawalA";

/** mulberry32: a tiny seeded generator, so every run draws the same plans */
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const MODES: { name: string; toggles: Partial<TogglesState> }[] = [
  { name: "basic", toggles: {} },
  { name: "basic, inflated", toggles: { showInflation: true } },
  { name: "advanced, fixed withdrawal", toggles: { advanced: true } },
  {
    name: "advanced, fixed withdrawal, inflated, fees",
    toggles: { advanced: true, showInflation: true, fees: true },
  },
  {
    name: "advanced, dynamic policy",
    toggles: { advanced: true, dynamicWithdrawal: true },
  },
  {
    name: "advanced, dynamic policy, inflated",
    toggles: { advanced: true, dynamicWithdrawal: true, showInflation: true },
  },
];

/**
 * A plan drawn across the whole range every slider offers. Most plans
 * withdraw inside their horizon so the withdrawal has something to do; a
 * few deliberately start withdrawing at the horizon, where no setting of it
 * can move the balance, and a few store a withdrawal above the default span
 * so the widened control is exercised.
 */
const randomPlan = (
  rand: () => number,
  toggles: Partial<TogglesState>,
): LaneContext => {
  const years = Math.max(1, Math.round(rand() * 80) / 2); // 1..40, half years
  const step = (max: number, granularity = 1) =>
    Math.round((rand() * max) / granularity) * granularity;
  const withdrawalStart =
    rand() < 0.15 ? years : Math.min(years - 0.5, step(40, 0.5));
  const withdrawal = rand() < 0.15 ? 10_000 + step(20_000) : step(5000);
  const sliders: Partial<SliderValues> = {
    projectedGainA: step(15, 0.01),
    yearsOfGrowthA: years,
    monthlyContributionA: step(3000),
    contributionStopYearA: Math.min(years, step(40, 0.5)),
    monthlyWithdrawalA: withdrawal,
    withdrawalStartYearA: Math.max(0, withdrawalStart),
    withdrawalRateA: 2 + step(6, 0.1),
    withdrawalFloorA: step(1000),
    withdrawalCeilingA: 1000 + step(9000),
    annualFeeA: step(1, 0.01),
    yearlyInflation: step(6, 0.1),
    targetValueA: 0,
  };
  return {
    sliders: { ...DEFAULT_SLIDERS, ...sliders },
    inputs: {
      ...DEFAULT_INPUTS,
      currentAmountA: String(1000 + step(2_000_000)),
    },
    toggles: { ...DEFAULT_TOGGLES, ...toggles },
  };
};

/** Goals to ask of a lane: far below, around, and far above its projection */
const goalsFor = (lane: Lane): number[] => [
  ...new Set(
    [
      1,
      Math.floor(lane.total * 0.25),
      Math.floor(lane.total * 0.75),
      lane.total,
      Math.ceil(lane.total * 1.5),
      Math.ceil(lane.maxTarget * 3),
      123_456_789,
    ].filter((goal) => goal > 0),
  ),
];

const apply = (
  ctx: LaneContext,
  update: Partial<Record<string, number>>,
): LaneContext => ({
  ...ctx,
  sliders: { ...ctx.sliders, ...update } as SliderValues,
});

/** The plan's ending balance on the lane's track with the withdrawal set to `w` */
const withWithdrawal = (lane: Lane, w: number): number =>
  new InvestmentCalculator(
    { ...lane.plan, monthlyWithdrawal: w },
    TODAY,
  ).calculateGrowth()[lane.track];

const PLANS_PER_MODE = 40;

MODES.forEach((mode, modeIndex) => {
  describe(`Target Value contract: ${mode.name}`, () => {
    const rand = mulberry32(0x7448_0001 + modeIndex);
    const cases = Array.from({ length: PLANS_PER_MODE }, (_, i) => ({
      i,
      ctx: randomPlan(rand, mode.toggles),
    }));
    const toggles: TogglesState = { ...DEFAULT_TOGGLES, ...mode.toggles };
    const solves = targetSolvesWithdrawal(toggles);

    it("1. writes the goal, plus the withdrawal only where it is on screen", () => {
      for (const { i, ctx } of cases) {
        const lane = buildLane("A", ctx, TODAY);
        for (const goal of goalsFor(lane)) {
          const sliders = solveLaneTarget(lane, goal, ctx.toggles);
          const keys = Object.keys(sliders).sort();
          const why = `plan #${i} in ${mode.name}, goal ${goal}: wrote ${keys.join(", ")}`;
          expect(keys, why).toEqual(
            solves && keys.includes(WITHDRAWAL) ? [WITHDRAWAL, GOAL] : [GOAL],
          );
          // Independent of the key check: the goal is stored as its nominal
          // worth, and a solved withdrawal lies within the control's span
          expect(sliders[GOAL], why).toBe(Math.round(goal / lane.deflator));
          if (sliders[WITHDRAWAL] !== undefined) {
            expect(sliders[WITHDRAWAL], why).toBeGreaterThanOrEqual(0);
            expect(sliders[WITHDRAWAL], why).toBeLessThanOrEqual(
              lane.withdrawalMax,
            );
          }
        }
      }
    });

    it("2. stores the goal as asked, exactly, in any direction and at any distance", () => {
      for (const { i, ctx } of cases) {
        const lane = buildLane("A", ctx, TODAY);
        for (const goal of goalsFor(lane)) {
          const sliders = solveLaneTarget(lane, goal, ctx.toggles);
          const after = buildLane("A", apply(ctx, sliders), TODAY);
          const why = `plan #${i} in ${mode.name}: asked ${goal}, control shows ${after.displayTarget}`;
          // Exactly: a goal on the inflated track is stored nominal and shown
          // deflated again, and for a deflator of at most 1 that round trip
          // is exact
          expect(after.displayTarget, why).toBe(goal);
          // And the plan itself is the same plan, so nothing about it moved
          // except the withdrawal a solve may own
          expect({ ...after.plan, monthlyWithdrawal: 0 }, why).toEqual({
            ...lane.plan,
            monthlyWithdrawal: 0,
          });
        }
      }
    });

    it("3. spans this plan's own reachable range and nothing beyond it", () => {
      for (const { i, ctx } of cases) {
        const lane = buildLane("A", ctx, TODAY);
        const why = `plan #${i} in ${mode.name}`;
        // Stated independently of the lane: the plan's own balance with no
        // fixed withdrawal, simulated here
        const noWithdrawal = withWithdrawal(lane, 0);
        if (solves) {
          expect(lane.maxTarget, why).toBe(Math.max(noWithdrawal, 1));
          expect(lane.maxTarget, why).toBeGreaterThanOrEqual(lane.total);
        } else {
          expect(lane.maxTarget, why).toBe(Math.max(lane.total, 1));
        }
        // Never the balance some other plan would reach
        expect(lane.maxTarget, why).toBeLessThanOrEqual(
          Math.max(noWithdrawal, 1),
        );
      }
    });

    if (solves) {
      it("4. lands on a reachable goal to the dollar, and says so when it cannot", () => {
        for (const { i, ctx } of cases) {
          const lane = buildLane("A", ctx, TODAY);
          // The decision the solver must make, derived from the plan alone
          const hi = withWithdrawal(lane, 0);
          const lo = withWithdrawal(lane, lane.withdrawalMax);
          // The tolerance the lane is allowed: a dollar above the balance,
          // and below it one real dollar or its nominal worth at the horizon
          const fisher = Math.pow(
            1 + lane.plan.inflationPct / 100,
            -toMonths(lane.plan.yearsOfGrowth) / 12,
          );
          const above = fisher === 1 ? 0 : 1;
          const below =
            fisher === 1
              ? 0
              : lane.track === "real"
                ? 1
                : Math.ceil(1 / fisher);
          for (const goal of goalsFor(lane)) {
            const sliders = solveLaneTarget(lane, goal, ctx.toggles);
            const after = buildLane("A", apply(ctx, sliders), TODAY);
            const w = after.plan.monthlyWithdrawal;
            const why = `plan #${i} in ${mode.name}, goal ${goal}: withdrawal ${w}, reached ${after.total}, range ${lo}..${hi}`;
            if (hi === lo) {
              // The withdrawal never happens: leave the slider alone, and the
              // goal is reached or capped on the plan's own merits
              expect(sliders[WITHDRAWAL], why).toBeUndefined();
              expect(after.targetCapped, why).toBe(
                after.total + above < goal || after.total > goal + below,
              );
            } else if (goal > hi) {
              expect(w, why).toBe(0);
              expect(after.targetCapped, why).toBe(after.total + above < goal);
            } else if (goal < lo) {
              expect(w, why).toBe(lane.withdrawalMax);
              expect(after.targetCapped, why).toBe(after.total > goal + below);
            } else {
              expect(after.targetCapped, why).toBe(false);
              // Step-optimal: neither neighbouring dollar lands closer
              const miss = Math.abs(after.total - goal);
              for (const n of [w - 1, w + 1]) {
                if (n < 0 || n > lane.withdrawalMax) continue;
                expect(
                  Math.abs(withWithdrawal(lane, n) - goal),
                  why,
                ).toBeGreaterThanOrEqual(miss);
              }
            }
          }
        }
      });
    } else {
      it("5. leaves the ending balance exactly where it was, whatever goal is set", () => {
        // The S1 path: a goal that once raised the return now changes nothing
        // about what the plan reaches
        for (const { i, ctx } of cases) {
          const lane = buildLane("A", ctx, TODAY);
          for (const goal of goalsFor(lane)) {
            const after = buildLane(
              "A",
              apply(ctx, solveLaneTarget(lane, goal, ctx.toggles)),
              TODAY,
            );
            const why = `plan #${i} in ${mode.name}, goal ${goal}`;
            expect(after.total, why).toBe(lane.total);
            expect(after.plan, why).toEqual(lane.plan);
            expect(after.targetCapped, why).toBe(false);
          }
        }
      });
    }

    it("5. leaves the balance to the plan: a stored goal on its own changes nothing", () => {
      for (const { i, ctx } of cases) {
        const without = buildLane("A", ctx, TODAY);
        for (const goal of [1, 5_000_000, 123_456_789]) {
          const withGoal = buildLane("A", apply(ctx, { [GOAL]: goal }), TODAY);
          const why = `plan #${i} in ${mode.name}, stored goal ${goal}`;
          expect(withGoal.total, why).toBe(without.total);
          expect(withGoal.plan, why).toEqual(without.plan);
          expect(withGoal.maxTarget, why).toBe(without.maxTarget);
        }
      }
    });

    it("6. reads a goal set to the projection as reached on both tracks", () => {
      for (const { i, ctx } of cases) {
        const lane = buildLane("A", ctx, TODAY);
        if (lane.total <= 0) continue;
        const sliders = solveLaneTarget(lane, lane.total, ctx.toggles);
        for (const showInflation of [false, true]) {
          const flipped = buildLane(
            "A",
            {
              ...apply(ctx, sliders),
              toggles: { ...ctx.toggles, showInflation },
            },
            TODAY,
          );
          const why = `plan #${i} in ${mode.name}, viewed ${showInflation ? "inflated" : "nominal"}: goal ${flipped.displayTarget}, ending ${flipped.total}`;
          // The goal may sit at most a dollar ABOVE the balance either way,
          // and below it by one real dollar or, viewed nominal, by what one
          // real dollar is worth at the horizon: 1 / the plan's Fisher factor
          const fisher = Math.pow(
            1 + lane.plan.inflationPct / 100,
            -toMonths(lane.plan.yearsOfGrowth) / 12,
          );
          const below = showInflation ? 1 : Math.ceil(1 / fisher);
          expect(
            flipped.displayTarget - flipped.total,
            why,
          ).toBeLessThanOrEqual(1);
          expect(
            flipped.total - flipped.displayTarget,
            why,
          ).toBeLessThanOrEqual(below);
          expect(flipped.targetReached, why).toBeDefined();
          expect(flipped.targetCapped, why).toBe(false);
        }
      }
    });
  });
});

describe("Target Value contract: the default plan", () => {
  const ctx: LaneContext = {
    sliders: { ...DEFAULT_SLIDERS },
    inputs: { ...DEFAULT_INPUTS },
    toggles: { ...DEFAULT_TOGGLES },
  };

  it("ends where $10,000 at 10% for 30 years ends, and the slider spans exactly that", () => {
    const lane = buildLane("A", ctx, TODAY);
    expect(lane.total).toBe(198_373);
    expect(lane.maxTarget).toBe(198_373);
  });

  it("keeps the return at 10% and the balance at $198,373 for a goal of $5,000,000", () => {
    // The interaction behind the complaint: this drag used to raise the
    // return to 20.9% and the ending balance to $5,007,087
    const lane = buildLane("A", ctx, TODAY);
    const sliders = solveLaneTarget(lane, 5_000_000, ctx.toggles);
    expect(sliders).toEqual({ targetValueA: 5_000_000 });
    const after = buildLane("A", apply(ctx, sliders), TODAY);
    expect(after.total).toBe(198_373);
    expect(after.plan.projectedGain).toBe(10);
    expect(after.displayTarget).toBe(5_000_000);
    expect(after.targetReached).toBeUndefined();
    expect(after.targetCapped).toBe(false);
  });

  it("stores a goal of $9,000 as $9,000 and keeps the return at 10%", () => {
    // The exact interaction that used to floor the return at 0% and snap the
    // goal back to the $10,000 opening balance
    const lane = buildLane("A", ctx, TODAY);
    const sliders = solveLaneTarget(lane, 9000, ctx.toggles);
    expect(sliders).toEqual({ targetValueA: 9000 });
    const after = buildLane("A", apply(ctx, sliders), TODAY);
    expect(after.total).toBe(198_373);
    expect(after.plan.projectedGain).toBe(10);
    expect(after.displayTarget).toBe(9000);
    // Reached in the first year: $10,000 at 10% is past $9,000 from day one
    expect(after.targetReached).toBe(after.matrix[0]);
  });
});
