/* ==================================================
 * Lane Model
 *
 * Everything the calculator derives from one lane's
 * stored sliders, inputs and toggles - the advanced-mode
 * boundary, the horizon clamps, the rollover fit test,
 * the target span and the withdrawal solve - in one
 * pure module.
 *
 * It lived inside the calculator page, where the only way
 * to reach it was to render the page and read the markup
 * back. Nothing here touches React, a DOM or a clock:
 * `today` is an argument, so a test states the plan and
 * reads the answer.
 * ================================================== */

import { InvestmentCalculator, toMonths } from "./investment-growth-calculator";
import { noWithdrawalBalance, solveForTarget } from "./solve-for-target";
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
  SLIDER_LIMITS,
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
  /**
   * Span of the Target Value slider, in display units: the ending balance
   * with no fixed withdrawal where the target solves one, and the lane's own
   * projection everywhere else. Never a balance some OTHER plan could reach.
   */
  maxTarget: number;
  /** Span of this lane's withdrawal, floor and ceiling controls */
  withdrawalMax: number;
  /**
   * Stored (nominal) target converted to display units, exactly as stored:
   * a goal above the slider's span is still the goal, and the box shows it
   * even though the thumb sits at the end of the track.
   */
  displayTarget: number;
  /** Display units per nominal dollar at the horizon: 1 on the nominal track */
  deflator: number;
  /**
   * True when the goal is missed and the withdrawal - the one input a target
   * may move - can do no more about it: it sits at the bound that would help,
   * or the plan never withdraws at all. Only ever true where the target
   * solves the withdrawal, and re-derived from the plan on every build, so
   * it can never be a stale memory of an earlier solve.
   */
  targetCapped: boolean;
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
  /**
   * True when a dynamic policy's CEILING is what set the withdrawal, rather
   * than the rate the user asked for.
   *
   * A ceiling that binds turns a percentage-of-balance policy back into a
   * fixed withdrawal without saying so, and the default ceiling is the slider
   * span rather than a figure anyone chose (see DEFAULT_WITHDRAWAL_CEILING),
   * so it binds on every plan above about $3,000,000 that nobody has touched
   * it on. Measured on the FIRST withdrawal the policy makes: that is the one
   * the user can check against "rate% of my balance divided by twelve", and a
   * later balance may legitimately grow into the ceiling.
   */
  ceilingBinds: boolean;
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
 * Whether a target solves the fixed monthly withdrawal, which is the ONE
 * input a goal may move. It is on screen only in advanced mode without a
 * dynamic policy; everywhere else the target is a marker - the dashed line
 * on the chart and the "Target Reached" row - and moves nothing.
 *
 * The assumed return and the contribution are never levers. A solver that
 * moved them once turned a slider drag into a 20% return assumption and a
 * $5,000/mo contribution the user had not chosen, and the ending balance
 * along with them.
 */
export const targetSolvesWithdrawal = (t: TogglesState): boolean =>
  t.advanced && !isDynamic(t);

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
  //
  // With Taxes on, these controls hold SPENDABLE dollars while the term below
  // is a portfolio draw, so the span is generous rather than exact. That is
  // the right way round: narrowing it by (1 - t) would shrink the track under
  // the user's thumb the moment the tool was switched on, which is the very
  // failure the paragraph above exists to prevent. A span that is too wide
  // costs nothing.
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
    // Both resolved at this boundary like every other tool, so the sliders
    // keep their stored values while `plan` describes exactly what is being
    // simulated. A `|| 0` rather than `?? 0`: a stored NaN from a
    // hand-edited import is not a rate, and a rate of nothing is no tax.
    withdrawalTaxPct: isTool(t, "taxes") ? s[key("withdrawalTax")] || 0 : 0,
    spendingKeepsPace: isTool(t, "spendingKeepsPace"),
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
  // (1 + yearlyInflation / 100) ^ -yearsOfGrowth, computed exactly as the
  // engine deflates its final checkpoint. It used to be read off the ratio of
  // the two floored ending balances, which drifted by a few parts in ten
  // million with every solve and so moved a stored goal by a dollar or two
  // each time it was converted; a drained plan gave it nothing to read at all.
  const deflator = Math.pow(
    1 + plan.inflationPct / PERCENTAGE_DIVISOR,
    -toMonths(years) / MONTHS_PER_YEAR,
  );
  const toDisplay = (nominal: number) =>
    track === "real" ? Math.round(nominal * deflator) : nominal;

  // The target slider spans THIS plan: up to its no-withdrawal balance where
  // the target solves the withdrawal, and its own projection otherwise. It
  // used to span the balance with every lever at its most favourable bound
  // (a 30% return, a $5,000 contribution), about $72,000,000 for the default
  // plan, which put the user's actual projection at 0.3% of the track and
  // made every touch of the thumb a demand for a different plan. A goal
  // above the span can still be typed; the thumb just sits at the end.
  const maxTarget = Math.max(
    targetSolvesWithdrawal(t) ? noWithdrawalBalance(plan, track) : total,
    total,
    1,
  );
  // As stored, not clamped: the control shows the goal the user set even
  // when the plan does not reach it, and the info row says that it does not
  const displayTarget = toDisplay(s[key("targetValue")] || 0);
  const annualWithdrawal = (withdrawals[0] ?? 0) * 12;
  // The unclamped rate leg, against what the policy actually paid first. Both
  // in nominal dollars at the withdrawal's own month, which is where the
  // engine evaluates the policy.
  const firstWithdrawalMonth = toMonths(plan.withdrawalStartYear);
  const balanceAtStart =
    monthlyMatrix[firstWithdrawalMonth - 1]?.nominal ?? initialAmount;
  const rateLeg = plan.dynamicWithdrawal
    ? (balanceAtStart * plan.dynamicWithdrawal.ratePct) /
      PERCENTAGE_DIVISOR /
      MONTHS_PER_YEAR
    : 0;
  const ceilingBinds =
    plan.dynamicWithdrawal !== undefined &&
    withdrawals.length > 0 &&
    rateLeg > withdrawals[0] + 1;
  // Both sides NOMINAL, whatever is on screen: the schedule records what the
  // plan actually pays out, which is a nominal figure.
  const covers =
    annualWithdrawal > 0
      ? matrix.find(
          (e) => (e.nominal * plan.projectedGain) / 100 >= annualWithdrawal,
        )
      : undefined;

  // The DISPLAY track, deliberately: displayTarget is the stored nominal goal
  // already converted into the units the Target Value control shows, so the
  // two sides of this comparison must be in the same units. Reading the
  // nominal track here would answer a different year whenever Inflated is on,
  // for a goal the user set on the deflated scale.
  //
  // Conversion noise, not a miss. The engine floors each track's balance
  // separately and a goal is converted between tracks by rounding, so a goal
  // set to the ending balance on one track can differ from it on the other:
  // by at most one dollar ABOVE it, either way, and BELOW it by one real
  // dollar on the inflated track or, on the nominal track, by what one real
  // dollar is worth at the horizon, 1 / deflator (about $10 at 6% over 40
  // years). With no inflation the two tracks are one and nothing is
  // tolerated. A goal that close to the balance must still read as reached
  // and must not read as capped; a goal further above the balance is a real
  // miss, whatever the horizon.
  const exact = deflator === 1;
  const slackAbove = exact ? 0 : 1;
  const slackBelow = exact ? 0 : track === "real" ? 1 : Math.ceil(1 / deflator);
  const reaches = (balance: number) => balance + slackAbove >= displayTarget;
  // A plan too short to record a year (the Years slider at 0) still holds
  // its opening balance today, which reaches a goal at or below it now
  const targetReached =
    displayTarget > 0
      ? (matrix.find((e) => reaches(e[track])) ??
        (matrix.length === 0 && reaches(total)
          ? { x: today, nominal: ends.nominal, real: ends.real }
          : undefined))
      : undefined;
  const shortfall = !reaches(total);
  const surplus = total > displayTarget + slackBelow;
  // A withdrawal the plan can never apply - one that begins at the horizon
  // (in the engine's whole months), or a positive one that found the pot
  // empty at every withdrawal month - cannot move the balance at any size
  const withdrawalInert =
    toMonths(plan.withdrawalStartYear) >= toMonths(years) ||
    (plan.monthlyWithdrawal > 0 && withdrawals.length === 0);
  const targetCapped =
    targetSolvesWithdrawal(t) &&
    displayTarget > 0 &&
    (withdrawalInert
      ? shortfall || surplus
      : (shortfall && plan.monthlyWithdrawal <= 0) ||
        (surplus && plan.monthlyWithdrawal >= withdrawalMax));

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
    deflator: track === "real" ? deflator : 1,
    // One order of magnitude below the balance so the slider stays usable at any scale
    targetStep:
      10 ** Math.max(2, Math.floor(Math.log10(Math.max(total, 1000))) - 1),
    targetReached,
    targetCapped,
    ceilingBinds,
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

/**
 * The lane's goal (given in display units) and, where the mode offers one,
 * the fixed withdrawal that reaches it, as ONE slider update.
 *
 * The goal is stored EXACTLY as asked, converted to nominal by this lane's
 * own deflator. It used to be replaced with the balance the solved plan
 * reached, so a goal below the withdrawal's reach snapped back up and the
 * user could not lower it past that point. 0, a cleared box, a negative or a
 * non-finite entry clears the goal and leaves the other sliders where they
 * are.
 *
 * Nothing else ever rides in this update. Basic mode and a dynamic policy
 * have no fixed withdrawal on screen, so there the goal is a marker alone;
 * the assumed return and the contribution are never touched in any mode.
 * Whether the plan then reaches the goal is the lane's to report (see
 * Lane.targetReached and Lane.targetCapped), not a memory kept here.
 */
export function solveLaneTarget(
  lane: Lane,
  target: number,
  toggles: TogglesState,
): Partial<Record<SliderKey, number>> {
  const targetKey = laneKey("targetValue", lane.id);
  if (!(target > 0) || !Number.isFinite(target)) {
    return { [targetKey]: 0 };
  }
  // A goal is held nominal, so one set in today's dollars is stored as the
  // larger figure it is worth at the horizon - far larger on a long, highly
  // inflationary plan. Past the sanity limit every slider is read back
  // through it could not be stored at all, so the goal is capped HERE, in the
  // units the control is showing, and what the box displays is what was
  // stored. Clamping it on the way into state instead left the box showing an
  // unrecognisable figure: at 10% over 100 years a $999,999,999,999 goal
  // converts to 1.4e16, which comes back as $653,613,862,188.
  const largestGoal = Math.floor(SLIDER_LIMITS[targetKey].max * lane.deflator);
  const stored = Math.round(Math.min(target, largestGoal) / lane.deflator);
  if (!targetSolvesWithdrawal(toggles)) {
    return { [targetKey]: stored };
  }
  const solution = solveForTarget(
    lane.plan,
    target,
    lane.track,
    lane.withdrawalMax,
  );
  return {
    ...(solution.monthlyWithdrawal === undefined
      ? {}
      : {
          [laneKey("monthlyWithdrawal", lane.id)]: solution.monthlyWithdrawal,
        }),
    [targetKey]: stored,
  };
}
