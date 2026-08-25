/* ==================================================
 * Capital Preservation Schedule Rows
 * ================================================== */

import type { LineGraphEntry } from "../types/types";
import { interpolateMonthly } from "./interpolate-monthly";
import { MONTHS_PER_YEAR } from "../constants/app-constants";

export type ScheduleGranularity = "yearly" | "monthly";

/**
 * Builds the schedule timeline so that row index == years (or months) from
 * today. `InvestmentCalculator.getGrowthMatrix()[k]` is the balance at the end
 * of year k+1 — there is no today entry — so a synthetic year-0 row holding
 * the lane's starting balance is prepended before any interpolation.
 */
export function buildScheduleMatrix(
  growthMatrix: LineGraphEntry[],
  initialValue: number,
  granularity: ScheduleGranularity,
  today: Date = new Date(),
): LineGraphEntry[] {
  const base: LineGraphEntry[] = [
    { x: today, y: initialValue, alternateY: initialValue },
    ...growthMatrix,
  ];
  return granularity === "monthly" ? interpolateMonthly(base) : base;
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
