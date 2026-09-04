import { describe, it, expect } from "vitest";
import {
  buildLane,
  buildLanes,
  isDynamic,
  isRollover,
  isTool,
  laneSliderValues,
  solveLaneTarget,
  targetLevers,
  type LaneContext,
} from "../lane-model";
import {
  DEFAULT_INPUTS,
  DEFAULT_SLIDERS,
  DEFAULT_TOGGLES,
} from "../state-manager";
import {
  MAX_MONTHLY_WITHDRAWAL,
  MAX_MONTHLY_WITHDRAWAL_LIMIT,
} from "../../constants/app-constants";
import type {
  InputValues,
  SliderValues,
  TogglesState,
} from "../../types/types";

/**
 * The lane model is a pure function of the stored state and one clock, so
 * every test here states a plan and reads the answer. `today` is fixed rather
 * than read from the machine: the engine steps in whole months from it, and a
 * suite that anchors on "now" describes a different plan every day.
 */
const TODAY = new Date(2020, 0, 1);

const context = ({
  sliders = {},
  inputs = {},
  toggles = {},
}: {
  sliders?: Partial<SliderValues>;
  inputs?: Partial<InputValues>;
  toggles?: Partial<TogglesState>;
} = {}): LaneContext => ({
  sliders: { ...DEFAULT_SLIDERS, ...sliders },
  inputs: { ...DEFAULT_INPUTS, ...inputs },
  toggles: { ...DEFAULT_TOGGLES, ...toggles },
});

/** Lane A of a plan that stores every advanced input, in the given mode */
const laneA = (advanced: boolean, extra: Partial<SliderValues> = {}) =>
  buildLane(
    "A",
    context({
      inputs: { currentAmountA: "100000" },
      sliders: {
        projectedGainA: 8,
        yearsOfGrowthA: 20,
        monthlyContributionA: 1000,
        contributionStopYearA: 10,
        monthlyWithdrawalA: 500,
        withdrawalStartYearA: 5,
        annualFeeA: 1,
        ...extra,
      },
      toggles: { advanced, fees: true },
    }),
    TODAY,
  );

describe("isTool", () => {
  it("is off for every tool while the plan is in basic mode", () => {
    const t: TogglesState = {
      ...DEFAULT_TOGGLES,
      advanced: false,
      fees: true,
      rollover: true,
      dynamicWithdrawal: true,
    };
    expect(isTool(t, "fees")).toBe(false);
    expect(isRollover(t)).toBe(false);
    expect(isDynamic(t)).toBe(false);
  });

  it("is the switch's own value once Advanced is on", () => {
    const t: TogglesState = {
      ...DEFAULT_TOGGLES,
      advanced: true,
      fees: true,
      rollover: true,
    };
    expect(isTool(t, "fees")).toBe(true);
    expect(isRollover(t)).toBe(true);
    // Still off: advanced mode enables the switch, it does not turn it on
    expect(isDynamic(t)).toBe(false);
  });
});

describe("targetLevers", () => {
  const toggles = (over: Partial<TogglesState> = {}): TogglesState => ({
    ...DEFAULT_TOGGLES,
    ...over,
  });

  it("offers the assumed return alone in basic mode", () => {
    // There is no contribution or withdrawal control on screen to move
    expect(targetLevers(toggles(), false)).toEqual(["projectedGain"]);
    expect(targetLevers(toggles(), true)).toEqual(["projectedGain"]);
  });

  it("spends a surplus through the withdrawal by itself", () => {
    expect(targetLevers(toggles({ advanced: true }), true)).toEqual([
      "monthlyWithdrawal",
    ]);
  });

  it("cuts the withdrawal before raising contributions and return", () => {
    expect(targetLevers(toggles({ advanced: true }), false)).toEqual([
      "monthlyWithdrawal",
      "monthlyContribution",
      "projectedGain",
    ]);
  });

  it("drops the withdrawal lever when a dynamic policy replaces it", () => {
    const t = toggles({ advanced: true, dynamicWithdrawal: true });
    // The fixed withdrawal slider is not on screen, so the solver may not
    // move it - in either direction
    expect(targetLevers(t, false)).toEqual([
      "monthlyContribution",
      "projectedGain",
    ]);
    expect(targetLevers(t, true)).toEqual([
      "monthlyContribution",
      "projectedGain",
    ]);
  });
});

describe("laneSliderValues", () => {
  it("spreads a solution onto the named lane's keys", () => {
    expect(
      laneSliderValues("A", { monthlyWithdrawal: 0, projectedGain: 12 }),
    ).toEqual({ monthlyWithdrawalA: 0, projectedGainA: 12 });
    expect(laneSliderValues("B", { monthlyContribution: 250 })).toEqual({
      monthlyContributionB: 250,
    });
  });

  it("round-trips every lever the solver can return", () => {
    const values = {
      monthlyWithdrawal: 100,
      monthlyContribution: 200,
      projectedGain: 9,
    };
    const spread = laneSliderValues("B", values);
    expect(
      Object.entries(values).map(([lever, v]) => [`${lever}B`, v]),
    ).toEqual(Object.entries(spread));
  });
});

describe("buildLane", () => {
  it("runs none of the advanced cash flows in basic mode", () => {
    const { plan } = laneA(false);
    // Every one of these is STORED; basic mode shows none of their controls,
    // so the plan carries none of them
    expect(plan.monthlyContribution).toBe(0);
    expect(plan.monthlyWithdrawal).toBe(0);
    expect(plan.contributionStopYear).toBeUndefined();
    expect(plan.annualFeePct).toBe(0);
    // Not gated: with nothing being withdrawn the start year says nothing,
    // and it is the withdrawal itself that basic mode resolves away
    expect(plan.withdrawalStartYear).toBe(5);
  });

  it("runs all of them once Advanced is on", () => {
    const { plan } = laneA(true);
    expect(plan.monthlyContribution).toBe(1000);
    expect(plan.monthlyWithdrawal).toBe(500);
    expect(plan.contributionStopYear).toBe(10);
    expect(plan.annualFeePct).toBe(1);
  });

  it("charges no fee while the Fees tool is off", () => {
    const lane = buildLane(
      "A",
      context({
        sliders: { annualFeeA: 1 },
        toggles: { advanced: true, fees: false },
      }),
      TODAY,
    );
    expect(lane.plan.annualFeePct).toBe(0);
  });

  it("clamps the stop year and the withdrawal start to the horizon", () => {
    // Both sliders are bounded by MAX_YEARS_OF_GROWTH rather than by this
    // lane, so dragging Years down strands them past the end of the plan
    const { plan } = laneA(true, {
      yearsOfGrowthA: 10,
      contributionStopYearA: 30,
      withdrawalStartYearA: 25,
    });
    expect(plan.yearsOfGrowth).toBe(10);
    expect(plan.contributionStopYear).toBe(10);
    expect(plan.withdrawalStartYear).toBe(10);
  });

  it("reads an unset stop year as the lane's current horizon", () => {
    // contributionStopYear is deliberately absent from DEFAULT_SLIDERS: unset
    // means "contribute for the whole horizon", so it follows the Years slider
    expect(DEFAULT_SLIDERS).not.toHaveProperty("contributionStopYearA");
    const lane = buildLane(
      "A",
      context({
        sliders: { yearsOfGrowthA: 12 },
        toggles: { advanced: true },
      }),
      TODAY,
    );
    expect(lane.plan.contributionStopYear).toBe(12);
  });

  it("parses the amount box exactly once, the way the box itself reads it", () => {
    const amount = (currentAmountA: string) =>
      buildLane("A", context({ inputs: { currentAmountA } }), TODAY)
        .initialAmount;
    // A pasted, formatted quarter of a million is a quarter of a million
    expect(amount("250,000.00")).toBe(250000);
    // A cleared box is an empty pot, not the app's opening default
    expect(amount("")).toBe(0);
    // An entry that reads as no number at all means what a cleared box means,
    // rather than reaching the engine as NaN
    expect(amount("not a number")).toBe(0);
    // A negative one keeps its sign and is refused downstream
    expect(amount("-5000")).toBe(-5000);
  });

  it("grows the withdrawal span with the plan, within one hard limit", () => {
    // The default span, for a pot too small to draw more than it
    expect(laneA(true).withdrawalMax).toBe(MAX_MONTHLY_WITHDRAWAL);
    // The most the rate slider could draw from a larger opening balance
    const rich = buildLane(
      "A",
      context({ inputs: { currentAmountA: "3000000" } }),
      TODAY,
    );
    expect(rich.withdrawalMax).toBe(50000);
    // Never below a guardrail the plan already stores
    const stored = buildLane(
      "A",
      context({ sliders: { withdrawalCeilingA: 25000 } }),
      TODAY,
    );
    expect(stored.withdrawalMax).toBe(25000);
    // And never past the hard limit
    const absurd = buildLane(
      "A",
      context({ inputs: { currentAmountA: "1000000000000" } }),
      TODAY,
    );
    expect(absurd.withdrawalMax).toBe(MAX_MONTHLY_WITHDRAWAL_LIMIT);
  });

  it("names the track it is displayed on and totals on that track", () => {
    const sliders = { yearlyInflation: 3 };
    const nominal = buildLane(
      "A",
      context({ sliders, toggles: { showInflation: false } }),
      TODAY,
    );
    const real = buildLane(
      "A",
      context({ sliders, toggles: { showInflation: true } }),
      TODAY,
    );
    expect(nominal.track).toBe("nominal");
    expect(real.track).toBe("real");
    // One simulation, two tracks: the plans are identical and only the
    // figure being read off them differs
    expect(real.plan).toEqual(nominal.plan);
    expect(nominal.total).toBe(nominal.ending.nominal);
    expect(real.total).toBeLessThan(nominal.total);
  });

  it("converts a stored nominal target into the units on screen", () => {
    const sliders = { yearlyInflation: 3, targetValueA: 100000 };
    const nominal = buildLane("A", context({ sliders }), TODAY);
    const real = buildLane(
      "A",
      context({ sliders, toggles: { showInflation: true } }),
      TODAY,
    );
    expect(nominal.displayTarget).toBe(100000);
    // Today's dollars: the same goal, deflated by this lane's own horizon
    const deflator = nominal.ending.inflationAdjusted / nominal.ending.nominal;
    expect(real.displayTarget).toBe(Math.round(100000 * deflator));
  });

  it("caps the target control at the best its own levers can reach", () => {
    const lane = buildLane(
      "A",
      context({
        inputs: { currentAmountA: "25000" },
        sliders: { targetValueA: 100_000_000, yearsOfGrowthA: 20 },
        toggles: { advanced: true },
      }),
      TODAY,
    );
    expect(lane.maxTarget).toBeLessThan(100_000_000);
    expect(lane.maxTarget).toBeGreaterThanOrEqual(lane.total);
    expect(lane.displayTarget).toBe(lane.maxTarget);
  });
});

describe("buildLanes", () => {
  const rolling = (yearsOfGrowthA: number, yearsOfGrowthB: number) =>
    buildLanes(
      context({
        inputs: { currentAmountA: "150000", currentAmountB: "60000" },
        sliders: { yearsOfGrowthA, yearsOfGrowthB },
        toggles: { advanced: true, rollover: true },
      }),
      TODAY,
    );

  it("rolls A into B at A's finish year when it fits", () => {
    const { A, B, rolloverApplied } = rolling(10, 30);
    expect(rolloverApplied).toBe(true);
    expect(B.plan.rollOver).toBe(true);
    expect(B.plan.investmentToRoll).toEqual(A.ending);
    expect(B.plan.yearOfRollover).toBe(10);
  });

  it("declines the roll when A outlives B, rather than extending B", () => {
    const { B, rolloverApplied } = rolling(30, 10);
    expect(rolloverApplied).toBe(false);
    expect(B.plan.rollOver).toBe(false);
    expect(B.plan.investmentToRoll).toBe(0);
    expect(B.plan.yearOfRollover).toBeUndefined();
    // B's horizon is still the one its own Years slider describes
    expect(B.plan.yearsOfGrowth).toBe(10);
  });

  it("leaves B exactly where rollover-off leaves it when the roll is declined", () => {
    const declined = rolling(30, 10);
    const off = buildLanes(
      context({
        inputs: { currentAmountA: "150000", currentAmountB: "60000" },
        sliders: { yearsOfGrowthA: 30, yearsOfGrowthB: 10 },
        toggles: { advanced: true },
      }),
      TODAY,
    );
    expect(declined.B.total).toBe(off.B.total);
  });

  it("rolls nothing while the tool is off, however well it would fit", () => {
    const { B, rolloverApplied } = buildLanes(
      context({
        sliders: { yearsOfGrowthA: 10, yearsOfGrowthB: 30 },
        toggles: { advanced: true, rollover: false },
      }),
      TODAY,
    );
    expect(rolloverApplied).toBe(false);
    expect(B.plan.rollOver).toBe(false);
  });
});

describe("solveLaneTarget", () => {
  /** The unreachable-goal plan: $100,000,000 asked of a $25,000 pot */
  const clamped = () => {
    const toggles: TogglesState = { ...DEFAULT_TOGGLES, advanced: true };
    const lane = buildLane(
      "A",
      context({
        inputs: { currentAmountA: "25000" },
        sliders: {
          projectedGainA: 7,
          yearsOfGrowthA: 20,
          monthlyContributionA: 200,
          monthlyWithdrawalA: 1000,
          withdrawalStartYearA: 10,
        },
        toggles,
      }),
      TODAY,
    );
    return { lane, toggles };
  };

  it("reports the solve as capped when every lever hits its bound", () => {
    const { lane, toggles } = clamped();
    const { outcome } = solveLaneTarget(lane, 100_000_000, toggles);
    // What the Target Reached row prints as " (capped)": the goal shown is
    // the most the levers could reach, not the figure that was asked for
    expect(outcome.clamped).toBe(true);
  });

  it("names every lever it moved, in cascade order", () => {
    const { lane, toggles } = clamped();
    const { outcome } = solveLaneTarget(lane, 100_000_000, toggles);
    // What the "Target Solved By" row lists
    expect(outcome.moved).toEqual([
      "monthlyWithdrawal",
      "monthlyContribution",
      "projectedGain",
    ]);
  });

  it("stores the balance the solved plan reaches, not the request", () => {
    const { lane, toggles } = clamped();
    const { sliders } = solveLaneTarget(lane, 100_000_000, toggles);
    expect(sliders.targetValueA).not.toBe(100_000_000);
    // Exactly the ceiling the Target Value control already showed
    expect(sliders.targetValueA).toBe(lane.maxTarget);
    // The solved levers ride in the same update, on this lane's keys alone
    expect(Object.keys(sliders).every((key) => key.endsWith("A"))).toBe(true);
  });

  it("does not report a reachable goal as capped", () => {
    const { lane, toggles } = clamped();
    const { outcome, sliders } = solveLaneTarget(
      lane,
      lane.total * 1.1,
      toggles,
    );
    expect(outcome.clamped).toBe(false);
    // A shortfall this small is met by cutting the withdrawal alone
    expect(outcome.moved).toEqual(["monthlyWithdrawal"]);
    expect(sliders.targetValueA).toBeGreaterThan(0);
  });

  it("clears the goal without touching another slider", () => {
    const { lane, toggles } = clamped();
    for (const cleared of [0, NaN]) {
      const { outcome, sliders } = solveLaneTarget(lane, cleared, toggles);
      expect(outcome).toEqual({ clamped: false, moved: [] });
      expect(sliders).toEqual({ targetValueA: 0 });
    }
  });
});
