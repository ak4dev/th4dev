/* ==================================================
 * Monthly Growth Matrix Interpolation
 * ================================================== */

import { addMonths } from "date-fns";
import type { LineGraphEntry } from "../types/types";

/**
 * Linearly interpolates a year-by-year growth matrix into monthly data points.
 *
 * The calculator already runs month-by-month internally but only surfaces yearly
 * snapshots. Linear interpolation between yearly data points is a close-enough
 * approximation for display purposes (true compound growth curves are only very
 * slightly non-linear over a single year interval).
 *
 * @param yearly - Yearly growth matrix from InvestmentCalculator.getGrowthMatrix()
 * @returns Monthly data points starting from the same origin date
 */
export function interpolateMonthly(yearly: LineGraphEntry[]): LineGraphEntry[] {
  if (yearly.length < 2) return yearly;

  const result: LineGraphEntry[] = [];

  for (let i = 0; i < yearly.length - 1; i++) {
    const from = yearly[i];
    const to = yearly[i + 1];

    for (let m = 0; m < 12; m++) {
      const t = m / 12;
      result.push({
        x: addMonths(from.x, m),
        y: Math.floor(from.y + (to.y - from.y) * t),
        alternateY: Math.floor(
          from.alternateY + (to.alternateY - from.alternateY) * t,
        ),
      });
    }
  }

  // Include the final year-end data point exactly
  result.push(yearly[yearly.length - 1]);

  return result;
}
