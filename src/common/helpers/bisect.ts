/* ==================================================
 * Bisection Search
 * ================================================== */

/**
 * Bisection iterations. Twenty halvings shrink the bracket to 2^-20 (about one
 * millionth) of its starting width, which is finer than the step every caller
 * snaps to. The widest bracket any lever can present is the monthly withdrawal
 * range, whose ceiling the plan may raise as far as $1,000,000, and even that
 * lands within a dollar of the true root; the $10,000 default ceiling lands
 * within a cent, and the narrower contribution (0-5000) and gain (0-30) ranges
 * resolve far finer still.
 */
const ITERATIONS = 20;

/**
 * Binary-searches a monotonic `evaluate` for the input that produces `target`.
 * The two bounds are given by which side of the target they land on rather
 * than by their numeric order, so the same loop serves both an increasing and
 * a decreasing function.
 *
 * Precondition: `evaluate` must be strictly monotonic across [over, under].
 * The test is `evaluate(mid) > target`, so a result equal to the target counts
 * as under it, and a function that never moves is read as one whose root sits
 * at a bound: a flat result above the target walks the bracket down to `under`
 * and returns it, a flat result at or below the target walks it up to `over`.
 * Either way the answer is a bound rather than a signal, so a caller that can
 * produce a flat function - a withdrawal that starts after the horizon ends,
 * say - has to detect that case before bisecting. It is the caller's bug to
 * prevent, not something this loop can report.
 *
 * @param evaluate - Monotonic function of the input being solved for
 * @param over     - Input whose result is at or above `target`
 * @param under    - Input whose result is at or below `target`
 * @param target   - Result the returned input should produce
 * @returns The (unrounded) input midway through the final bracket
 */
export function bisect(
  evaluate: (input: number) => number,
  over: number,
  under: number,
  target: number,
): number {
  let hi = over;
  let lo = under;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (hi + lo) / 2;
    if (evaluate(mid) > target) hi = mid;
    else lo = mid;
  }
  return (hi + lo) / 2;
}
