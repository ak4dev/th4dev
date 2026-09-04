/* ==================================================
 * Lane Model
 *
 * Everything the calculator derives from one lane's
 * stored sliders, inputs and toggles - the advanced-mode
 * boundary, the horizon clamps, the rollover fit test,
 * the target ceiling and the solver cascade - in one
 * pure module.
 *
 * It lived inside the calculator page, where the only way
 * to reach it was to render the page and read the markup
 * back. Nothing here touches React, a DOM or a clock:
 * `today` is an argument, so a test states the plan and
 * reads the answer.
 * ================================================== */

import { InvestmentCalculator } from "./investment-growth-calculator";
import {
  maxAchievable,
  solveForTarget,
  type TargetLever,
  type TargetSolution,
} from "./solve-for-target";
import { displayTrack, endingAmounts } from "./growth-rows";
import { parseAmountInput } from "./format";
import {
  DEFAULT_PROJECTED_GAIN,
  DEFAULT_YEARS_OF_GROWTH,
  DEFAULT_INFLATION_RATE,
  DEFAULT_WITHDRAWAL_RATE,
  DEFAULT_WITHDRAWAL_FLOOR,
  DEFAULT_WITHDRAWAL_CEILING,
  MAX_MONTHLY_WITHDRAWAL,
  MAX_MONTHLY_WITHDRAWAL_LIMIT,
  MAX_WITHDRAWAL_RATE,
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
  MIN_VALUE,
  laneKey,
} from "../constants/app-constants";
import type {
  LaneId,
  SliderBaseKey,
  SliderKey,
} from "../constants/app-constants";
import type {
  DisplayTrack,
  FeatureToggles,
  InputValues,
  LineGraphEntry,
  PlanInputs,
  RolloverAmounts,
  SliderValues,
  TogglesState,
} from "../types/types";

/** Everything a lane is built from: the whole of the plan's stored state */
export interface LaneContext {
  sliders: SliderValues;
  inputs: InputValues;
  toggles: TogglesState;
}

/** Everything derived from one investment lane's inputs */
export interface Lane {
  id: LaneId;
  /** The one plan this lane is simulated from, in the shared vocabulary */
  plan: PlanInputs;
  initialAmount: number;
  calc: InvestmentCalculator;
  /** The matrix track this lane is being SHOWN on; the Inflated toggle, named */
  track: DisplayTrack;
  /** Ending balance on `track` */
  total: number;
  /** Every checkpoint, on both tracks; `track` says which one is on screen */
  matrix: LineGraphEntry[];
  /** Every month the engine recorded, for schedules that step by month */
  monthlyMatrix: LineGraphEntry[];
  /** Ending balance on both tracks, for rolling into the other lane */
  ending: RolloverAmounts;
  /** Positive monthly withdrawals actually applied, in simulation order */
  withdrawals: number[];
  /** Highest ending balance this lane's levers can reach, in display units */
  maxTarget: number;
  /** Span of this lane's withdrawal, floor and ceiling controls */
  withdrawalMax: number;
  /** Stored (nominal) target converted to display units */
  displayTarget: number;
  targetStep: number;
  targetReached?: LineGraphEntry;
  /**
   * First year the plan's gross growth reaches the first year's draw, with
   * that growth as a monthly figure.
   *
   * Both sides are NOMINAL. The old test read the balance off the DISPLAY
   * track and compared it against a withdrawal the schedule records nominally,
   * so the answer moved whenever the Inflated toggle did. And gross means
   * gross - before fees, before inflation, blind to the order returns arrive
   * in - so this is not, and is no longer labelled as, a safe withdrawal rate.
   */
  growthCoversDraw?: { year: number; monthlyGross: number };
}

/** A rollover landing in a lane: what arrives, and when */
export interface RolloverInto {
  amounts: RolloverAmounts;
  year: number;
}

/**
 * A tool is on only in advanced mode, where lane B and withdrawals exist.
 *
 * This is the single gate for every tool — its switch, its panel, and the work
 * behind it. Gating the switches alone left a panel that could not be closed
 * once Advanced went off; gating the panels alone left Monte Carlo running
 * five hundred simulations for a cone with no visible off switch.
 */
export const isTool = (t: TogglesState, key: keyof FeatureToggles): boolean =>
  t.advanced && t[key];
export const isDynamic = (t: TogglesState) => isTool(t, "dynamicWithdrawal");
export const isRollover = (t: TogglesState) => isTool(t, "rollover");

/**
 * Inputs the target solver may move, in cascade order. Only controls the
 * current mode actually shows are offered: basic mode has the return rate
 * alone, and a dynamic policy replaces the fixed withdrawal slider. With
 * fixed withdrawals a surplus is spent through the withdrawal by itself,
 * while a shortfall cuts it back before raising contributions and return.
 *
 * @param t       - Current toggles
 * @param surplus - Whether the target sits below the lane's projection
 * @returns The levers to hand solveForTarget, in order
 */
export function targetLevers(t: TogglesState, surplus: boolean): TargetLever[] {
  if (!t.advanced) return ["projectedGain"];
  if (isDynamic(t)) return ["monthlyContribution", "projectedGain"];
  return surplus
    ? ["monthlyWithdrawal"]
    : ["monthlyWithdrawal", "monthlyContribution", "projectedGain"];
}

/** Spreads solved lever values onto one lane's slider keys */
export const laneSliderValues = (
  id: LaneId,
  values: Partial<Record<TargetLever, number>>,
): Partial<Record<SliderKey, number>> =>
  Object.fromEntries(
    Object.entries(values).map(([lever, value]) => [
      laneKey(lever as TargetLever, id),
      value,
    ]),
  );

export function buildLane(
  id: LaneId,
  { sliders: s, inputs, toggles: t }: LaneContext,
  today: Date,
  roll?: RolloverInto,
): Lane {
  // The one place this lane's slider keys are assembled. The return type is
  // the exact key, so `key("projectdGain")` is a compile error at the call
  // rather than an `undefined` that the `??` below reads as a default.
  const key = <B extends SliderBaseKey>(base: B) => laneKey(base, id);
  const track = displayTrack(t.showInflation);
  // THE parse of this lane's principal, and the only one: parseAmountInput is
  // the app's definition of what a money string means, and it is what the
  // amount box itself reads, so the plan starts at the figure on screen. The
  // hub used to parse the same box a second time with parseInt, which read a
  // stored "250,000.00" as $250 while the engine read it as $250,000.
  //
  // No second defaulting layer: normalizeState guarantees the key exists, so
  // the `|| "0"` only speaks for a box the user cleared, and a cleared box
  // means an empty pot - not the $10,000 the app happened to start with.
  // Showing nothing while modelling $10,000 was the plan disagreeing with the
  // screen.
  //
  // An entry that reads as no number at all can only arrive from a
  // hand-edited import, and the box already shows it blank. It means what a
  // cleared box means, an empty pot, and is resolved to that HERE rather than
  // left as a NaN to surface as a "$NaN" total, a NaN slider bound and a NaN
  // first chart row. A negative one is left as it is and refused downstream:
  // the engine will not simulate it, so the lane renders empty instead of
  // quietly turning a debt into a plan.
  const parsedAmount = parseAmountInput(
    inputs[laneKey("currentAmount", id)] || "0",
  );
  const initialAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const years = s[key("yearsOfGrowth")] ?? DEFAULT_YEARS_OF_GROWTH;
  const dynamic = isDynamic(t);
  // Span of this lane's withdrawal family. MAX_MONTHLY_WITHDRAWAL is the
  // default span, not a bound on what anyone may spend: a $3M portfolio at
  // 4% needs more than $10,000/mo, and a control that cannot show a stored
  // guardrail rewrites it the moment it is touched. So the span grows with
  // the plan - the most the rate slider could ever draw from the opening
  // balance - and never sits below a figure already stored.
  const withdrawalMax = Math.min(
    MAX_MONTHLY_WITHDRAWAL_LIMIT,
    Math.max(
      MAX_MONTHLY_WITHDRAWAL,
      Math.ceil(
        (initialAmount * MAX_WITHDRAWAL_RATE) /
          PERCENTAGE_DIVISOR /
          MONTHS_PER_YEAR,
      ),
      s[key("monthlyWithdrawal")] ?? 0,
      s[key("withdrawalFloor")] ?? 0,
      s[key("withdrawalCeiling")] ?? 0,
    ),
  );
  // The lane's own Years slider IS its horizon. A rollover used to extend the
  // receiving lane past it, so the chart, the totals and the Portfolio panel
  // all ran to a year the Years control never showed; buildLanes now declines
  // a roll that would not fit instead, and nothing here outlives the control.
  const plan: PlanInputs = {
    initialAmount,
    projectedGain: s[key("projectedGain")] ?? DEFAULT_PROJECTED_GAIN,
    yearsOfGrowth: years,
    // Basic mode is resolved here, once, rather than inside the engines: the
    // sliders keep their stored values (so flipping Advanced back on restores
    // them) while `plan` describes exactly what is being simulated
    monthlyContribution: t.advanced
      ? (s[key("monthlyContribution")] ?? MIN_VALUE)
      : 0,
    monthlyWithdrawal: t.advanced
      ? (s[key("monthlyWithdrawal")] ?? MIN_VALUE)
      : 0,
    // Both dates are clamped to the horizon. SLIDER_LIMITS bounds them by
    // MAX_YEARS_OF_GROWTH rather than by this lane, so dragging Years down
    // strands them past the end of the plan - and an instruction the plan
    // cannot carry out must not be printed as a date the user will read.
    //
    // The `?? years` is the live meaning of an UNSET stop year, not a dead
    // default: contributionStopYear is deliberately absent from
    // DEFAULT_SLIDERS, so an untouched lane contributes to its CURRENT
    // horizon and follows the Years slider. Giving it a default would freeze
    // it at DEFAULT_YEARS_OF_GROWTH. SliderValues types it optional to keep
    // this fallback compulsory.
    contributionStopYear: t.advanced
      ? Math.min(s[key("contributionStopYear")] ?? years, years)
      : undefined,
    withdrawalStartYear: Math.min(
      s[key("withdrawalStartYear")] ?? MIN_VALUE,
      years,
    ),
    inflationPct: s.yearlyInflation ?? DEFAULT_INFLATION_RATE,
    annualFeePct: isTool(t, "fees") ? s[key("annualFee")] || 0 : 0,
    rollOver: roll !== undefined,
    investmentToRoll: roll?.amounts ?? 0,
    yearOfRollover: roll?.year,
    dynamicWithdrawal: dynamic
      ? {
          ratePct: s[key("withdrawalRate")] ?? DEFAULT_WITHDRAWAL_RATE,
          floor: s[key("withdrawalFloor")] ?? DEFAULT_WITHDRAWAL_FLOOR,
          ceiling: s[key("withdrawalCeiling")] ?? DEFAULT_WITHDRAWAL_CEILING,
        }
      : undefined,
  };
  // The plan's one clock, handed down rather than read here: both lanes and
  // every date this panel prints have to agree on which day "today" is.
  const calc = new InvestmentCalculator(plan, today);
  const ends = calc.calculateGrowth();
  const total = ends[track];
  const matrix = calc.getGrowthMatrix();
  const monthlyMatrix = calc.getMonthlyMatrix();
  const ending = endingAmounts(matrix, initialAmount);
  const withdrawals = calc.getWithdrawalSchedule().filter((m) => m > 0);

  // Targets are stored nominal. The deflator that converts one into display
  // units is this lane's own Fisher factor at its horizon,
  // (1 + yearlyInflation / 100) ^ -yearsOfGrowth: the calculator simulates a
  // single nominal balance and derives today's-dollars figure by deflating
  // it, so the ratio of the ending balance's two tracks IS that factor, up to
  // the rounding of the two floored figures. It costs nothing and needs no
  // second simulation.
  //
  // A drained or zero-length plan has no meaningful deflator: leave it 1:1.
  const deflator =
    ends.nominal > 0 && ends.real > 0 ? ends.real / ends.nominal : 1;
  const toDisplay = (nominal: number) =>
    track === "real" ? Math.round(nominal * deflator) : nominal;

  // The target slider spans up to the best ending balance this mode's levers
  // can reach, so a goal above the current projection is expressible. A
  // dynamic policy can drain the maxed-out plan to zero, so the ceiling never
  // falls below this lane's own projection and the range stays valid.
  // The solver searches the range the lane's own controls offer, so a solved
  // withdrawal is always one the slider can show. That span is an argument
  // rather than a field of the plan: nothing simulates it.
  const maxTarget = Math.max(
    maxAchievable(plan, track, targetLevers(t, false), withdrawalMax),
    total,
    1,
  );
  const displayTarget = Math.min(
    toDisplay(s[key("targetValue")] || 0),
    maxTarget,
  );
  const annualWithdrawal = (withdrawals[0] ?? 0) * 12;
  // Both sides NOMINAL, whatever is on screen: the schedule records what the
  // plan actually pays out, which is a nominal figure.
  const covers =
    annualWithdrawal > 0
      ? matrix.find(
          (e) => (e.nominal * plan.projectedGain) / 100 >= annualWithdrawal,
        )
      : undefined;

  return {
    id,
    plan,
    initialAmount,
    calc,
    track,
    total,
    matrix,
    monthlyMatrix,
    ending,
    withdrawals,
    maxTarget,
    withdrawalMax,
    displayTarget,
    // One order of magnitude below the balance so the slider stays usable at any scale
    targetStep:
      10 ** Math.max(2, Math.floor(Math.log10(Math.max(total, 1000))) - 1),
    // The DISPLAY track, deliberately: displayTarget is the stored nominal
    // goal already converted into the units the Target Value control shows,
    // so the two sides of this comparison must be in the same units. Reading
    // the nominal track here would answer a different year whenever Inflated
    // is on, for a goal the user set on the deflated scale.
    targetReached:
      displayTarget > 0
        ? matrix.find((e) => e[track] >= displayTarget)
        : undefined,
    growthCoversDraw:
      covers === undefined
        ? undefined
        : {
            year: covers.x.getFullYear(),
            monthlyGross: Math.floor(
              (covers.nominal * plan.projectedGain) / 100 / 12,
            ),
          },
  };
}

/**
 * A's ending balance rolls into B at the end of A's horizon - but only when
 * that date falls inside B's own horizon.
 *
 * Stretching B to receive a late rollover made B's Years slider describe a
 * plan nobody was running. Declining the roll keeps every control honest, and
 * it is what the Monte Carlo engine already does: runRolloverSimulation
 * computes the same test before it injects anything.
 */
export function buildLanes(
  ctx: LaneContext,
  today: Date,
): {
  A: Lane;
  B: Lane;
  /** True when rollover is on AND A finishes within B's horizon */
  rolloverApplied: boolean;
} {
  const A = buildLane("A", ctx, today);
  const bYears = ctx.sliders.yearsOfGrowthB ?? DEFAULT_YEARS_OF_GROWTH;
  const rolloverApplied =
    isRollover(ctx.toggles) && A.plan.yearsOfGrowth <= bYears;
  const roll = rolloverApplied
    ? { amounts: A.ending, year: A.plan.yearsOfGrowth }
    : undefined;
  return { A, B: buildLane("B", ctx, today, roll), rolloverApplied };
}

/* ---------------- Target Solver ---------------- */

/** What the last solve did to one lane */
export interface TargetOutcome {
  /** True when every lever hit its bound before reaching the request */
  clamped: boolean;
  /** The levers the solve actually moved, in cascade order */
  moved: TargetLever[];
}

/** No solve has run for this lane in this session */
export const NO_SOLVE: TargetOutcome = { clamped: false, moved: [] };

/**
 * Nominal ending balance of the plan a solve produced, which is what a
 * target is stored as. Slider granularity means a solve lands near, not
 * exactly on, the request, so storing the reached balance keeps the
 * displayed goal attainable; measuring the nominal track directly (rather
 * than deflating `achieved` back) keeps a display-mode flip an exact no-op.
 */
const solvedNominal = (lane: Lane, solution: TargetSolution): number =>
  new InvestmentCalculator({
    ...lane.plan,
    ...solution.values,
  }).calculateGrowth().nominal;

/**
 * The lane's goal (given in display units) and every input the solver had to
 * move to reach it, as ONE slider update.
 *
 * The balance the solved plan actually reaches is what gets stored, so the
 * control never shows a value the plan misses; 0, empty, or a non-finite
 * entry clears the goal and leaves the other sliders where they are.
 *
 * `outcome` is what the panel annotates the goal with - " (capped)" when
 * every lever hit its bound short of the request, and the "Target Solved By"
 * row naming the levers that moved. Both are derived here rather than in the
 * page so they can be asserted without rendering one.
 */
export function solveLaneTarget(
  lane: Lane,
  target: number,
  toggles: TogglesState,
): { outcome: TargetOutcome; sliders: Partial<Record<SliderKey, number>> } {
  const targetKey = laneKey("targetValue", lane.id);
  if (!target || !Number.isFinite(target)) {
    return { outcome: NO_SOLVE, sliders: { [targetKey]: 0 } };
  }
  const solution = solveForTarget(
    lane.plan,
    target,
    lane.track,
    targetLevers(toggles, target < lane.total),
    lane.withdrawalMax,
  );
  return {
    outcome: {
      clamped: solution.clamped,
      moved: Object.keys(solution.values) as TargetLever[],
    },
    sliders: {
      ...laneSliderValues(lane.id, solution.values),
      [targetKey]: solvedNominal(lane, solution),
    },
  };
}
