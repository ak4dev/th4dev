/* ==================================================
 * Solve for Required Monthly Withdrawal
 * ================================================== */

import { InvestmentCalculator } from "./investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../types/types";

/** Bisection iterations: 20 halvings of the $10,000 ceiling resolve to under a cent */
const ITERATIONS = 20;

/**
 * Binary-searches for the fixed monthly withdrawal (0 to maxMonthlyWithdrawal)
 * that causes InvestmentCalculator to produce `targetValue` as its final
 * balance, with all other props (including projectedGain) held constant. Any
 * dynamic withdrawal policy is ignored while solving, since the result is a
 * fixed amount.
 *
 * Higher withdrawal -> lower ending balance, so the function is monotonically
 * decreasing in withdrawal. Returns 0 when the target is at or above the
 * 0-withdrawal result, or outside advanced mode (where withdrawals are inert);
 * returns maxMonthlyWithdrawal when even the ceiling cannot bring the balance
 * down to the target.
 *
 * @param props        - Full InvestmentCalculatorProps (gain % is NOT modified)
 * @param targetValue  - Desired ending portfolio value in USD
 * @param showInflation - Whether to evaluate against the inflation-adjusted result
 * @returns Monthly withdrawal in USD, rounded to the nearest dollar
 */
export function solveForWithdrawal(
  props: InvestmentCalculatorProps,
  targetValue: number,
  showInflation: boolean,
): number {
  if (targetValue < 0 || !props.advanced) return 0;

  const finalValue = (monthlyWithdrawal: number) =>
    new InvestmentCalculator({
      ...props,
      dynamicWithdrawal: undefined,
      monthlyWithdrawal,
    }).calculateGrowth(showInflation).numeric;

  if (finalValue(0) <= targetValue) return 0;

  let lo = 0;
  let hi = props.maxMonthlyWithdrawal;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (finalValue(mid) > targetValue) lo = mid;
    else hi = mid;
  }

  return Math.min(Math.round((lo + hi) / 2), props.maxMonthlyWithdrawal);
}
