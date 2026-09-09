import { describe, it, expect } from "vitest";
import {
  chartYAxis,
  targetLineY,
  BAND_HEADROOM,
  TARGET_HEADROOM,
} from "../chart-domain";

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

  it("scales a chart with no bands exactly as it did before cones existed", () => {
    // The band argument defaults to 0, so every existing call site - and every
    // chart with Monte Carlo switched off - is untouched by its arrival
    expect(chartYAxis(200_000, [100_000_000], 1.05)).toEqual(
      chartYAxis(200_000, [100_000_000], 1.05, 0),
    );
    expect(chartYAxis(200_000, [], 1.05, 0).max).toBe(210_000);
  });

  it("lets a cone widen the axis until it starts flattening the plan", () => {
    // Inside BAND_HEADROOM the cone sets the axis, which is what it is for
    const inside = chartYAxis(200_000, [], 1.05, 1_000_000);
    expect(inside.max).toBe(1_050_000);
    // Past it the axis stops following. The P90 edge of a lognormal runs away
    // from its own median, and the axis followed it: switching Monte Carlo on
    // compressed the plan's own line from 205px to 7.5px of a 215px plot.
    const beyond = chartYAxis(200_000, [], 1.05, 100_000_000);
    expect(beyond.max).toBe(200_000 * BAND_HEADROOM * 1.05);
    // The plan keeps a readable share of the plot whatever the cone does
    expect(200_000 / (beyond.max / 1.05)).toBe(1 / BAND_HEADROOM);
  });

  it("measures a goal's own cap against the cone the axis actually drew", () => {
    // A goal is capped at TARGET_HEADROOM times what is plotted, and a cone
    // inside its own bound is plotted - so the two bounds compose rather than
    // one silently overriding the other
    const { cap } = chartYAxis(200_000, [100_000_000], 1.05, 800_000);
    expect(cap).toBe(800_000 * TARGET_HEADROOM);
  });

  it("still lets a cone set the axis when nothing else is plotted", () => {
    // Same rule the goal follows: with no plan to squash there is nothing to
    // protect, so the band is drawn in full rather than bounded against zero
    expect(chartYAxis(0, [], 1.05, 1_000_000).max).toBe(1_050_000);
  });
});

describe("targetLineY", () => {
  it("draws a reachable goal where it is and pins one above the cap to the cap", () => {
    expect(targetLineY(500_000, 800_000)).toBe(500_000);
    expect(targetLineY(100_000_000, 800_000)).toBe(800_000);
  });
});
