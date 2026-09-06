/* ==================================================
 * Solve for Target Ending Balance
 * ================================================== */

import { InvestmentCalculator } from "./investment-growth-calculator";
import { bisect } from "./bisect";
import { MAX_MONTHLY_WITHDRAWAL } from "../constants/app-constants";
import type { DisplayTrack, InvestmentCalculatorProps } from "../types/types";

/**
 * What a solve decided. The ONLY input a target may move is the fixed
 * monthly withdrawal: the assumed return, the contribution and every other
 * slider are the user's own assumptions, and a goal is not a licence to
 * rewrite them. A solver that did (it once raised Return (%) to whatever
 * closed the gap) turned a $10,000 plan into a $5,000,000 one on a single
 * slider drag and left the user asking why the ending balance had exploded.
 */
export interface TargetSolution {
  /**
   * The withdrawal to store, in whole dollars; absent when the plan already
   * carries it, or when the withdrawal has no bearing on the outcome (a plan
   * whose withdrawals start at the horizon) and moving it would reset the
   * user's slider for nothing.
   */
  monthlyWithdrawal?: number;
  /** Ending balance on `track` the plan reaches with that withdrawal */
  achieved: number;
  /**
   * True when the withdrawal hit its floor of 0 or its ceiling and the balance
   * still misses the target. The goal itself is never touched: the caller
   * stores what was asked for and reports that the plan does not reach it.
   */
  capped: boolean;
}

/** Ending balance on `track` with the fixed withdrawal set to `monthlyWithdrawal` */
const evaluateWithdrawal = (
  props: InvestmentCalculatorProps,
  track: DisplayTrack,
  monthlyWithdrawal: number,
): number =>
  new InvestmentCalculator({ ...props, monthlyWithdrawal }).calculateGrowth()[
    track
  ];

/**
 * Snaps the bisected withdrawal to whole dollars, choosing whichever of the
 * two neighbouring dollars lands closer to the target: the slider cannot
 * express the exact root, so the nearest one is the best available.
 */
function snapToDollar(
  raw: number,
  max: number,
  target: number,
  evaluateAt: (value: number) => number,
): number {
  const low = Math.max(0, Math.floor(raw));
  const high = Math.min(max, Math.ceil(raw));
  if (low === high) return low;
  const lowMiss = Math.abs(evaluateAt(low) - target);
  const highMiss = Math.abs(evaluateAt(high) - target);
  return highMiss < lowMiss ? high : low;
}

/**
 * Solves the fixed monthly withdrawal that ends the plan on `target`.
 *
 * The ending balance falls as the withdrawal rises, so the withdrawal is
 * bisected between 0 and the lane's ceiling against a full calculator run.
 * A target at or above the no-withdrawal balance sets the withdrawal to 0;
 * one below what the ceiling can spend down to sets it to the ceiling. In
 * both cases the solve reports itself capped when the balance still misses,
 * and the caller keeps the goal as typed rather than replacing it with what
 * the plan reaches - a target the plan misses is information, not an error.
 *
 * A target of 0 or less clears the goal and moves nothing. Whether the plan
 * has a fixed withdrawal to move at all is the caller's decision: basic mode
 * and a dynamic policy have no such control on screen, so the hub does not
 * call this for them and the goal is a marker alone.
 *
 * @param props  - The plan for the lane
 * @param target - Desired ending portfolio value in USD, in `track`'s units
 * @param track  - The track the goal is measured on, as the control shows it
 * @param maxMonthlyWithdrawal - Span of this lane's withdrawal control, which
 *   bounds the search. Defaults to the app's standard span.
 * @returns The withdrawal that moved, the balance reached, and whether it capped
 */
export function solveForTarget(
  props: InvestmentCalculatorProps,
  target: number,
  track: DisplayTrack,
  maxMonthlyWithdrawal: number = MAX_MONTHLY_WITHDRAWAL,
): TargetSolution {
  const evaluateAt = (value: number) => evaluateWithdrawal(props, track, value);
  const current = Math.min(
    Math.max(props.monthlyWithdrawal, 0),
    maxMonthlyWithdrawal,
  );
  const base = evaluateAt(current);
  if (!Number.isFinite(target) || target <= 0 || target === base) {
    return { achieved: base, capped: false };
  }

  const atZero = evaluateAt(0);
  const atCeiling = evaluateAt(maxMonthlyWithdrawal);
  // A withdrawal the calculator ignores (one that starts after the horizon
  // ends) leaves the balance untouched at both bounds: pinning it would reset
  // the user's slider for nothing, so the goal is simply out of reach
  if (atZero === atCeiling) {
    return { achieved: base, capped: true };
  }

  let solved: number;
  let capped = false;
  if (atZero <= target) {
    solved = 0;
    capped = atZero < target;
  } else if (atCeiling >= target) {
    solved = maxMonthlyWithdrawal;
    capped = atCeiling > target;
  } else {
    const raw = bisect(evaluateAt, 0, maxMonthlyWithdrawal, target);
    solved = snapToDollar(raw, maxMonthlyWithdrawal, target, evaluateAt);
  }

  return {
    ...(solved !== props.monthlyWithdrawal
      ? { monthlyWithdrawal: solved }
      : {}),
    achieved: evaluateAt(solved),
    capped,
  };
}

/**
 * The ending balance with no fixed withdrawal at all: the most a target can
 * ask of the withdrawal lever, and therefore the span of the Target Value
 * slider in advanced mode. Everything else in the plan stays as the user set
 * it; this is what THEIR plan reaches, not what some other plan could.
 *
 * @param props - The plan for the lane
 * @param track - The track the ceiling is measured on
 * @returns The no-withdrawal ending portfolio value in USD
 */
export function noWithdrawalBalance(
  props: InvestmentCalculatorProps,
  track: DisplayTrack,
): number {
  return evaluateWithdrawal(props, track, 0);
}
