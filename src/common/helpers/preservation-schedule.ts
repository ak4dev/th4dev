/* ==================================================
 * Capital Preservation Schedule Rows
 * ================================================== */

import type { LineGraphEntry } from "../types/types";
import { interpolateMonthly } from "./interpolate-monthly";
import { planAnchor } from "./investment-growth-calculator";
import { MONTHS_PER_YEAR } from "../constants/app-constants";

export type ScheduleGranularity = "yearly" | "monthly";

export interface ScheduleMatrixInputs {
  /**
   * Year-end checkpoints, `InvestmentCalculator.getGrowthMatrix()`: entry k
   * is the balance at the end of year k+1.
   */
  yearly: LineGraphEntry[];
  /**
   * Every simulated month, `InvestmentCalculator.getMonthlyMatrix()`: entry k
   * is the balance at the end of month k+1.
   *
   * The monthly view uses these when they are given, because they are the
   * balances the plan actually held. Without them it falls back to
   * interpolating a straight line between year ends, which is close on a
   * smooth curve but smears any mid-year step - a withdrawal that starts at
   * 0.5 years, a rollover that lands there - across the whole year.
   */
  monthly?: LineGraphEntry[];
  /** The lane's balance today, which becomes the prepended row-0 value */
  initialValue: number;
  granularity: ScheduleGranularity;
  /**
   * The plan's anchor, used to date the synthetic today row. Pass the SAME
   * anchor the matrices were simulated against; the default reads the clock
   * afresh and can disagree with them across midnight.
   */
  today?: Date;
}

/**
 * Builds the schedule timeline so that row index == years (or months) from
 * today. Neither matrix has a today entry - `[k]` is the end of period k+1 -
 * so a synthetic row-0 holding the lane's starting balance is prepended to
 * whichever one the granularity selects.
 */
export function buildScheduleMatrix({
  yearly,
  monthly,
  initialValue,
  granularity,
  today = planAnchor(),
}: ScheduleMatrixInputs): LineGraphEntry[] {
  // No time has passed at the today row, so the deflator is 1 and the two
  // tracks hold the same opening balance.
  const openingRow: LineGraphEntry = {
    x: today,
    nominal: initialValue,
    real: initialValue,
  };
  if (granularity === "yearly") return [openingRow, ...yearly];
  return monthly
    ? [openingRow, ...monthly]
    : interpolateMonthly([openingRow, ...yearly]);
}

/**
 * Row of a schedule matrix at which withdrawals start (rounded so fractional
 * years map to a real row and clamped to the last row), or -1 when they never
 * start.
 */
export function withdrawalRowIndex(
  startYear: number | undefined,
  granularity: ScheduleGranularity,
  rowCount: number,
): number {
  if (startYear == null || startYear <= 0) return -1;
  const stepsPerYear = granularity === "monthly" ? MONTHS_PER_YEAR : 1;
  return Math.min(Math.round(startYear * stepsPerYear), rowCount - 1);
}
