/* ==================================================
 * Solve for Target Ending Balance
 * ================================================== */

import { InvestmentCalculator } from "./investment-growth-calculator";
import { bisect } from "./solve-for-withdrawal";
import {
  MAX_MONTHLY_CONTRIBUTION,
  MAX_PROJECTED_GAIN,
} from "../constants/app-constants";
import type { InvestmentCalculatorProps } from "../types/types";

/** Inputs the target solver is allowed to move, in cascade order */
export type TargetLever =
  "monthlyWithdrawal" | "monthlyContribution" | "projectedGain";

export interface TargetSolution {
  /** Only the levers that moved, ready to merge into the slider map */
  values: Partial<Record<TargetLever, number>>;
  /** Ending balance the solution actually reaches (=== target unless clamped) */
  achieved: number;
  /** True when `achieved` missed the request: every lever hit its bound, or the bisected one could not land on it */
  clamped: boolean;
}

/**
 * Direction the ending balance moves when the lever is raised. It holds for
 * the nominal track always, and for the inflation-adjusted track except under
 * a dynamic withdrawal policy, which sizes its draw off the nominal balance
 * and can therefore shrink the deflated track as the gain rises.
 */
const LEVER_SLOPE: Record<TargetLever, 1 | -1> = {
  monthlyWithdrawal: -1,
  monthlyContribution: 1,
  projectedGain: 1,
};

/** Granularity the stored value is rounded to, matching what the sliders show */
const LEVER_STEP: Record<TargetLever, number> = {
  monthlyWithdrawal: 1,
  monthlyContribution: 1,
  projectedGain: 0.01,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Slider range of a lever; the withdrawal ceiling travels in the props */
function leverRange(
  props: InvestmentCalculatorProps,
  lever: TargetLever,
): { min: number; max: number } {
  if (lever === "monthlyWithdrawal") {
    return { min: 0, max: props.maxMonthlyWithdrawal };
  }
  if (lever === "monthlyContribution") {
    return { min: 0, max: MAX_MONTHLY_CONTRIBUTION };
  }
  return { min: 0, max: MAX_PROJECTED_GAIN };
}

/**
 * The requested levers, de-duplicated and with `monthlyWithdrawal` dropped
 * outside advanced mode, where the calculator ignores it entirely.
 */
function usableLevers(
  props: InvestmentCalculatorProps,
  levers: readonly TargetLever[],
): TargetLever[] {
  return [...new Set(levers)].filter(
    (lever) => lever !== "monthlyWithdrawal" || props.advanced === true,
  );
}

/**
 * Snaps a solved lever to its slider granularity, choosing whichever of the
 * two neighbouring steps lands closer to the target: whole dollars cannot
 * express the exact solution, so the nearest one is the best available.
 */
function snapToStep(
  lever: TargetLever,
  raw: number,
  min: number,
  max: number,
  target: number,
  evaluateAt: (value: number) => number,
): number {
  const step = LEVER_STEP[lever];
  const decimals = step < 1 ? 2 : 0;
  const toStep = (value: number) =>
    clamp(Number((value * step).toFixed(decimals)), min, max);
  const low = toStep(Math.floor(raw / step));
  const high = toStep(Math.ceil(raw / step));
  if (low === high) return low;
  const lowMiss = Math.abs(evaluateAt(low) - target);
  const highMiss = Math.abs(evaluateAt(high) - target);
  return highMiss < lowMiss ? high : low;
}

/**
 * Solves `levers` in order so the ending balance lands on `target`.
 *
 * The ending balance is monotonic in every lever (rising with
 * monthlyContribution and projectedGain, falling with monthlyWithdrawal), so
 * each lever is bisected against a full calculator run. The first lever that
 * can close the gap on its own is the one that moves; a lever that cannot is
 * pinned at the bound that helps most and the cascade continues to the next.
 * A lever the plan ignores entirely is left alone rather than pinned.
 *
 * When every lever is exhausted the solution is clamped: the levers stay at
 * their bounds and `achieved` reports the best balance the plan can reach, so
 * the caller can store that instead of an unreachable target. A bisected
 * solve is clamped too when it misses, which the deflated track can force
 * under a dynamic policy (see LEVER_SLOPE).
 *
 * A target of 0 or less clears the goal and moves nothing. Any dynamic
 * withdrawal policy in `props` is part of the plan being solved and is left
 * untouched.
 *
 * @param props         - Full InvestmentCalculatorProps for the lane
 * @param target        - Desired ending portfolio value in USD
 * @param showInflation - Whether to solve against the inflation-adjusted result
 * @param levers        - Levers to try, in cascade order
 * @returns The levers that moved, the balance reached, and whether it clamped
 */
export function solveForTarget(
  props: InvestmentCalculatorProps,
  target: number,
  showInflation: boolean,
  levers: readonly TargetLever[],
): TargetSolution {
  const evaluate = (overrides: Partial<Record<TargetLever, number>>) =>
    new InvestmentCalculator({ ...props, ...overrides }).calculateGrowth(
      showInflation,
    ).numeric;

  const base = evaluate({});
  if (!Number.isFinite(target) || target <= 0 || target === base) {
    return { values: {}, achieved: base, clamped: false };
  }

  const rising = target > base;
  const overrides: Partial<Record<TargetLever, number>> = {};
  let balance = base;

  for (const lever of usableLevers(props, levers)) {
    const { min, max } = leverRange(props, lever);
    const current = clamp(props[lever], min, max);
    // The bound of this lever that pushes the balance toward the target
    const bound = rising === LEVER_SLOPE[lever] > 0 ? max : min;
    if (bound === current) continue;

    const atBound = evaluate({ ...overrides, [lever]: bound });
    if (rising ? atBound < target : atBound > target) {
      // A lever the calculator ignores (a withdrawal that starts after the
      // horizon ends) leaves the balance untouched: pinning it would reset the
      // user's slider for nothing
      if (atBound !== balance) {
        overrides[lever] = bound;
        balance = atBound;
      }
      continue;
    }

    const evaluateAt = (value: number) =>
      evaluate({ ...overrides, [lever]: value });
    const raw = bisect(
      evaluateAt,
      rising ? bound : current,
      rising ? current : bound,
      target,
    );
    overrides[lever] = snapToStep(lever, raw, min, max, target, evaluateAt);
    const achieved = evaluate(overrides);
    return {
      values: moved(props, overrides),
      achieved,
      // Slider granularity leaves an honest rounding miss, but a slope the
      // calculator does not honour leaves a real one: report the latter so the
      // caller stores what the plan reaches rather than what was asked for
      clamped: Math.abs(achieved - target) > Math.max(1, target * 0.005),
    };
  }

  return {
    values: moved(props, overrides),
    achieved: evaluate(overrides),
    clamped: true,
  };
}

/** Drops levers whose solved value is the one the props already carry */
function moved(
  props: InvestmentCalculatorProps,
  overrides: Partial<Record<TargetLever, number>>,
): Partial<Record<TargetLever, number>> {
  const values: Partial<Record<TargetLever, number>> = {};
  for (const [lever, value] of Object.entries(overrides) as [
    TargetLever,
    number,
  ][]) {
    if (value !== props[lever]) values[lever] = value;
  }
  return values;
}

/**
 * Highest ending balance reachable with every lever at its most favourable
 * bound: contributions and gain at their ceilings, withdrawals at 0. Levers
 * outside the list keep their prop values, so the ceiling always reflects the
 * controls the current mode actually offers.
 *
 * @param props         - Full InvestmentCalculatorProps for the lane
 * @param showInflation - Whether to measure the inflation-adjusted result
 * @param levers        - Levers the caller is willing to move
 * @returns The best ending portfolio value in USD
 */
export function maxAchievable(
  props: InvestmentCalculatorProps,
  showInflation: boolean,
  levers: readonly TargetLever[],
): number {
  const overrides: Partial<Record<TargetLever, number>> = {};
  for (const lever of usableLevers(props, levers)) {
    const { min, max } = leverRange(props, lever);
    overrides[lever] = LEVER_SLOPE[lever] > 0 ? max : min;
  }
  return new InvestmentCalculator({ ...props, ...overrides }).calculateGrowth(
    showInflation,
  ).numeric;
}
