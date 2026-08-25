/* ==================================================
 * Solve for Required Monthly Withdrawal
 * ================================================== */

import { InvestmentCalculator } from "./investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../types/types";

/** Bisection iterations: 20 halvings of the $10,000 ceiling resolve to under a cent */
const ITERATIONS = 20;

/**
 * Binary-searches a monotonic `evaluate` for the input that produces `target`.
 * The two bounds are given by which side of the target they land on rather
 * than by their numeric order, so the same loop serves both an increasing and
 * a decreasing function.
 *
 * @param evaluate - Monotonic function of the input being solved for
 * @param over     - Input whose result is at or above `target`
 * @param under    - Input whose result is at or below `target`
 * @param target   - Result the returned input should produce
 * @returns The (unrounded) input midway through the final bracket
 */
export function bisect(
  evaluate: (input: number) => number,
  over: number,
  under: number,
  target: number,
): number {
  let hi = over;
  let lo = under;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (hi + lo) / 2;
    if (evaluate(mid) > target) hi = mid;
    else lo = mid;
  }
  return (hi + lo) / 2;
}

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

  // Higher withdrawal -> lower balance, so 0 is the "over" bound
  const solved = bisect(finalValue, 0, props.maxMonthlyWithdrawal, targetValue);

  return Math.min(Math.round(solved), props.maxMonthlyWithdrawal);
}
