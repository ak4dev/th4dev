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
 * projection. All year-valued parameters accept fractional
 * values (e.g. 10.5 years), which are resolved to whole
 * months from today.
 * ================================================== */

import {
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
} from "../constants/app-constants";
import type { DynamicWithdrawal } from "../types/types";
import {
  dynamicMonthlyWithdrawal,
  toMonths,
} from "./investment-growth-calculator";

/* ---------- Types ---------- */

export interface MonteCarloParams {
  initialAmount: number;
  projectedGain: number;
  yearsOfGrowth: number;
  monthlyContribution: number;
  monthlyWithdrawal: number;
  withdrawalStartYear: number;
  contributionStopYear?: number;
  depreciationRate: number;
  annualFee?: number;
  showInflation: boolean;
  /** Annual return standard deviation in percentage points (default 12) */
  volatility: number;
  /** Number of simulations to run (default 500) */
  simCount: number;
  /** Percentage-of-balance withdrawal policy; replaces monthlyWithdrawal when set */
  dynamicWithdrawal?: DynamicWithdrawal;
  /** Seed for a deterministic random stream; Math.random is used when absent */
  seed?: number;
}

export interface PercentileBand {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

interface LumpSumInjection {
  /** Years from today after which the lump sum is added (fractional allowed) */
  year: number;
  /** Amount to inject into the balance */
  amount: number;
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

/* ---------- Single Simulation ---------- */

/**
 * Simulates one randomised path month-by-month.
 *
 * The returned array has one entry per completed year (index 0 = today's
 * balance), plus one final entry for a trailing partial year when
 * yearsOfGrowth is fractional.
 */
function simulateOnce(
  params: MonteCarloParams,
  random: Random,
  injection?: LumpSumInjection,
): number[] {
  const {
    initialAmount,
    projectedGain,
    yearsOfGrowth,
    monthlyContribution,
    monthlyWithdrawal,
    withdrawalStartYear,
    contributionStopYear,
    depreciationRate,
    annualFee = 0,
    showInflation,
    volatility,
    dynamicWithdrawal,
  } = params;

  const totalMonths = Math.max(0, toMonths(yearsOfGrowth));
  // Cash-flow windows use the same months-from-today resolution as
  // InvestmentCalculator: contribute while month < toMonths(stop) (a falsy
  // stop year means "until the horizon"), withdraw once
  // month >= toMonths(start), and land the rollover after the month that
  // completes toMonths(year) months.
  const contributionEndMonth = toMonths(contributionStopYear || yearsOfGrowth);
  const withdrawalStartMonth = toMonths(withdrawalStartYear);
  const injectionMonth = injection ? toMonths(injection.year) : -1;
  const monthlyFeeRate = annualFee / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;

  let nominal = initialAmount;
  let inflationAdjusted = initialAmount;
  let monthlyRate = 0;
  let dynamicMonthly = 0;

  const injectIfDue = (monthsDone: number) => {
    if (injection && monthsDone === injectionMonth) {
      nominal += injection.amount;
      inflationAdjusted += injection.amount;
    }
  };

  injectIfDue(0);
  const values: number[] = [showInflation ? inflationAdjusted : nominal];

  for (let month = 0; month < totalMonths; month++) {
    // Randomise the annual return at the start of each simulated year
    if (month % MONTHS_PER_YEAR === 0) {
      monthlyRate =
        (projectedGain + volatility * normalRandom(random)) /
        PERCENTAGE_DIVISOR /
        MONTHS_PER_YEAR;
    }

    // Withdrawals: a dynamic policy is re-evaluated from this path's own
    // balance at the start of every withdrawal year
    const sinceStart = month - withdrawalStartMonth;
    if (
      dynamicWithdrawal &&
      sinceStart >= 0 &&
      sinceStart % MONTHS_PER_YEAR === 0
    ) {
      dynamicMonthly = dynamicMonthlyWithdrawal(nominal, dynamicWithdrawal);
    }
    const withdrawal =
      sinceStart < 0
        ? 0
        : dynamicWithdrawal
          ? dynamicMonthly
          : monthlyWithdrawal;
    nominal -= withdrawal;
    inflationAdjusted -= withdrawal;

    nominal += nominal * monthlyRate;
    inflationAdjusted += inflationAdjusted * monthlyRate;

    if (monthlyFeeRate > 0) {
      nominal -= nominal * monthlyFeeRate;
      inflationAdjusted -= inflationAdjusted * monthlyFeeRate;
    }

    // Contributions earn growth in the month they are made
    if (month < contributionEndMonth) {
      const contribution = monthlyContribution * (1 + monthlyRate);
      nominal += contribution;
      inflationAdjusted += contribution;
    }

    // Year end (or the trailing partial year): apply the pro-rated inflation
    // step, then any rollover due, then record the checkpoint
    const monthsDone = month + 1;
    const chunkMonths = monthsDone % MONTHS_PER_YEAR;
    const yearEnd = chunkMonths === 0 || monthsDone === totalMonths;
    if (yearEnd && depreciationRate > 0) {
      inflationAdjusted *= Math.pow(
        1 - depreciationRate / PERCENTAGE_DIVISOR,
        (chunkMonths || MONTHS_PER_YEAR) / MONTHS_PER_YEAR,
      );
    }
    injectIfDue(monthsDone);
    if (yearEnd) {
      values.push(Math.floor(showInflation ? inflationAdjusted : nominal));
    }
  }

  return values;
}

function simulatePaths(
  params: MonteCarloParams,
  random: Random,
  injection?: LumpSumInjection,
): number[][] {
  return Array.from({ length: params.simCount }, () =>
    simulateOnce(params, random, injection),
  );
}

/* ---------- Path helpers ---------- */

/** Value of a path at `year`, carrying its final value forward past its horizon */
const valueAt = (run: number[], year: number): number =>
  run[Math.min(year, run.length - 1)];

const sumPaths = (runA: number[], runB: number[]): number[] =>
  Array.from(
    { length: Math.max(runA.length, runB.length) },
    (_, year) => valueAt(runA, year) + valueAt(runB, year),
  );

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
 * Runs N simulations and returns raw paths (one number[] per simulation).
 * Each path has floor(yearsOfGrowth) + 1 entries (year 0 = initial amount),
 * plus one extra entry when yearsOfGrowth has a fractional part.
 */
export function simulateAll(params: MonteCarloParams): number[][] {
  return simulatePaths(params, makeRandom(params.seed));
}

/**
 * Computes percentile bands from raw simulation paths.
 */
export function computeBands(paths: number[][]): PercentileBand[] {
  if (paths.length === 0) return [];
  const years = paths[0].length;
  const bands: PercentileBand[] = [];

  for (let year = 0; year < years; year++) {
    const yearValues = paths.map((run) => run[year]).sort((a, b) => a - b);

    bands.push({
      year,
      p10: percentile(yearValues, 10),
      p25: percentile(yearValues, 25),
      p50: percentile(yearValues, 50),
      p75: percentile(yearValues, 75),
      p90: percentile(yearValues, 90),
    });
  }

  return bands;
}

/**
 * Runs paired A+B simulations, sums paths element-wise, returns combined bands.
 * Each investment is simulated for its own horizon; past it, its final value
 * is carried forward as a constant so only the other's randomness drives
 * further widening.
 */
export function runCombinedSimulation(
  paramsA: MonteCarloParams,
  paramsB: MonteCarloParams,
): PercentileBand[] {
  const random = makeRandom(paramsA.seed ?? paramsB.seed);
  const pathsA = simulatePaths(paramsA, random);
  const pathsB = simulatePaths(
    { ...paramsB, simCount: paramsA.simCount },
    random,
  );
  return computeBands(pathsA.map((runA, i) => sumPaths(runA, pathsB[i])));
}

/**
 * Runs paired A+B simulations modelling rollover: A's final value is injected
 * into B as a lump sum at rolloverYear, so B's growth compounds on the larger
 * base. Before rolloverYear the portfolio is A+B; after, it is B alone (which
 * includes A's rolled value). Like the deterministic calculator, a rollover
 * past B's horizon never fires, so the portfolio then stays A+B throughout.
 */
export function runRolloverSimulation(
  paramsA: MonteCarloParams,
  paramsB: MonteCarloParams,
  rolloverYear: number,
): PercentileBand[] {
  const random = makeRandom(paramsA.seed ?? paramsB.seed);
  const fires = toMonths(rolloverYear) <= toMonths(paramsB.yearsOfGrowth);

  const portfolioPaths = simulatePaths(paramsA, random).map((runA) => {
    // ceil() so a fractional rollover year picks up A's trailing partial value
    const aFinal = valueAt(runA, Math.ceil(rolloverYear));
    const runB = simulateOnce(
      paramsB,
      random,
      fires ? { year: rolloverYear, amount: aFinal } : undefined,
    );
    if (!fires) return sumPaths(runA, runB);
    return Array.from(
      { length: Math.max(runA.length, runB.length) },
      (_, year) =>
        year < rolloverYear
          ? valueAt(runA, year) + valueAt(runB, year)
          : valueAt(runB, year),
    );
  });

  return computeBands(portfolioPaths);
}

/**
 * Runs Monte Carlo simulations and returns percentile bands per year.
 * Convenience wrapper around simulateAll + computeBands.
 */
export function runMonteCarloSimulation(
  params: MonteCarloParams,
): PercentileBand[] {
  return computeBands(simulateAll(params));
}
