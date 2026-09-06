import { describe, it, expect } from "vitest";
import { chartYAxis, targetLineY, TARGET_HEADROOM } from "../chart-domain";

describe("chartYAxis", () => {
  it("follows the plotted balances when there is no goal", () => {
    expect(chartYAxis(200_000, [], 1.05)).toEqual({
      max: 210_000,
      cap: 200_000 * TARGET_HEADROOM,
    });
    expect(chartYAxis(200_000, [undefined, 0], 1.05).max).toBe(210_000);
  });

  it("extends to a goal within reach of the plan", () => {
    const { max } = chartYAxis(200_000, [500_000], 1.05);
    expect(max).toBe(525_000);
  });

  it("stops at the headroom for a goal far above the plan", () => {
    // A $100,000,000 goal on a $200,000 plan used to put both lines in the
    // bottom pixel of the plot
    const { max, cap } = chartYAxis(200_000, [100_000_000], 1.05);
    expect(cap).toBe(800_000);
    expect(max).toBe(840_000);
  });

  it("takes the highest of several goals, each capped on its own", () => {
    const { max, cap } = chartYAxis(100_000, [150_000, 100_000_000], 1.05);
    expect(cap).toBe(400_000);
    expect(max).toBe(420_000);
  });

  it("lets the goal set the axis when nothing is plotted", () => {
    // An empty pot with a goal: there is nothing to squash, so the axis
    // follows the goal and the line is drawn at it, as it always was
    const { max, cap } = chartYAxis(0, [1_000_000], 1.05);
    expect(cap).toBe(Infinity);
    expect(max).toBe(1_050_000);
    expect(targetLineY(1_000_000, cap)).toBe(1_000_000);
    expect(chartYAxis(-Infinity, [], 1.05).max).toBe(0);
  });
});

describe("targetLineY", () => {
  it("draws a reachable goal where it is and pins one above the cap to the cap", () => {
    expect(targetLineY(500_000, 800_000)).toBe(500_000);
    expect(targetLineY(100_000_000, 800_000)).toBe(800_000);
  });
});
