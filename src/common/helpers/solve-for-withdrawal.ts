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
  if (targetValue <= 0) return 0;

  // If even 0 withdrawal can't reach the target, the target is above projection
  const atZero = new InvestmentCalculator({ ...props, monthlyWithdrawal: 0 });
  if (atZero.calculateGrowth(showInflation).numeric <= targetValue) {
    return 0;
  }

  // Upper bound: a very large withdrawal that will definitely reduce to target
  // Use principal + total contributions as a generous ceiling
  const months = props.yearsOfGrowth * 12;
  const principal = parseFloat(props.currentAmount || "0");
  const ceiling = principal / months + props.monthlyContribution;

  const atCeiling = new InvestmentCalculator({
    ...props,
    monthlyWithdrawal: ceiling,
  });
  const floorResult = atCeiling.calculateGrowth(showInflation).numeric;

  let lo = floorResult >= targetValue ? 0 : 0;
  let hi = floorResult >= targetValue ? 0 : ceiling;

  if (hi === 0) {
    // Even the ceiling withdrawal exceeds the target — binary-search wider
    hi = ceiling * 10;
  }

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
