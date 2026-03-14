/* ==================================================
 * Solve for Required Projected Gain
 * ================================================== */

import { InvestmentCalculator } from "./investment-growth-calculator";
import type { InvestmentCalculatorProps } from "../types/types";
import { MAX_PROJECTED_GAIN } from "../constants/app-constants";

/** Bisection iterations — 52 gives sub-cent precision */
const ITERATIONS = 52;

/**
 * Binary-searches for the annual projected gain percentage (0 – MAX_PROJECTED_GAIN)
 * that causes InvestmentCalculator to produce `targetValue` as its final balance.
 *
 * @param baseProps    - All InvestmentCalculatorProps *except* projectedGain
 * @param targetValue  - Desired ending portfolio value in USD
 * @param showInflation - Whether to evaluate against the inflation-adjusted result
 * @returns Required annual gain %, clamped to [0, MAX_PROJECTED_GAIN], rounded to 1 dp
 */
export function solveForGain(
  baseProps: Omit<InvestmentCalculatorProps, "projectedGain">,
  targetValue: number,
  showInflation: boolean,
): number {
  if (targetValue <= 0) return 0;

  // If even the maximum gain can't reach the target, return the ceiling
  const atMax = new InvestmentCalculator({
    ...baseProps,
    projectedGain: MAX_PROJECTED_GAIN,
  });
  if (atMax.calculateGrowth(showInflation).numeric < targetValue) {
    return MAX_PROJECTED_GAIN;
  }

  // If a 0% gain already exceeds the target, return 0
  const atZero = new InvestmentCalculator({ ...baseProps, projectedGain: 0 });
  if (atZero.calculateGrowth(showInflation).numeric >= targetValue) {
    return 0;
  }

  let lo = 0;
  let hi = MAX_PROJECTED_GAIN;

  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const calc = new InvestmentCalculator({ ...baseProps, projectedGain: mid });
    const result = calc.calculateGrowth(showInflation).numeric;
    if (result < targetValue) lo = mid;
    else hi = mid;
  }

  return Math.round(((lo + hi) / 2) * 10) / 10;
}
