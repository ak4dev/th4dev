/* ==================================================
 * FIRE (Financial Independence, Retire Early) Calculator
 *
 * Pure calculation functions for FIRE planning metrics.
 * All functions are stateless and side-effect free.
 * ================================================== */

import {
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
} from "../constants/app-constants";

/* ---------- Types ---------- */

export interface FireInputs {
  /** Current total savings / investments */
  currentSavings: number;
  /** Monthly savings (contributions) */
  monthlySavings: number;
  /** Annual expected return as a percentage (e.g. 10 = 10%) */
  annualReturn: number;
  /** Annual inflation rate as a percentage */
  inflationRate: number;
  /** Annual expenses in retirement */
  annualExpenses: number;
  /** Safe withdrawal rate as a percentage (e.g. 4 = 4%) */
  safeWithdrawalRate: number;
  /** Current age of the user */
  currentAge: number;
  /** Target retirement age for Coast FIRE */
  targetRetirementAge: number;
}

export interface FireResult {
  /** The nest egg needed: annualExpenses / (SWR / 100) */
  fireNumber: number;
  /** Progress toward FIRE Number (0–100) */
  progressPct: number;
  /** Years until portfolio reaches FIRE Number (null if unreachable) */
  yearsToFire: number | null;
  /** Age at FIRE (null if unreachable) */
  fireAge: number | null;
  /**
   * Coast FIRE Number — the amount needed *today* such that growth
   * alone (no further contributions) reaches the FIRE Number by
   * targetRetirementAge.
   */
  coastFireNumber: number;
  /** Whether current savings already exceed Coast FIRE Number */
  isCoastFire: boolean;
  /**
   * Monthly savings needed to hit FIRE Number within
   * (targetRetirementAge - currentAge) years.  null if already reached.
   */
  monthlySavingsNeeded: number | null;
  /**
   * True when the user's target retirement is immediate (currentAge >= targetRetirementAge)
   * but savings have not reached the FIRE Number.
   */
  isShortfall: boolean;
}

/* ---------- Core calculations ---------- */

/**
 * FIRE Number = annual expenses ÷ (safe withdrawal rate / 100).
 * e.g. $40k / 0.04 = $1,000,000.
 */
export function calculateFireNumber(
  annualExpenses: number,
  safeWithdrawalRate: number,
): number {
  if (safeWithdrawalRate <= 0) return Infinity;
  return Math.round(annualExpenses / (safeWithdrawalRate / PERCENTAGE_DIVISOR));
}

/**
 * Iteratively calculates how many years until the portfolio, with
 * monthly compounding and contributions, reaches the target.
 * Returns null if it takes longer than 100 years.
 */
export function yearsToFire(
  currentSavings: number,
  monthlySavings: number,
  annualReturn: number,
  targetAmount: number,
): number | null {
  if (currentSavings >= targetAmount) return 0;
  if (targetAmount <= 0) return 0;

  const monthlyRate = annualReturn / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
  let balance = currentSavings;
  const maxMonths = 100 * MONTHS_PER_YEAR;

  for (let month = 1; month <= maxMonths; month++) {
    balance += balance * monthlyRate;
    balance += monthlySavings;
    if (balance >= targetAmount) {
      return Math.ceil(month / MONTHS_PER_YEAR);
    }
  }

  return null;
}

/**
 * Coast FIRE Number — the amount needed today such that compound
 * growth alone (no contributions) reaches the FIRE Number by
 * the target retirement age.
 *
 * Formula:  coastFIRE = fireNumber / (1 + r/12)^(months)
 */
export function coastFireNumber(
  fireNumber: number,
  annualReturn: number,
  yearsUntilRetirement: number,
): number {
  if (yearsUntilRetirement <= 0) return fireNumber;
  const monthlyRate = annualReturn / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
  const months = yearsUntilRetirement * MONTHS_PER_YEAR;
  return Math.round(fireNumber / Math.pow(1 + monthlyRate, months));
}

/**
 * Calculates the monthly savings required to reach a target balance
 * within a given number of years, given current savings and return rate.
 *
 * Uses the future-value-of-annuity formula solved for PMT.
 */
export function monthlySavingsNeeded(
  currentSavings: number,
  annualReturn: number,
  targetAmount: number,
  years: number,
): number | null {
  if (currentSavings >= targetAmount) return null;
  if (years <= 0) return null;

  const r = annualReturn / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
  const n = years * MONTHS_PER_YEAR;

  if (r === 0) {
    // No growth — pure savings
    return Math.ceil((targetAmount - currentSavings) / n);
  }

  // Future value of current savings
  const fvCurrent = currentSavings * Math.pow(1 + r, n);
  const remaining = targetAmount - fvCurrent;

  if (remaining <= 0) return 0;

  // Future value of annuity factor
  const fvAnnuity = (Math.pow(1 + r, n) - 1) / r;
  return Math.ceil(remaining / fvAnnuity);
}

/* ---------- Combined result ---------- */

/**
 * Computes all FIRE metrics from a single set of inputs.
 */
export function calculateFire(inputs: FireInputs): FireResult {
  const {
    currentSavings,
    monthlySavings,
    annualReturn,
    annualExpenses,
    safeWithdrawalRate,
    currentAge,
    targetRetirementAge,
  } = inputs;

  const fireNum = calculateFireNumber(annualExpenses, safeWithdrawalRate);
  const progressPct = fireNum > 0
    ? Math.min(100, Math.round((currentSavings / fireNum) * PERCENTAGE_DIVISOR))
    : 0;

  const yrsToFire = yearsToFire(
    currentSavings,
    monthlySavings,
    annualReturn,
    fireNum,
  );

  const yearsUntilRetirement = Math.max(0, targetRetirementAge - currentAge);
  const coastNum = coastFireNumber(fireNum, annualReturn, yearsUntilRetirement);

  const needed = monthlySavingsNeeded(
    currentSavings,
    annualReturn,
    fireNum,
    yearsUntilRetirement,
  );

  return {
    fireNumber: fireNum,
    progressPct,
    yearsToFire: yrsToFire,
    fireAge: yrsToFire !== null ? currentAge + yrsToFire : null,
    coastFireNumber: coastNum,
    isCoastFire: currentSavings >= coastNum,
    monthlySavingsNeeded: needed,
    isShortfall: yearsUntilRetirement <= 0 && progressPct < 100 && fireNum > 0,
  };
}
