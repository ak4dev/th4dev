import { describe, it, expect, vi } from "vitest";
import { bisect } from "../bisect";

/** The bracket is halved this many times; nothing exports the count */
const ITERATIONS = 20;

/** Worst-case error of a returned midpoint over a bracket of `width` */
const resolution = (width: number) => width / 2 ** (ITERATIONS + 1);

describe("bisect", () => {
  it("converges on a monotonically increasing function", () => {
    // f(x) = x, so the root of f(x) = 37.5 is 37.5 itself
    const solved = bisect((x) => x, 100, 0, 37.5);
    expect(solved).toBeCloseTo(37.5, 4);
    expect(Math.abs(solved - 37.5)).toBeLessThanOrEqual(resolution(100));
  });

  it("converges on a monotonically decreasing function", () => {
    // f(x) = 1000 - 10x falls, so the OVER bound (0) is numerically below the
    // UNDER bound (100): the bracket is ordered by result, not by input
    const solved = bisect((x) => 1000 - 10 * x, 0, 100, 400);
    expect(solved).toBeCloseTo(60, 4);
    expect(Math.abs(solved - 60)).toBeLessThanOrEqual(resolution(100));
  });

  it("converges on a nonlinear monotone function", () => {
    // Ten years of compounding: solve the annual gain that doubles $1,000
    const grow = (gain: number) => 1000 * (1 + gain / 100) ** 10;
    const solved = bisect(grow, 30, 0, 2000);
    expect(solved).toBeCloseTo(2 ** 0.1 * 100 - 100, 4);
  });

  it("resolves a $10,000 bracket below a cent", () => {
    // The default monthly-withdrawal span; 20 halvings leave under $0.01
    const solved = bisect((x) => x, 10000, 0, 1234.56);
    expect(Math.abs(solved - 1234.56)).toBeLessThan(0.01);
  });

  it("resolves the widest $1,000,000 bracket within a dollar", () => {
    // The raised withdrawal ceiling. 20 halvings no longer reach a cent here,
    // which is why the ITERATIONS comment claims a dollar and not a cent - but
    // it is still far finer than the whole-dollar step the caller snaps to.
    const solved = bisect((x) => x, 1_000_000, 0, 123456.78);
    expect(Math.abs(solved - 123456.78)).toBeLessThan(1);
    expect(Math.abs(solved - 123456.78)).toBeLessThanOrEqual(
      resolution(1_000_000),
    );
  });

  it("evaluates exactly once per halving", () => {
    const evaluate = vi.fn((x: number) => x);
    bisect(evaluate, 100, 0, 37.5);
    expect(evaluate).toHaveBeenCalledTimes(ITERATIONS);
  });

  it("returns the nearer bound when the target sits outside the bracket", () => {
    // Above everything the bracket can reach: the OVER bound is the closest
    expect(bisect((x) => x, 100, 0, 200)).toBeCloseTo(100, 4);
    // Below everything: the UNDER bound is the closest
    expect(bisect((x) => x, 100, 0, -50)).toBeCloseTo(0, 4);
  });

  it("returns the under bound on a flat function above the target", () => {
    // Precondition violation: nothing moves, so every probe reads as "over"
    // and the bracket walks down to `under`. This is the inert-withdrawal case
    // callers must detect for themselves - the answer is a bound, not a root.
    expect(bisect(() => 100, 0, 10, 50)).toBeCloseTo(10, 4);
  });

  it("returns the over bound on a flat function at or below the target", () => {
    // The mirror case: `> target` is strict, so a flat result equal to the
    // target also reads as "under" and the bracket walks up to `over`
    expect(bisect(() => 10, 0, 100, 50)).toBeCloseTo(0, 4);
    expect(bisect(() => 50, 0, 100, 50)).toBeCloseTo(0, 4);
  });

  it("returns the shared value when both bounds are the same input", () => {
    const solved = bisect((x) => x, 42, 42, 0);
    expect(solved).toBe(42);
  });
});
