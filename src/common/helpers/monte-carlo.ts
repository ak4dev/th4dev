/* ==================================================
 * Monte Carlo Simulation Engine
 *
 * Runs N simulations of investment growth with randomised
 * annual returns drawn from a normal distribution around
 * the projected mean.  Extracts percentile bands for
 * charting confidence intervals.
 *
 * All year-valued parameters accept fractional values
 * (e.g. 10.5 years), which are resolved to whole months.
 * ================================================== */

import {
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
} from "../constants/app-constants";

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
}

export interface PercentileBand {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

/* ---------- RNG ---------- */

/**
 * Box–Muller transform: produces a standard-normal variate from two
 * uniform random numbers.  Simple, fast, and sufficient for our needs.
 */
function normalRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- Types (internal) ---------- */

interface LumpSumInjection {
  /** Year at which the lump sum is added (start of that year) */
  year: number;
  /** Amount to inject into the balance */
  amount: number;
}

/* ---------- Helpers ---------- */

/** Converts a (possibly fractional) year count to whole months. */
function toMonths(years: number): number {
  return Math.round(years * MONTHS_PER_YEAR);
}

/* ---------- Single Simulation ---------- */

/**
 * Simulates one randomised path month-by-month.
 *
 * The returned array has one entry per completed year (index 0 = initial
 * amount), plus one final entry for a trailing partial year when
 * yearsOfGrowth is fractional.
 */
function simulateOnce(
  params: MonteCarloParams,
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
  } = params;

  const totalMonths = Math.max(0, toMonths(yearsOfGrowth));
  const values: number[] = [initialAmount];
  let nominal = initialAmount;
  let inflationAdjusted = initialAmount;

  // Contributions apply while inside the (1-based) contribution window;
  // falsy stop year means "contribute until the horizon" (matches the
  // deterministic calculator's semantics).
  const stopYear = contributionStopYear || yearsOfGrowth;
  const contributionEndMonth = toMonths(stopYear - 1);
  const withdrawalStartMonth = Math.max(0, toMonths(withdrawalStartYear - 1));
  const injectionMonth = injection ? toMonths(injection.year - 1) : -1;

  const monthlyFeeRate = annualFee / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
  let monthlyRate = 0;

  for (let month = 0; month < totalMonths; month++) {
    // Randomise the annual return at the start of each simulated year
    if (month % MONTHS_PER_YEAR === 0) {
      const annualReturn = projectedGain + volatility * normalRandom();
      monthlyRate = annualReturn / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
    }

    // Inject lump sum at the start of the injection year
    if (injection && month === injectionMonth) {
      nominal += injection.amount;
      inflationAdjusted += injection.amount;
    }

    // Withdrawals
    if (monthlyWithdrawal > 0 && month >= withdrawalStartMonth) {
      nominal -= monthlyWithdrawal;
      inflationAdjusted -= monthlyWithdrawal;
    }

    // Growth
    nominal += nominal * monthlyRate;
    inflationAdjusted += inflationAdjusted * monthlyRate;

    // Fee deduction (per track)
    if (monthlyFeeRate > 0) {
      nominal -= nominal * monthlyFeeRate;
      inflationAdjusted -= inflationAdjusted * monthlyFeeRate;
    }

    // Contributions
    if (month < contributionEndMonth) {
      nominal += monthlyContribution;
      inflationAdjusted += monthlyContribution;
    }

    // Year boundary: apply annual inflation adjustment and record the value
    if ((month + 1) % MONTHS_PER_YEAR === 0) {
      if (depreciationRate > 0) {
        inflationAdjusted -=
          inflationAdjusted * (depreciationRate / PERCENTAGE_DIVISOR);
      }
      values.push(Math.floor(showInflation ? inflationAdjusted : nominal));
    }
  }

  // Trailing partial year: pro-rate the inflation adjustment and record
  const partialMonths = totalMonths % MONTHS_PER_YEAR;
  if (partialMonths > 0) {
    if (depreciationRate > 0) {
      inflationAdjusted *= Math.pow(
        1 - depreciationRate / PERCENTAGE_DIVISOR,
        partialMonths / MONTHS_PER_YEAR,
      );
    }
    values.push(Math.floor(showInflation ? inflationAdjusted : nominal));
  }

  return values;
}

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
  const { simCount } = params;
  const allRuns: number[][] = [];
  for (let i = 0; i < simCount; i++) {
    allRuns.push(simulateOnce(params));
  }
  return allRuns;
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
 * A is simulated for its own yearsOfGrowth; B is simulated for the max.
 * For years beyond A's timeline, A's final value is carried forward as a
 * constant so only B's randomness drives further widening.
 */
export function runCombinedSimulation(
  paramsA: MonteCarloParams,
  paramsB: MonteCarloParams,
): PercentileBand[] {
  const simCount = paramsA.simCount;
  const maxYears = Math.max(paramsA.yearsOfGrowth, paramsB.yearsOfGrowth);

  const pathsA = simulateAll({ ...paramsA, simCount });
  const pathsB = simulateAll({ ...paramsB, yearsOfGrowth: maxYears, simCount });

  const combined: number[][] = pathsB.map((runB, i) => {
    const runA = pathsA[i];
    const aFinal = runA[runA.length - 1];
    return runB.map((bVal, year) => {
      const aVal = year < runA.length ? runA[year] : aFinal;
      return aVal + bVal;
    });
  });

  return computeBands(combined);
}

/**
 * Runs paired A+B simulations modelling rollover: A's final value is injected
 * into B as a lump-sum at rolloverYear, so B's growth compounds on the larger
 * base. Before rolloverYear the portfolio is A+B; after, it is B alone (which
 * includes A's rolled value).
 */
export function runRolloverSimulation(
  paramsA: MonteCarloParams,
  paramsB: MonteCarloParams,
  rolloverYear: number,
): PercentileBand[] {
  const maxYears = Math.max(paramsA.yearsOfGrowth, paramsB.yearsOfGrowth);

  const pathsA = simulateAll(paramsA);

  const portfolioPaths: number[][] = pathsA.map((runA) => {
    // ceil() so a fractional rollover year picks up A's trailing partial value
    const aFinalIdx = Math.min(Math.ceil(rolloverYear), runA.length - 1);
    const aFinal = runA[aFinalIdx];
    const runB = simulateOnce(
      { ...paramsB, yearsOfGrowth: maxYears, simCount: 1 },
      { year: rolloverYear, amount: aFinal },
    );

    return runB.map((bVal, year) => {
      if (year < rolloverYear) {
        const aVal = year < runA.length ? runA[year] : runA[runA.length - 1];
        return aVal + bVal;
      }
      return bVal;
    });
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
