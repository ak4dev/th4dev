/* ==================================================
 * Monte Carlo Simulation Engine
 *
 * Runs N simulations of investment growth with randomised
 * annual returns drawn from a normal distribution around
 * the projected mean, and extracts percentile bands for
 * charting confidence intervals.
 *
 * Cash flows are applied month-for-month exactly as
 * InvestmentCalculator applies them, so with zero
 * volatility every path reproduces the deterministic
 * projection. Like that engine, each path carries a single
 * nominal balance and derives the inflation-adjusted
 * ("real") figure by deflating it at each checkpoint, and
 * floors its balance at zero rather than letting a spent
 * portfolio compound a debt. All year-valued parameters
 * accept fractional values (e.g. 10.5 years), which are
 * resolved to whole months from today.
 *
 * Every path carries BOTH tracks and the caller names the
 * one its bands are drawn on. The plan itself no longer
 * carries the Inflated switch: a simulation whose numbers
 * change with a display flag is a simulation whose answer
 * depends on what is on screen, and the deterministic engine
 * gave that up in the same refactor.
 *
 * Checkpoints are dated in MONTHS FROM TODAY, never by
 * array index: every band carries the month it describes
 * (see checkpointMonths), so two lanes with different -
 * possibly fractional - horizons can be summed, spliced and
 * charted without any index arithmetic lining up by luck.
 *
 * ---------- Drift convention ----------
 * projectedGain is the ARITHMETIC MEAN of the annual return
 * draw: each simulated year draws X ~ N(projectedGain,
 * volatility) and applies X/12 as that year's constant
 * monthly rate. Because log(1 + x) is concave, the median
 * of the compounded outcome trails the deterministic plan
 * line, and the gap grows with sigma and horizon (1.5% at
 * sigma 12 over 30 years, 10% at sigma 30). The
 * dashed median and the solid plan line are therefore
 * expected to disagree: one is the middle outcome of a
 * volatile plan, the other is the same plan with the
 * volatility switched off.
 *
 * The alternative - correcting the drift (drawing around
 * projectedGain + sigma^2/2 or similar) so the median lands
 * on the plan line - is DELIBERATELY NOT IMPLEMENTED. It
 * would move every non-zero-volatility figure in the app
 * away from the plain reading of the return slider, which
 * the deterministic engine, the target solver, the
 * portfolio schedule and the totals table all treat as the
 * rate they compound. Do not add it to this file alone.
 * ================================================== */

import {
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
} from "../constants/app-constants";
import type { DisplayTrack, PlanInputs } from "../types/types";
import {
  dynamicMonthlyWithdrawal,
  guardrailIndex,
  toMonths,
} from "./investment-growth-calculator";

/* ---------- Types ---------- */

/**
 * One lane's plan, plus the three settings only a simulated run needs.
 *
 * The plan half is PlanInputs verbatim - the very object the deterministic
 * engine is constructed with, spread straight in - so no hand-written adapter
 * stands between the two engines to drop a field or rename one into a
 * different meaning. Every plan quantity is documented once, on PlanInputs;
 * nothing is re-described here.
 *
 * The rollover trio is deliberately omitted. This engine models a rollover at
 * the PORTFOLIO level - runRolloverSimulation injects A's own simulated ending
 * balance into B - so honouring a lane's `investmentToRoll` as well would land
 * the money twice. Leaving those three fields out of the type is what says so.
 */
export interface MonteCarloParams extends Omit<
  PlanInputs,
  "rollOver" | "investmentToRoll" | "yearOfRollover"
> {
  /** Annual return standard deviation in percentage points (default 12) */
  volatility: number;
  /** Number of simulations to run (default 500) */
  simCount: number;
  /** Seed for a deterministic random stream; Math.random is used when absent */
  seed?: number;
}

export interface PercentileBand {
  /** Whole months from today that this band describes */
  months: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /**
   * Share of simulated portfolios (0-1) that have been at or below zero at
   * this checkpoint or any earlier one: the probability the plan has run out
   * of money by then. It is cumulative, so a path refilled by later
   * contributions keeps counting - having run out is what the figure claims.
   * It is measured on the portfolio the band describes, so in combined and
   * rollover mode it is the summed/spliced path, not either leg on its own.
   */
  depletedPct: number;
}

interface LumpSumInjection {
  /** Whole months from today after which the lump sum lands */
  month: number;
  /**
   * NOMINAL amount to add, exactly as InvestmentCalculator adds
   * investmentToRoll.nominal to its own single nominal balance. The receiving
   * lane deflates its balance at every checkpoint, so a rolled figure is
   * charged inflation once, for its own elapsed time, and never twice.
   */
  amount: number;
}

interface SimOptions {
  injection?: LumpSumInjection;
  /** Checkpoint months to record; defaults to this lane's own grid */
  grid?: number[];
}

/**
 * One simulated path, sampled on the caller's month grid and carried on BOTH
 * tracks, exactly as LineGraphEntry carries the deterministic engine's
 * checkpoints. A single nominal balance is simulated and `real` is that same
 * balance deflated, so which of the two a cone is drawn on is a decision for
 * the view - taken when the bands are extracted, never inside the loop. Both
 * are floored exactly as InvestmentCalculator floors its matrix rows, so a
 * checkpoint rolled into another lane is the same figure the deterministic
 * engine rolls.
 */
interface SimPath {
  /** Balance in the dollars of the checkpoint's own month */
  nominal: number[];
  /** The same checkpoints in today's dollars */
  real: number[];
}

/* ---------- RNG ---------- */

type Random = () => number;

/** mulberry32: a small, fast seeded PRNG yielding uniforms in [0, 1) */
function mulberry32(seed: number): Random {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRandom(seed?: number): Random {
  return seed === undefined ? Math.random : mulberry32(seed);
}

/** Box-Muller transform: a standard-normal variate from two uniforms */
function normalRandom(random: Random): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- Checkpoint grid ---------- */

/**
 * The months from today at which a lane of `years` is sampled: today, every
 * completed year, and the horizon itself when it is fractional. This is
 * exactly the grid simulateOnce walks, and it is what a band's `months`
 * reports, so nothing downstream has to infer a date from an array index.
 *
 * @param years - Horizon in years (fractional allowed)
 * @returns Ascending, duplicate-free months, always starting at 0
 */
export function checkpointMonths(years: number): number[] {
  const totalMonths = Math.max(0, toMonths(years));
  const months: number[] = [];
  for (let m = 0; m <= totalMonths; m += MONTHS_PER_YEAR) months.push(m);
  if (months[months.length - 1] !== totalMonths) months.push(totalMonths);
  return months;
}

/**
 * The union of two lanes' grids. Pairing two lanes on this grid is what keeps
 * months, rather than array indices, the key: a lane with a fractional horizon
 * no longer pushes the other lane's whole-year checkpoints off their dates.
 */
const sharedGrid = (a: MonteCarloParams, b: MonteCarloParams): number[] =>
  [
    ...new Set([
      ...checkpointMonths(a.yearsOfGrowth),
      ...checkpointMonths(b.yearsOfGrowth),
    ]),
  ].sort((x, y) => x - y);

/* ---------- Single Simulation ---------- */

/**
 * Simulates one randomised path month-by-month, recording a checkpoint at
 * every month in `grid` (its own grid by default). Grid months beyond this
 * lane's horizon repeat its final value, so a shorter lane contributes a
 * constant to a longer portfolio instead of ending the series early.
 */
function simulateOnce(
  params: MonteCarloParams,
  random: Random,
  { injection, grid = checkpointMonths(params.yearsOfGrowth) }: SimOptions = {},
): SimPath {
  const {
    initialAmount,
    projectedGain,
    yearsOfGrowth,
    monthlyContribution,
    monthlyWithdrawal,
    withdrawalStartYear,
    contributionStopYear,
    inflationPct,
    annualFeePct = 0,
    volatility,
    dynamicWithdrawal,
  } = params;

  const totalMonths = Math.max(0, toMonths(yearsOfGrowth));
  // Cash-flow windows use the same months-from-today resolution as
  // InvestmentCalculator: contribute while month < toMonths(stop) (an unset
  // stop year, and only an unset one, means "until the horizon"), withdraw
  // once month >= toMonths(start), and land the rollover after the month that
  // completes injection.month months.
  const contributionEndMonth = toMonths(contributionStopYear ?? yearsOfGrowth);
  const withdrawalStartMonth = toMonths(withdrawalStartYear);
  const monthlyFeeRate = annualFeePct / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
  // Fisher deflator (1 + i)^-t, not (1 - i)^t; the minus sign belongs to the
  // exponent, so a zero rate leaves every checkpoint untouched
  const inflationFactor = 1 + inflationPct / PERCENTAGE_DIVISOR;

  let nominal = initialAmount;
  let monthlyRate = 0;
  let dynamicMonthly = 0;

  const injectIfDue = (monthsDone: number) => {
    if (injection && monthsDone === injection.month) {
      nominal += injection.amount;
    }
  };

  const nominalTrack: number[] = [];
  const realTrack: number[] = [];
  let next = 0;
  /**
   * Records every grid entry falling on this month, on both tracks. The grid
   * is ascending and monthsDone advances one month at a time, so a single
   * cursor visits each entry exactly once, whatever mid-year months the other
   * lane contributed.
   */
  const record = (monthsDone: number) => {
    while (next < grid.length && grid[next] === monthsDone) {
      nominalTrack.push(Math.floor(nominal));
      realTrack.push(
        Math.floor(
          nominal * Math.pow(inflationFactor, -monthsDone / MONTHS_PER_YEAR),
        ),
      );
      next++;
    }
  };

  injectIfDue(0);
  record(0);

  for (let month = 0; month < totalMonths; month++) {
    // Randomise the annual return at the start of each simulated year. A draw
    // held for k months moves the log balance by k*X/1200, so its standard
    // deviation is k*sigma/1200 where a k-month slice should carry
    // sqrt(k/12)*sigma/100; equating the two gives the sqrt(12/k) factor
    // below. The drift is already pro-rated correctly by k, and this consumes
    // no extra randomness, so every seeded stream and every whole-year chunk
    // (the only kind an integer horizon has) is unchanged.
    if (month % MONTHS_PER_YEAR === 0) {
      const chunk = Math.min(MONTHS_PER_YEAR, totalMonths - month);
      const shock =
        volatility * Math.sqrt(MONTHS_PER_YEAR / chunk) * normalRandom(random);
      monthlyRate =
        (projectedGain + shock) / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
    }

    // Withdrawals: a dynamic policy is re-evaluated from this path's own
    // balance at the start of every withdrawal year, with its guardrails
    // indexed to that month so they hold their value in today's dollars
    const sinceStart = month - withdrawalStartMonth;
    if (
      dynamicWithdrawal &&
      sinceStart >= 0 &&
      sinceStart % MONTHS_PER_YEAR === 0
    ) {
      dynamicMonthly = dynamicMonthlyWithdrawal(
        nominal,
        dynamicWithdrawal,
        guardrailIndex(inflationPct, month),
      );
    }
    const requested =
      sinceStart < 0
        ? 0
        : dynamicWithdrawal
          ? dynamicMonthly
          : monthlyWithdrawal;
    // A path can only spend what it holds, exactly as InvestmentCalculator
    // caps its draw: the balance floors at zero instead of going negative and
    // compounding a debt for the rest of the horizon
    nominal -= Math.min(requested, Math.max(0, nominal));
    if (nominal <= 0) nominal = 0;

    nominal += nominal * monthlyRate;

    if (monthlyFeeRate > 0) {
      nominal -= nominal * monthlyFeeRate;
    }

    // Contributions earn growth in the month they are made
    if (month < contributionEndMonth) {
      nominal += monthlyContribution * (1 + monthlyRate);
    }

    // Apply any rollover due, then record whatever checkpoints land here
    const monthsDone = month + 1;
    injectIfDue(monthsDone);
    record(monthsDone);
  }

  // Grid months past this lane's own horizon hold its final value
  while (next < grid.length) {
    nominalTrack.push(nominalTrack[nominalTrack.length - 1]);
    realTrack.push(realTrack[realTrack.length - 1]);
    next++;
  }

  return { nominal: nominalTrack, real: realTrack };
}

function simulatePaths(
  params: MonteCarloParams,
  random: Random,
  options?: SimOptions,
): SimPath[] {
  return Array.from({ length: params.simCount }, () =>
    simulateOnce(params, random, options),
  );
}

/** Picks the track a view is drawing off paths that always carry both */
const tracked = (paths: SimPath[], track: DisplayTrack): number[][] =>
  paths.map((path) => path[track]);

/* ---------- Percentile extraction ---------- */

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* ---------- Public API ---------- */

/**
 * Which track every band below is drawn on. It is an argument, never a field
 * of the plan: the paths always carry both, and the Inflated toggle is a
 * property of the view that is reading them. "nominal" is the money track -
 * what the plan will actually hold - which is what anything but a display
 * wants.
 */
const DEFAULT_TRACK: DisplayTrack = "nominal";

/**
 * Runs N simulations and returns raw paths (one number[] per simulation) on
 * this lane's own checkpoint grid: one entry per completed year (index 0 =
 * today), plus one for a trailing partial year. Use checkpointMonths() to
 * date them.
 */
export function simulateAll(
  params: MonteCarloParams,
  track: DisplayTrack = DEFAULT_TRACK,
): number[][] {
  return tracked(simulatePaths(params, makeRandom(params.seed)), track);
}

/**
 * Computes percentile bands from raw simulation paths, dated by `grid` (whole
 * years from today by default).
 *
 * The depletion probability is measured here rather than inside simulateOnce
 * because it is a property of the portfolio the band describes: in combined
 * and rollover mode the paths handed in are already summed or spliced, and a
 * per-leg first-zero month would measure the wrong series. It is cumulative -
 * once a funded path has been seen at or below zero it stays counted - so the
 * figure answers "has this plan run out by now", not "is it empty at this
 * instant". A path that has never held a positive balance has nothing to run
 * out of and is not counted.
 */
export function computeBands(
  paths: number[][],
  grid?: number[],
): PercentileBand[] {
  if (paths.length === 0) return [];
  const checkpoints = paths[0].length;
  const monthsAt = (i: number) => grid?.[i] ?? i * MONTHS_PER_YEAR;
  const ranOut = paths.map(() => false);
  // A path only counts as "run out" once it has held money to lose. A plan
  // that starts at zero and is being funded up sits at zero on checkpoint 0
  // through no failure of its own, and the deterministic engine agrees: it
  // records a depletion month only when a withdrawal was actually requested.
  const funded = paths.map(() => false);
  const bands: PercentileBand[] = [];

  for (let i = 0; i < checkpoints; i++) {
    let depleted = 0;
    const values = paths.map((run, p) => {
      if (run[i] > 0) funded[p] = true;
      else if (funded[p]) ranOut[p] = true;
      if (ranOut[p]) depleted++;
      return run[i];
    });
    values.sort((a, b) => a - b);

    bands.push({
      months: monthsAt(i),
      p10: percentile(values, 10),
      p25: percentile(values, 25),
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      p90: percentile(values, 90),
      depletedPct: depleted / values.length,
    });
  }

  return bands;
}

/**
 * Runs paired A+B simulations, sums paths element-wise, returns combined bands.
 * Each investment is simulated for its own horizon; past it, its final value
 * is carried forward as a constant so only the other's randomness drives
 * further widening. Both lanes are sampled on the union of their grids, so a
 * fractional horizon adds a row of its own rather than displacing one.
 */
export function runCombinedSimulation(
  paramsA: MonteCarloParams,
  paramsB: MonteCarloParams,
  track: DisplayTrack = DEFAULT_TRACK,
): PercentileBand[] {
  const random = makeRandom(paramsA.seed ?? paramsB.seed);
  const grid = sharedGrid(paramsA, paramsB);
  const pathsA = simulatePaths(paramsA, random, { grid });
  const pathsB = simulatePaths(
    { ...paramsB, simCount: paramsA.simCount },
    random,
    { grid },
  );
  return computeBands(
    pathsA.map((pathA, i) =>
      pathA[track].map((value, k) => value + pathsB[i][track][k]),
    ),
    grid,
  );
}

/**
 * Runs both lanes as independent portfolios off ONE shared random stream,
 * consumed sequentially, and returns a band set per lane on that lane's own
 * grid.
 *
 * Two separate runMonteCarloSimulation calls would restart the same seeded
 * stream and hand path i of B exactly the shocks of path i of A, making the
 * lanes perfectly correlated - invisible in the marginal percentiles drawn
 * today, and wrong for anything that ever pairs the two path sets.
 */
export function runIndividualSimulations(
  paramsA: MonteCarloParams,
  paramsB: MonteCarloParams,
  track: DisplayTrack = DEFAULT_TRACK,
): { a: PercentileBand[]; b: PercentileBand[] } {
  const random = makeRandom(paramsA.seed ?? paramsB.seed);
  const gridA = checkpointMonths(paramsA.yearsOfGrowth);
  const gridB = checkpointMonths(paramsB.yearsOfGrowth);
  const pathsA = simulatePaths(paramsA, random, { grid: gridA });
  const pathsB = simulatePaths(paramsB, random, { grid: gridB });
  return {
    a: computeBands(tracked(pathsA, track), gridA),
    b: computeBands(tracked(pathsB, track), gridB),
  };
}

/**
 * Runs paired A+B simulations modelling rollover: A's ending balance is
 * injected into B as a lump sum at A's finish year, so B's growth compounds on
 * the larger base. Before that month the portfolio is A+B; from it on, B alone
 * (which now includes A's rolled value).
 *
 * The rollover date is not a parameter because the product semantic fixes it:
 * "A's ending balance rolls into B at A's finish year". The injected figure is
 * A's final checkpoint on the nominal track, floored exactly as the
 * deterministic engine floors the matrix row it rolls. A rollover past B's
 * horizon never fires, so the portfolio then stays A+B throughout.
 */
export function runRolloverSimulation(
  paramsA: MonteCarloParams,
  paramsB: MonteCarloParams,
  track: DisplayTrack = DEFAULT_TRACK,
): PercentileBand[] {
  const random = makeRandom(paramsA.seed ?? paramsB.seed);
  const grid = sharedGrid(paramsA, paramsB);
  const rolloverMonth = Math.max(0, toMonths(paramsA.yearsOfGrowth));
  const fires = rolloverMonth <= Math.max(0, toMonths(paramsB.yearsOfGrowth));

  const portfolioPaths = simulatePaths(paramsA, random, { grid }).map(
    (pathA) => {
      // A is sampled on the shared grid, so its last entry is its horizon
      // value carried forward: the balance at the rollover month itself
      const amount = pathA.nominal[pathA.nominal.length - 1];
      const pathB = simulateOnce(paramsB, random, {
        grid,
        injection: fires ? { month: rolloverMonth, amount } : undefined,
      });
      return grid.map((months, k) =>
        fires && months >= rolloverMonth
          ? pathB[track][k]
          : pathA[track][k] + pathB[track][k],
      );
    },
  );

  return computeBands(portfolioPaths, grid);
}

/**
 * Runs Monte Carlo simulations and returns percentile bands per checkpoint.
 * Convenience wrapper around simulateAll + computeBands.
 */
export function runMonteCarloSimulation(
  params: MonteCarloParams,
  track: DisplayTrack = DEFAULT_TRACK,
): PercentileBand[] {
  return computeBands(
    simulateAll(params, track),
    checkpointMonths(params.yearsOfGrowth),
  );
}
