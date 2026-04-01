/* ==================================================
 * Monte Carlo Simulation Engine
 *
 * Runs N simulations of investment growth with randomised
 * annual returns drawn from a normal distribution around
 * the projected mean.  Extracts percentile bands for
 * charting confidence intervals.
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

/* ---------- Single Simulation ---------- */

function simulateOnce(params: MonteCarloParams): number[] {
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

  const values: number[] = [initialAmount];
  let nominal = initialAmount;
  let inflationAdjusted = initialAmount;

  for (let year = 1; year <= yearsOfGrowth; year++) {
    // Randomise this year's annual return using normal distribution
    const annualReturn =
      projectedGain + volatility * normalRandom();
    const monthlyRate = annualReturn / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
    const monthlyFeeRate =
      annualFee / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;

    for (let month = 0; month < MONTHS_PER_YEAR; month++) {
      // Withdrawals
      if (year >= withdrawalStartYear && monthlyWithdrawal > 0) {
        nominal -= monthlyWithdrawal;
        inflationAdjusted -= monthlyWithdrawal;
      }

      // Growth
      nominal += nominal * monthlyRate;
      inflationAdjusted += inflationAdjusted * monthlyRate;

      // Fee deduction
      if (monthlyFeeRate > 0) {
        const fee = nominal * monthlyFeeRate;
        nominal -= fee;
        inflationAdjusted -= fee;
      }

      // Contributions
      const stopYear = contributionStopYear ?? yearsOfGrowth;
      if (year < stopYear) {
        nominal += monthlyContribution;
        inflationAdjusted += monthlyContribution;
      }
    }

    // Annual inflation adjustment
    if (depreciationRate > 0) {
      inflationAdjusted -=
        inflationAdjusted * (depreciationRate / PERCENTAGE_DIVISOR);
    }

    values.push(Math.floor(showInflation ? inflationAdjusted : nominal));
  }

  return values;
}

/* ---------- Percentile extraction ---------- */

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* ---------- Public API ---------- */

/**
 * Runs N simulations and returns raw paths (one number[] per simulation).
 * Each path has yearsOfGrowth + 1 entries (year 0 = initial amount).
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
    const yearValues = paths
      .map((run) => run[year])
      .sort((a, b) => a - b);

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

  const aLen = paramsA.yearsOfGrowth + 1;

  const combined: number[][] = pathsB.map((runB, i) => {
    const runA = pathsA[i];
    const aFinal = runA[aLen - 1];
    return runB.map((bVal, year) => {
      const aVal = year < aLen ? runA[year] : aFinal;
      return aVal + bVal;
    });
  });

  return computeBands(combined);
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
