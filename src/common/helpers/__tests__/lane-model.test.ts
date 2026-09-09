import { describe, it, expect } from "vitest";
import {
  buildLane,
  buildLanes,
  isDynamic,
  isRollover,
  isTool,
  solveLaneTarget,
  targetSolvesWithdrawal,
  type LaneContext,
} from "../lane-model";
import { noWithdrawalBalance } from "../solve-for-target";
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

describe("targetSolvesWithdrawal", () => {
  const toggles = (over: Partial<TogglesState> = {}): TogglesState => ({
    ...DEFAULT_TOGGLES,
    ...over,
  });

  it("is off in basic mode: the goal is a marker and moves nothing", () => {
    // There is no withdrawal control on screen to move, and the assumed
    // return is not a lever in any mode
    expect(targetSolvesWithdrawal(toggles())).toBe(false);
    expect(targetSolvesWithdrawal(toggles({ dynamicWithdrawal: true }))).toBe(
      false,
    );
  });

  it("is on in advanced mode with a fixed withdrawal on screen", () => {
    expect(targetSolvesWithdrawal(toggles({ advanced: true }))).toBe(true);
    expect(
      targetSolvesWithdrawal(
        toggles({ advanced: true, fees: true, rollover: true }),
      ),
    ).toBe(true);
  });

  it("is off when a dynamic policy replaces the fixed withdrawal", () => {
    expect(
      targetSolvesWithdrawal(
        toggles({ advanced: true, dynamicWithdrawal: true }),
      ),
    ).toBe(false);
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

  it("bounds a goal by the plan, not by the withdrawal's own track", () => {
    // The track closes over the stored withdrawal (see above), so a plan whose
    // withdrawal sits at the end of it has a track that IS its withdrawal.
    // That figure cannot also be the bound a goal solves within: the ceiling
    // would be the very number being solved for, and the solve would have no
    // headroom to raise it. The goal's bound is read off the balance the plan
    // is holding when it starts spending instead - the same 20% of a balance
    // the track uses, taken from the pot being drawn rather than the one
    // deposited.
    const lane = (sliders: Partial<SliderValues>) =>
      buildLane(
        "A",
        context({
          inputs: { currentAmountA: "500000" },
          sliders: {
            projectedGainA: 7,
            yearsOfGrowthA: 20,
            monthlyContributionA: 0,
            ...sliders,
          },
          toggles: { advanced: true },
        }),
        TODAY,
      );

    // Drawn from day one, the two are one figure and nothing changes at all
    const today = lane({ withdrawalStartYearA: 0, monthlyWithdrawalA: 10000 });
    expect(today.withdrawalMax).toBe(MAX_MONTHLY_WITHDRAWAL);
    expect(today.withdrawalSolveMax).toBe(today.withdrawalMax);

    // Left to grow for eighteen years first, the plan can plainly justify
    // more than its opening balance could ever have paid
    const later = lane({ withdrawalStartYearA: 18, monthlyWithdrawalA: 25000 });
    expect(later.withdrawalMax).toBe(25000);
    expect(later.withdrawalSolveMax).toBeGreaterThan(later.withdrawalMax);

    // And it does not move when the withdrawal does, which is what stops a
    // goal dragged across the track from walking the withdrawal up on every
    // pass of the thumb: the balance it reads is fixed before the first
    // withdrawal is taken
    for (const monthlyWithdrawalA of [0, 1000, 9000, 25000]) {
      expect(
        lane({ withdrawalStartYearA: 18, monthlyWithdrawalA })
          .withdrawalSolveMax,
      ).toBe(later.withdrawalSolveMax);
    }

    // It is still never below the track, so a goal can never spend down a
    // withdrawal the user typed and leave a smaller one they did not
    const typed = lane({
      withdrawalStartYearA: 18,
      monthlyWithdrawalA: 250000,
    });
    expect(typed.withdrawalSolveMax).toBe(250000);
  });

  it("re-spans the track around a withdrawal typed past it, then relaxes", () => {
    // The three withdrawal BOXES accept up to MAX_MONTHLY_WITHDRAWAL_LIMIT
    // while their track stays this span (LanePanel's withdrawalSlider), so the
    // span has to close over whatever was typed: it is the only thing keeping
    // the thumb on its own track, and a thumb past the end of its track
    // announces an aria-valuenow outside the range it reports. On a lane whose
    // own balance could never draw $10,000:
    const span = (stored: Partial<SliderValues>) =>
      buildLane("A", context({ sliders: stored }), TODAY).withdrawalMax;

    expect(span({ monthlyWithdrawalA: 5000 })).toBe(MAX_MONTHLY_WITHDRAWAL);
    // Typed past the track, the track follows - so the value is always on it
    expect(span({ monthlyWithdrawalA: 25000 })).toBe(25000);
    // The floor widens it the same way, so all three controls share one track
    // wide enough for the largest figure any of them holds
    expect(span({ withdrawalFloorA: 25000 })).toBe(25000);
    // And it is not a ratchet the plan keeps: drag back down and the track
    // returns to the span this lane can actually justify
    expect(span({ monthlyWithdrawalA: 5000 })).toBe(MAX_MONTHLY_WITHDRAWAL);
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
    // with the Fisher factor the engine itself applies
    const deflator = Math.pow(1.03, -nominal.plan.yearsOfGrowth);
    expect(real.displayTarget).toBe(Math.round(100000 * deflator));
    expect(real.deflator).toBeCloseTo(deflator, 12);
    expect(nominal.deflator).toBe(1);
  });

  it("spans the plan's own no-withdrawal balance and shows the goal as stored", () => {
    const lane = buildLane(
      "A",
      context({
        inputs: { currentAmountA: "25000" },
        sliders: {
          targetValueA: 100_000_000,
          yearsOfGrowthA: 20,
          monthlyWithdrawalA: 1000,
          withdrawalStartYearA: 10,
        },
        toggles: { advanced: true },
      }),
      TODAY,
    );
    expect(lane.maxTarget).toBe(noWithdrawalBalance(lane.plan, lane.track));
    expect(lane.maxTarget).toBeGreaterThan(lane.total);
    // Never the balance some other plan would reach: this pot at 10% for 20
    // years is nowhere near a million, let alone the $86,000,000 the old
    // ceiling reported for a 30% return and a $5,000 contribution
    expect(lane.maxTarget).toBeLessThan(1_000_000);
    // The goal is the goal, however far above the span it sits
    expect(lane.displayTarget).toBe(100_000_000);
  });

  it("spans the projection itself where the target moves nothing", () => {
    for (const toggles of [{}, { advanced: true, dynamicWithdrawal: true }]) {
      const lane = buildLane(
        "A",
        context({
          inputs: { currentAmountA: "25000" },
          sliders: { yearsOfGrowthA: 20, monthlyWithdrawalA: 1000 },
          toggles,
        }),
        TODAY,
      );
      expect(lane.maxTarget).toBe(Math.max(lane.total, 1));
    }
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
  const PLAN = {
    projectedGainA: 7,
    yearsOfGrowthA: 20,
    monthlyContributionA: 200,
    monthlyWithdrawalA: 1000,
    withdrawalStartYearA: 10,
  };

  /** A $25,000 pot carrying every input a solve could be tempted by */
  const laneIn = (
    over: Partial<TogglesState> = {},
    sliders: Partial<SliderValues> = {},
  ) => {
    const toggles: TogglesState = {
      ...DEFAULT_TOGGLES,
      advanced: true,
      ...over,
    };
    const lane = buildLane(
      "A",
      context({
        inputs: { currentAmountA: "25000" },
        sliders: { ...PLAN, ...sliders },
        toggles,
      }),
      TODAY,
    );
    return { lane, toggles };
  };

  /** The lane as it is after the update a solve returned is applied */
  const afterSolve = (
    over: Partial<TogglesState>,
    update: Partial<SliderValues>,
  ) => laneIn(over, update).lane;

  it("stores the goal as asked and zeroes the withdrawal, nothing more", () => {
    const { lane, toggles } = laneIn();
    const sliders = solveLaneTarget(lane, 100_000_000, toggles);
    expect(sliders).toEqual({
      monthlyWithdrawalA: 0,
      targetValueA: 100_000_000,
    });
  });

  it("never touches the return or the contribution, in any mode", () => {
    for (const over of [{ advanced: false }, {}, { dynamicWithdrawal: true }]) {
      const { lane, toggles } = laneIn(over);
      for (const goal of [1, 10_000, lane.total, 100_000_000]) {
        const sliders = solveLaneTarget(lane, goal, toggles);
        expect(sliders).not.toHaveProperty("projectedGainA");
        expect(sliders).not.toHaveProperty("monthlyContributionA");
        expect(sliders.targetValueA).toBe(goal);
      }
    }
  });

  it("stores the goal alone where no fixed withdrawal is on screen", () => {
    for (const over of [{ advanced: false }, { dynamicWithdrawal: true }]) {
      const { lane, toggles } = laneIn(over);
      expect(solveLaneTarget(lane, 100_000_000, toggles)).toEqual({
        targetValueA: 100_000_000,
      });
    }
  });

  it("can be lowered past the projection: the goal stays and the withdrawal rises", () => {
    const { lane, toggles } = laneIn();
    const sliders = solveLaneTarget(lane, 1, toggles);
    expect(sliders.targetValueA).toBe(1);
    expect(sliders.monthlyWithdrawalA).toBeGreaterThan(PLAN.monthlyWithdrawalA);
    expect(Object.keys(sliders).sort()).toEqual([
      "monthlyWithdrawalA",
      "targetValueA",
    ]);
  });

  it("stores a goal set on the inflated track as its nominal equivalent", () => {
    const { lane, toggles } = laneIn({ showInflation: true });
    const goal = 50_000;
    const sliders = solveLaneTarget(lane, goal, toggles);
    expect(sliders.targetValueA).toBe(Math.round(goal / lane.deflator));
    expect(sliders.targetValueA).toBeGreaterThan(goal);
    // Shown again in today's dollars, it is exactly the goal that was set
    const after = laneIn({ showInflation: true }, sliders).lane;
    expect(after.displayTarget).toBe(goal);
  });

  it("caps a goal too large to store, in the units the control shows", () => {
    // A goal is held nominal, so one set in today's dollars on a long,
    // inflationary plan is stored as a much larger figure. The cap is applied
    // in DISPLAY units, so the box shows what was stored rather than an
    // unrecognisable number the state clamp handed back.
    const extreme = { yearsOfGrowthA: 100, yearlyInflation: 10 };
    const { lane, toggles } = laneIn({ showInflation: true }, extreme);
    const typed = 999_999_999_999;
    const sliders = solveLaneTarget(lane, typed, toggles);

    const stored = sliders.targetValueA as number;
    expect(stored).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect(stored).toBeGreaterThan(0);
    // What the control shows next is what is stored, to the dollar, and it
    // is the largest goal this plan can express rather than what was typed
    const after = laneIn(
      { showInflation: true },
      { ...extreme, ...sliders },
    ).lane;
    expect(after.displayTarget).toBeLessThan(typed);
    expect(
      Math.abs(
        after.displayTarget -
          Math.floor(Number.MAX_SAFE_INTEGER * lane.deflator),
      ),
    ).toBeLessThanOrEqual(1);
    // And it is stable: setting the goal the box now shows stores the same
    expect(
      solveLaneTarget(after, after.displayTarget, toggles).targetValueA,
    ).toBe(stored);
  });

  it("clears the goal without touching another slider", () => {
    const { lane, toggles } = laneIn();
    for (const cleared of [0, -5000, NaN, Infinity]) {
      expect(solveLaneTarget(lane, cleared, toggles)).toEqual({
        targetValueA: 0,
      });
    }
  });

  describe("what the lane then reports", () => {
    it("is capped when the withdrawal is at 0 and the goal is still above the plan", () => {
      const { lane, toggles } = laneIn();
      const after = afterSolve({}, solveLaneTarget(lane, 100_000_000, toggles));
      expect(after.plan.monthlyWithdrawal).toBe(0);
      expect(after.targetReached).toBeUndefined();
      expect(after.targetCapped).toBe(true);
    });

    it("moves a withdrawal that already sits at the end of its own track", () => {
      // The report this came from: with the Monthly Withdrawal thumb at the
      // end of its track, dragging Target Value moved nothing at all and
      // nothing said why. No typing is needed to get there - $10,000/mo is
      // simply where this track ends - and the track then equals the stored
      // withdrawal, so handing it to the solver as a ceiling made the ceiling
      // the value being solved for. The solve returned the figure it started
      // from and the update dropped it as unchanged.
      const late = {
        projectedGainA: 7,
        yearsOfGrowthA: 20,
        monthlyContributionA: 0,
        withdrawalStartYearA: 18,
        monthlyWithdrawalA: MAX_MONTHLY_WITHDRAWAL,
      };
      const toggles: TogglesState = { ...DEFAULT_TOGGLES, advanced: true };
      const rich = (over: Partial<SliderValues> = {}) =>
        buildLane(
          "A",
          context({
            inputs: { currentAmountA: "500000" },
            sliders: { ...late, ...over },
            toggles,
          }),
          TODAY,
        );

      const lane = rich();
      expect(lane.plan.monthlyWithdrawal).toBe(lane.withdrawalMax);
      const goal = Math.round(lane.total * 0.8);
      const update = solveLaneTarget(lane, goal, toggles);
      const solved = update.monthlyWithdrawalA as number;
      expect(solved).toBeGreaterThan(lane.withdrawalMax);

      // It lands on the goal rather than stopping at the end of the track:
      // neither neighbouring dollar of withdrawal gets closer to it. And what
      // it wrote is on the control at the next render, which is what the
      // track closing over the stored figure is for
      const after = rich(update as Partial<SliderValues>);
      const miss = Math.abs(after.total - goal);
      for (const neighbour of [solved - 1, solved + 1]) {
        expect(
          Math.abs(rich({ monthlyWithdrawalA: neighbour }).total - goal),
        ).toBeGreaterThanOrEqual(miss);
      }
      expect(after.withdrawalMax).toBeGreaterThanOrEqual(solved);
      expect(after.targetCapped).toBe(false);

      // Dragging to the same goal again answers the same figure, so there is
      // nothing to write. Every intermediate value of a dragged thumb solves,
      // so a bound that grew with the withdrawal it had just written would
      // ratchet up within a single drag of the goal; this one is read off the
      // balance the plan holds before its first withdrawal, which no solve
      // can move
      const again = solveLaneTarget(after, goal, toggles);
      expect(again).toEqual({ targetValueA: goal });
      expect(
        rich({ ...update, ...again } as Partial<SliderValues>).plan
          .monthlyWithdrawal,
      ).toBe(solved);
    });

    it("is capped at the ceiling when the withdrawal cannot spend down to the goal", () => {
      // Six months of withdrawals at the very end cannot empty a $25,000 pot
      const { lane, toggles } = laneIn(
        {},
        { monthlyContributionA: 0, withdrawalStartYearA: 19.5 },
      );
      const sliders = solveLaneTarget(lane, 1, toggles);
      expect(sliders).toEqual({
        monthlyWithdrawalA: lane.withdrawalMax,
        targetValueA: 1,
      });
      const after = afterSolve(
        {},
        { monthlyContributionA: 0, withdrawalStartYearA: 19.5, ...sliders },
      );
      expect(after.targetCapped).toBe(true);
    });

    it("is not capped for a reachable goal", () => {
      const { lane, toggles } = laneIn();
      const goal = Math.round(lane.total * 1.1);
      const sliders = solveLaneTarget(lane, goal, toggles);
      // A shortfall this small is met by cutting the withdrawal
      expect(sliders.monthlyWithdrawalA).toBeLessThan(PLAN.monthlyWithdrawalA);
      const after = afterSolve({}, sliders);
      expect(after.targetCapped).toBe(false);
      expect(after.targetReached).toBeDefined();
    });

    it("is never capped where the target moves nothing", () => {
      for (const over of [{ advanced: false }, { dynamicWithdrawal: true }]) {
        const { lane, toggles } = laneIn(over);
        const after = afterSolve(
          over,
          solveLaneTarget(lane, 100_000_000, toggles),
        );
        expect(after.targetReached).toBeUndefined();
        expect(after.targetCapped).toBe(false);
      }
    });

    it("re-evaluates as the plan changes rather than remembering a solve", () => {
      // A solve that capped: withdrawal 0, a $5,000,000 goal out of reach at 7%
      const { lane, toggles } = laneIn();
      const capped = solveLaneTarget(lane, 5_000_000, toggles);
      expect(capped).toEqual({
        monthlyWithdrawalA: 0,
        targetValueA: 5_000_000,
      });
      expect(afterSolve({}, capped).targetCapped).toBe(true);
      // The user then raises the return until the plan reaches the goal: the
      // annotation goes with it, though no second solve has run
      const reached = afterSolve({}, { ...capped, projectedGainA: 30 });
      expect(reached.total).toBeGreaterThanOrEqual(5_000_000);
      expect(reached.targetReached).toBeDefined();
      expect(reached.targetCapped).toBe(false);
      // Or moves the withdrawal off its bound: no longer capped either way
      expect(
        afterSolve({}, { ...capped, monthlyWithdrawalA: 50 }).targetCapped,
      ).toBe(false);
    });

    it("is capped either way when the plan never withdraws at all", () => {
      const { lane, toggles } = laneIn({}, { withdrawalStartYearA: 20 });
      for (const goal of [1, 100_000_000]) {
        const sliders = solveLaneTarget(lane, goal, toggles);
        // Nothing to move: the withdrawal slider is left where it was
        expect(sliders).toEqual({ targetValueA: goal });
        const after = afterSolve({}, { withdrawalStartYearA: 20, ...sliders });
        expect(after.targetCapped).toBe(true);
      }
    });

    it("still reads a goal set to the projection as reached after Inflated flips", () => {
      // The engine floors each track separately and a goal is converted
      // between them by rounding, so the goal can sit one dollar above the
      // balance it was set from on the other track. That must not read as
      // "> 20 yrs" for a goal the plan meets to the dollar.
      for (const from of [false, true]) {
        const { lane, toggles } = laneIn({ showInflation: from });
        const sliders = solveLaneTarget(lane, lane.total, toggles);
        for (const to of [false, true]) {
          const after = laneIn({ showInflation: to }, sliders).lane;
          // The goal may sit at most a dollar ABOVE the balance either way,
          // and below it by one real dollar or, viewed nominal, by what one
          // real dollar is worth at this horizon: 1 / (1.025 ^ -20)
          const below = to ? 1 : Math.ceil(Math.pow(1.025, 20));
          expect(after.displayTarget - after.total).toBeLessThanOrEqual(1);
          expect(after.total - after.displayTarget).toBeLessThanOrEqual(below);
          expect(after.targetReached).toBeDefined();
          expect(after.targetCapped).toBe(false);
        }
      }
    });

    it("tolerates a real-dollar goal viewed nominal on a plan that never withdraws", () => {
      // The nominal-side slack, exercised: a goal set to the projection in
      // today's dollars is stored as its nominal worth, which can sit several
      // nominal dollars below the balance at 6% over 30 years. A plan whose
      // withdrawal is inert must not call that a capped surplus.
      const long = {
        yearsOfGrowthA: 30,
        withdrawalStartYearA: 30,
        yearlyInflation: 6,
      };
      const { lane, toggles } = laneIn({ showInflation: true }, long);
      const sliders = solveLaneTarget(lane, lane.total, toggles);
      const nominal = laneIn({}, { ...long, ...sliders }).lane;
      expect(nominal.displayTarget - nominal.total).toBeLessThanOrEqual(1);
      expect(nominal.total - nominal.displayTarget).toBeLessThanOrEqual(
        Math.ceil(Math.pow(1.06, 30)),
      );
      expect(nominal.targetReached).toBeDefined();
      expect(nominal.targetCapped).toBe(false);
    });

    it("does not read a goal well above the balance as reached at a long horizon", () => {
      // 10% inflation over 100 years makes one real dollar worth $13,781
      // nominal at the horizon. That tolerance belongs BELOW the balance
      // only: a goal $1,000 above a $25,000 pot is a miss on any track
      const long = {
        yearsOfGrowthA: 100,
        yearlyInflation: 10,
        projectedGainA: 0,
        monthlyContributionA: 0,
        monthlyWithdrawalA: 0,
      };
      const missed = laneIn({}, { ...long, targetValueA: 26_000 }).lane;
      expect(missed.total).toBe(25_000);
      expect(missed.targetReached).toBeUndefined();
      expect(missed.targetCapped).toBe(true);
      // And with no inflation at all the two tracks are one: a goal one
      // dollar above the balance is a miss, not noise
      const flat = { ...long, yearlyInflation: 0 };
      expect(
        laneIn({}, { ...flat, targetValueA: 25_001 }).lane.targetReached,
      ).toBeUndefined();
      expect(
        laneIn({}, { ...flat, targetValueA: 25_000 }).lane.targetReached,
      ).toBeDefined();
    });

    it("decides inertness in the engine's whole months", () => {
      // 10.34 years and a start at 10.3 both round to month 124, so the
      // engine never withdraws; the withdrawal is inert and an unreachable
      // goal is capped, whatever the slider shows
      const inert = {
        yearsOfGrowthA: 10.34,
        withdrawalStartYearA: 10.3,
        monthlyWithdrawalA: 500,
      };
      const { lane, toggles } = laneIn({}, inert);
      expect(lane.withdrawals).toEqual([]);
      const sliders = solveLaneTarget(lane, 1_000_000_000, toggles);
      expect(sliders).toEqual({ targetValueA: 1_000_000_000 });
      expect(laneIn({}, { ...inert, ...sliders }).lane.targetCapped).toBe(true);
    });

    it("reads a goal the plan holds today as reached on a horizon of zero", () => {
      const { lane } = laneIn({}, { yearsOfGrowthA: 0, targetValueA: 25_000 });
      expect(lane.matrix).toEqual([]);
      expect(lane.total).toBe(25_000);
      expect(lane.targetReached?.x).toEqual(TODAY);
      expect(lane.targetCapped).toBe(false);
    });

    it("is capped when the pot is empty and no withdrawal can ever be taken", () => {
      const lane = buildLane(
        "A",
        context({
          inputs: { currentAmountA: "0" },
          sliders: {
            ...PLAN,
            monthlyContributionA: 0,
            monthlyWithdrawalA: 500,
            withdrawalStartYearA: 0,
            targetValueA: 1_000_000,
          },
          toggles: { advanced: true },
        }),
        TODAY,
      );
      expect(lane.total).toBe(0);
      expect(lane.withdrawals).toEqual([]);
      expect(lane.targetCapped).toBe(true);
    });
  });
});

/* ---------- Tools that change what a withdrawal means ---------- */

describe("tax and indexed spending are resolved at the lane boundary", () => {
  const built = (toggles: Partial<TogglesState>) =>
    buildLane(
      "A",
      context({
        inputs: { currentAmountA: "400000" },
        sliders: {
          monthlyWithdrawalA: 2000,
          withdrawalStartYearA: 0,
          withdrawalTaxA: 25,
          yearlyInflation: 3,
        },
        toggles,
      }),
      TODAY,
    );

  it("simulates no tax while the tool is off, whatever is stored", () => {
    // Same rule as fees and the dynamic policy: the slider keeps its value so
    // flipping the tool back on restores it, while `plan` describes exactly
    // what is being simulated
    expect(built({ advanced: true }).plan.withdrawalTaxPct).toBe(0);
    expect(built({ advanced: true, taxes: true }).plan.withdrawalTaxPct).toBe(
      25,
    );
  });

  it("runs neither tool in basic mode", () => {
    const basic = built({ taxes: true, spendingKeepsPace: true });
    expect(basic.plan.withdrawalTaxPct).toBe(0);
    expect(basic.plan.spendingKeepsPace).toBe(false);
  });

  it("sells more than it spends once the tool is on", () => {
    const untaxed = built({ advanced: true });
    const taxed = built({ advanced: true, taxes: true });
    expect(taxed.withdrawals[0]).toBeCloseTo(2000 / 0.75, 6);
    expect(taxed.total).toBeLessThan(untaxed.total);
  });

  it("raises the payment every year once spending keeps pace", () => {
    const indexed = built({ advanced: true, spendingKeepsPace: true });
    expect(indexed.plan.spendingKeepsPace).toBe(true);
    expect(indexed.withdrawals[12]).toBeGreaterThan(indexed.withdrawals[0]);
  });
});

describe("a dynamic policy held at its ceiling says so", () => {
  const policy = (initial: string, ceiling: number) =>
    buildLane(
      "A",
      context({
        inputs: { currentAmountA: initial },
        sliders: {
          withdrawalRateA: 4,
          withdrawalFloorA: 0,
          withdrawalCeilingA: ceiling,
          withdrawalStartYearA: 0,
          yearlyInflation: 0,
        },
        toggles: { advanced: true, dynamicWithdrawal: true },
      }),
      TODAY,
    );

  it("is quiet while the rate is what sets the withdrawal", () => {
    // $1,000,000 at 4% asks for $3,333/mo, well inside a $10,000 ceiling
    expect(policy("1000000", 10000).ceilingBinds).toBe(false);
  });

  it("reads the balance the policy is evaluated on, not the opening one", () => {
    // withdrawalStartYear 0 indexes the monthly matrix at -1 and falls through
    // to the opening amount, so the array lookup itself only runs on a later
    // start - the off-by-one-prone half, since matrix[k] is the balance at the
    // END of month k+1 while the policy is evaluated BEFORE month k+1.
    // $1,000,000 at 7% is $1,417,625 after five years; 4% of that is $4,725/mo.
    const later = (ceiling: number) =>
      buildLane(
        "A",
        context({
          inputs: { currentAmountA: "1000000" },
          sliders: {
            projectedGainA: 7,
            yearsOfGrowthA: 30,
            monthlyContributionA: 0,
            withdrawalRateA: 4,
            withdrawalFloorA: 0,
            withdrawalCeilingA: ceiling,
            withdrawalStartYearA: 5,
            yearlyInflation: 0,
          },
          toggles: { advanced: true, dynamicWithdrawal: true },
        }),
        TODAY,
      );
    expect(later(10000).withdrawals[0]).toBeCloseTo(4725.42, 1);
    expect(later(10000).ceilingBinds).toBe(false);
    expect(later(4000).ceilingBinds).toBe(true);
  });

  it("is false for a lane with no policy to cap", () => {
    const fixed = buildLane(
      "A",
      context({
        inputs: { currentAmountA: "5000000" },
        sliders: { monthlyWithdrawalA: 10000, withdrawalStartYearA: 0 },
        toggles: { advanced: true },
      }),
      TODAY,
    );
    expect(fixed.ceilingBinds).toBe(false);
  });

  it("reports a ceiling that has turned the policy into a flat payment", () => {
    // $5,000,000 at 4% asks for $16,667/mo and gets $10,000 - and $10,000 is
    // the DEFAULT ceiling, which is the slider span rather than a figure
    // anybody chose, so this binds on plans nobody has touched it on
    const big = policy("5000000", 10000);
    expect(big.ceilingBinds).toBe(true);
    expect(big.withdrawals[0]).toBe(10000);
    expect(policy("5000000", 1_000_000).ceilingBinds).toBe(false);
  });
});
