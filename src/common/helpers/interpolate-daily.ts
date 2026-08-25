/* ==================================================
 * Daily Growth Matrix Interpolation
 * ================================================== */

import { addDays, differenceInCalendarDays } from "date-fns";
import type { LineGraphEntry } from "../types/types";

/**
 * Linearly interpolates between two consecutive monthly data points to
 * produce one entry per calendar day from `from` up to (not including) `to`.
 * The span is the real number of days between the two rows, so rows anchored
 * late in a month (e.g. Jan 31 -> Feb 28) neither overshoot nor fall short of
 * the next row.
 *
 * @param from  - The data point at the start of the month
 * @param to    - The next monthly data point
 * @returns     - One LineGraphEntry per day before `to`
 */
export function interpolateDailyForMonth(
  from: LineGraphEntry,
  to: LineGraphEntry,
): LineGraphEntry[] {
  const days = Math.max(1, differenceInCalendarDays(to.x, from.x));
  const result: LineGraphEntry[] = [];

  for (let d = 0; d < days; d++) {
    const t = d / days;
    result.push({
      x: addDays(from.x, d),
      y: Math.floor(from.y + (to.y - from.y) * t),
      alternateY: Math.floor(
        from.alternateY + (to.alternateY - from.alternateY) * t,
      ),
    });
  }

  return result;
}
