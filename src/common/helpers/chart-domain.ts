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

/**
 * A Monte Carlo cone is drawn no higher than this multiple of the plan itself
 * - the deterministic lines and the simulated median.
 *
 * Same failure as TARGET_HEADROOM, arriving through a different door. The
 * axis followed the P90 edge of the cone, and a lognormal's upper decile runs
 * away from its own median: switching Monte Carlo on compressed the plan's
 * own line from 205px to 7.5px of a 215px plot. The chart still drew every
 * series; it just drew the ones the user came for inside a hairline at the
 * bottom.
 *
 * 8 rather than TARGET_HEADROOM's 4, because a cone is not a goal. Measured
 * over 48 plans (10-61 years x sigma 12-30, with and without withdrawals) the
 * P90 edge sits at a median of 4.2x the plan and a p90 of 10.3x, so a cap of
 * 4 would bind on 54% of charts and routinely hide the cone that is the whole
 * point of running the simulation. 8 binds on 19% - the sigma 25-30 runs past
 * 40 years, which are exactly the charts that are unreadable today - and
 * leaves the plan line at least 27px.
 *
 * What is lost is the TOP of a right-skewed cone, which is the least
 * decision-relevant part of it: the plan line, the median, and the P10 edge
 * that answers "do I run out" all stay on the chart, and the tooltip still
 * reports the true P90 at every point.
 */
export const BAND_HEADROOM = 8;

export interface ChartYAxis {
  /** Top of the y-axis domain, padding included */
  max: number;
  /** Highest y a goal's reference line is drawn at */
  cap: number;
}

/**
 * The y-axis for a set of plotted balances and the goals drawn over them.
 *
 * Three things compete for the axis and only one of them is the plan: the
 * plan's own lines, a goal that may sit far above them, and a simulated cone
 * whose upper edge outruns both. Each of the other two is bounded against the
 * plan rather than allowed to set the axis on its own.
 *
 * @param rowsMax - The highest PLAN value in any row: the deterministic lines
 *   and the simulated median, but not the edge of a band
 * @param targets - Every goal to draw; undefined or non-positive ones are not drawn
 * @param padding - Multiplier applied above the highest thing drawn (1.05 = 5%)
 * @param bandsMax - The highest band edge plotted, if a simulation is on. It
 *   is bounded by BAND_HEADROOM; defaulting it to 0 leaves a chart with no
 *   bands scaled exactly as it was before cones existed.
 */
export function chartYAxis(
  rowsMax: number,
  targets: readonly (number | undefined)[],
  padding: number,
  bandsMax = 0,
): ChartYAxis {
  const plan = Math.max(0, rowsMax);
  // With nothing plotted there is nothing to squash: the cone, and then the
  // goal, set the axis between them
  const band =
    plan > 0
      ? Math.min(Math.max(0, bandsMax), plan * BAND_HEADROOM)
      : Math.max(0, bandsMax);
  const plotted = Math.max(plan, band);
  const cap = plotted > 0 ? plotted * TARGET_HEADROOM : Infinity;
  const drawn = targets
    .filter((t): t is number => t !== undefined && t > 0)
    .map((t) => Math.min(t, cap));
  return { max: Math.max(plotted, ...drawn) * padding, cap };
}

/** Where a goal's reference line is drawn: at the goal, or pinned to the cap */
export const targetLineY = (value: number, cap: number): number =>
  Math.min(value, cap);
