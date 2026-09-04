/* ==================================================
 * Portfolio Lane
 *
 * The shape the Portfolio panel reads one investment
 * lane through, and the mapping from a built Lane onto
 * it.
 *
 * Its own module rather than an export of the panel: the
 * calculator page used to import the panel's internals to
 * build one, so a page reached inside a panel to learn
 * what that panel wanted. Both sides now depend on this
 * boundary instead of on each other.
 * ================================================== */

import type { Lane } from "../../common/helpers/lane-model";
import type { DisplayTrack, LineGraphEntry } from "../../common/types/types";

/**
 * Inputs the panel needs from one investment lane. The hub builds one for
 * Investment A and, while advanced mode is on, one for Investment B.
 */
export interface PortfolioLane {
  /**
   * Portfolio value today — the calculator's starting amount. Every required
   * price is derived from it, so the projection chart, the target prices and
   * the preservation schedule all share one base.
   */
  portfolioValue: number;
  /**
   * Effective monthly withdrawal in USD. With dynamic withdrawal on this is
   * a representative amount (the first scheduled withdrawal), not a slider.
   */
  monthlyWithdrawal: number;
  /** Annual projected gain percentage (e.g. 10 for 10%) */
  projectedGain: number;
  /** Year offset at which withdrawals begin */
  withdrawalStartYear: number;
  /** Number of years to project forward */
  years: number;
  /** InvestmentCalculator.getGrowthMatrix() — entry 0 is today + 1 year */
  growthMatrix: LineGraphEntry[];
  /**
   * InvestmentCalculator.getMonthlyMatrix() — the balance the engine actually
   * recorded each month. The monthly schedule prints these rather than a
   * straight line drawn between year ends, which is biased wherever the plan
   * has cash flows.
   */
  monthlyMatrix: LineGraphEntry[];
  /** Which of the matrix's two tracks the schedule reads */
  track: DisplayTrack;
}

/** One built lane, as the Portfolio panel reads it */
export const portfolioLane = (l: Lane): PortfolioLane => ({
  portfolioValue: l.initialAmount,
  monthlyWithdrawal: l.withdrawals[0] ?? 0,
  projectedGain: l.plan.projectedGain,
  withdrawalStartYear: l.plan.withdrawalStartYear,
  years: l.plan.yearsOfGrowth,
  growthMatrix: l.matrix,
  monthlyMatrix: l.monthlyMatrix,
  track: l.track,
});
