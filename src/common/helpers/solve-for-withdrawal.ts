/* ==================================================
 * Solve for Required Monthly Withdrawal
 * ================================================== */

import { InvestmentCalculator } from "./investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../types/types";

/** Bisection iterations — 52 gives sub-cent precision */
const ITERATIONS = 52;

/**
 * Binary-searches for the monthly withdrawal amount that causes
 * InvestmentCalculator to produce exactly `targetValue` as its final balance,
 * with all other props (including projectedGain) held constant.
 *
 * Higher withdrawal → lower ending balance, so the function is monotonically
 * decreasing in withdrawal. If the target exceeds the 0-withdrawal result the
 * target is unreachable; returns 0 in that case.
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
  if (targetValue < 0) return 0;

  // If even 0 withdrawal can't reach the target, the target is above projection
  const atZero = new InvestmentCalculator({ ...props, monthlyWithdrawal: 0 });
  if (atZero.calculateGrowth(showInflation).numeric <= targetValue) {
    return 0;
  }

  // Upper bound: use the maximum allowed monthly withdrawal as the ceiling so
  // the binary search can find the withdrawal that drains the portfolio to 0.
  const ceiling = props.maxMonthlyWithdrawal;

  const atCeiling = new InvestmentCalculator({
    ...props,
    monthlyWithdrawal: ceiling,
  });
  const floorResult = atCeiling.calculateGrowth(showInflation).numeric;

  let lo = 0;
  let hi = floorResult >= targetValue ? ceiling * 2 : ceiling;

  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const calc = new InvestmentCalculator({ ...props, monthlyWithdrawal: mid });
    const result = calc.calculateGrowth(showInflation).numeric;
    // More withdrawal → lower result; we want result ≈ targetValue
    if (result > targetValue) lo = mid;
    else hi = mid;
  }

  return Math.round((lo + hi) / 2);
}
