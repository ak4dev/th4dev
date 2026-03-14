/* ==================================================
 * Daily Growth Matrix Interpolation
 * ================================================== */

import { addDays, getDaysInMonth } from "date-fns";
import type { LineGraphEntry } from "../types/types";

/**
 * Linearly interpolates between two monthly data points to produce one entry
 * per calendar day within that month.
 *
 * @param from  - The data point at the start of the month
 * @param to    - The data point at the start of the next month
 * @returns     - One LineGraphEntry per day in the month of `from`
 */
export function interpolateDailyForMonth(
  from: LineGraphEntry,
  to: LineGraphEntry,
): LineGraphEntry[] {
  const daysInMonth = getDaysInMonth(from.x);
  const result: LineGraphEntry[] = [];

  for (let d = 0; d < daysInMonth; d++) {
    const t = d / daysInMonth;
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
