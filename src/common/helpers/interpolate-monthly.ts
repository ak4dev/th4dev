/* ==================================================
 * Monthly Growth Matrix Interpolation
 * ================================================== */

import { addMonths } from "date-fns/addMonths";
import { differenceInCalendarMonths } from "date-fns/differenceInCalendarMonths";
import type { LineGraphEntry } from "../types/types";

/**
 * Linearly interpolates a year-by-year growth matrix into monthly data points.
 *
 * The calculator already runs month-by-month internally but only surfaces yearly
 * snapshots. Linear interpolation between yearly data points is a close-enough
 * approximation for display purposes (true compound growth curves are only very
 * slightly non-linear over a single year interval).
 *
 * Both tracks are carried through, each interpolated on its own, so a monthly
 * row holds the same nominal/real pair the yearly rows do.
 *
 * Segments are interpolated over their actual month span, so a trailing
 * partial year (e.g. the 6-month segment of a 10.5-year horizon) produces the
 * correct number of points.
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
    const span = Math.max(1, differenceInCalendarMonths(to.x, from.x));

    for (let m = 0; m < span; m++) {
      const t = m / span;
      result.push({
        x: addMonths(from.x, m),
        nominal: Math.floor(from.nominal + (to.nominal - from.nominal) * t),
        real: Math.floor(from.real + (to.real - from.real) * t),
      });
    }
  }

  // Include the final year-end data point exactly
  result.push(yearly[yearly.length - 1]);

  return result;
}
