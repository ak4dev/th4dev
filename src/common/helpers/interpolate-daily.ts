/* ==================================================
 * Daily Growth Matrix Interpolation
 * ================================================== */

import { addDays } from "date-fns/addDays";
import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";
import type { LineGraphEntry } from "../types/types";

/**
 * Linearly interpolates between two consecutive monthly data points to
 * produce one entry per calendar day from `from` up to (not including) `to`.
 * The span is the real number of days between the two rows, so rows anchored
 * late in a month (e.g. Jan 31 -> Feb 28) neither overshoot nor fall short of
 * the next row.
 *
 * Both tracks are carried through: each is interpolated on its own, so a
 * daily row still holds the same nominal/real pair the monthly rows do.
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
      nominal: Math.floor(from.nominal + (to.nominal - from.nominal) * t),
      real: Math.floor(from.real + (to.real - from.real) * t),
    });
  }

  return result;
}
