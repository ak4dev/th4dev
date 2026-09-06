/* ==================================================
 * Chart Y-Axis Domain
 *
 * How far the projection chart's y-axis extends when a
 * goal sits above everything the plan reaches. Kept
 * apart from the chart so the rule can be tested without
 * rendering one.
 * ================================================== */

/**
 * A goal is drawn no higher than this multiple of the highest plotted
 * balance. The axis used to follow the goal wherever it went, so a
 * $100,000,000 goal on a $200,000 plan squashed both lines into the bottom
 * pixel of the plot; at four times the balances the plan stays legible and
 * the goal is still visibly above it.
 */
export const TARGET_HEADROOM = 4;

export interface ChartYAxis {
  /** Top of the y-axis domain, padding included */
  max: number;
  /** Highest y a goal's reference line is drawn at */
  cap: number;
}

/**
 * The y-axis for a set of plotted balances and the goals drawn over them.
 *
 * @param rowsMax - The highest balance (or band) plotted in any row
 * @param targets - Every goal to draw; undefined or non-positive ones are not drawn
 * @param padding - Multiplier applied above the highest thing drawn (1.05 = 5%)
 */
export function chartYAxis(
  rowsMax: number,
  targets: readonly (number | undefined)[],
  padding: number,
): ChartYAxis {
  const plotted = Math.max(0, rowsMax);
  // With nothing plotted there is nothing to squash: the goal sets the axis
  const cap = plotted > 0 ? plotted * TARGET_HEADROOM : Infinity;
  const drawn = targets
    .filter((t): t is number => t !== undefined && t > 0)
    .map((t) => Math.min(t, cap));
  return { max: Math.max(plotted, ...drawn) * padding, cap };
}

/** Where a goal's reference line is drawn: at the goal, or pinned to the cap */
export const targetLineY = (value: number, cap: number): number =>
  Math.min(value, cap);
