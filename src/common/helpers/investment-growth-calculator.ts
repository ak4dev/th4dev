/* ==================================================
 * Investment Growth Calculator
 * ================================================== */

import { addMonths } from "date-fns";
import type {
  DynamicWithdrawal,
  InvestmentCalculatorProps,
  LineGraphEntry,
} from "../types/types";
import {
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
  MAX_PROJECTED_GAIN,
  MAX_YEARS_OF_GROWTH,
} from "../constants/app-constants";
import { formatCurrency } from "./format";

/** Converts a (possibly fractional) year offset into whole months, e.g. 10.5 -> 126 */
export function toMonths(years: number): number {
  return Math.round(years * MONTHS_PER_YEAR);
}

/**
 * Monthly amount for one dynamic-withdrawal year: ratePct% of the balance,
 * spread over 12 months and clamped to the guardrails (the floor wins when it
 * exceeds the ceiling).
 */
export function dynamicMonthlyWithdrawal(
  balance: number,
  { ratePct, floor, ceiling }: DynamicWithdrawal,
): number {
  const monthly = (balance * ratePct) / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
  return Math.min(Math.max(monthly, floor), Math.max(ceiling, floor));
}

/**
 * Investment Growth Calculator
 *
 * Handles complex investment growth calculations including:
 * - Monthly compound growth
 * - Regular contributions and fixed or percentage-of-balance withdrawals
 * - Fractional (partial) years for horizon, contribution stop, and withdrawal start
 * - Inflation adjustments
 * - Investment rollovers
 * - Data generation for charting
 *
 * All year-valued inputs (yearsOfGrowth, yearContributionsStop,
 * yearWithdrawalsBegin, yearOfRollover) accept fractional values, which are
 * resolved to whole months from today (e.g. 10.5 years -> 126 months).
 * Monte Carlo (monte-carlo.ts) applies the same cash flows in the same order.
 */
export class InvestmentCalculator {
  private readonly props: InvestmentCalculatorProps;
  private readonly today: Date = new Date();
  private readonly growthMatrix: LineGraphEntry[] = [];
  private readonly withdrawalSchedule: number[] = [];
  private cumulativeFees = 0;
  /** Absolute months elapsed since today while simulating */
  private monthsElapsed = 0;
  /** Monthly amount in force for the current dynamic-withdrawal year */
  private dynamicMonthly = 0;
  private nominal = 0;
  private inflationAdjusted = 0;

  constructor(props: InvestmentCalculatorProps) {
    this.props = props;
  }

  /* ==================================================
   * Public Methods
   * ================================================== */

  /**
   * Calculates the final investment value after all growth, contributions, and withdrawals
   * @param showInflation - Whether to return inflation-adjusted value
   * @returns Object containing both the formatted currency string and the raw numeric value
   */
  public calculateGrowth(showInflation: boolean): {
    formatted: string;
    numeric: number;
  } {
    if (!this.isValidInput()) {
      return { formatted: "", numeric: 0 };
    }

    this.growthMatrix.length = 0;
    this.withdrawalSchedule.length = 0;
    this.cumulativeFees = 0;
    this.monthsElapsed = 0;
    this.dynamicMonthly = 0;
    this.nominal = parseInt(this.props.currentAmount || "0") || 0;
    this.inflationAdjusted = this.nominal;
    // A rollover due at month 0 lands before the first month is simulated
    this.applyRolloverIfDue();

    const monthlyGrowthRate =
      this.props.projectedGain / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
    const totalMonths = toMonths(this.props.yearsOfGrowth);

    // Year-long chunks rolling from today (months 0-11, 12-23, ...); a
    // trailing partial year is simply a shorter final chunk
    for (let start = 0; start < totalMonths; start += MONTHS_PER_YEAR) {
      const months = Math.min(MONTHS_PER_YEAR, totalMonths - start);
      this.simulateChunk(months, monthlyGrowthRate);
      this.growthMatrix.push({
        x: addMonths(this.today, start + months),
        y: Math.floor(showInflation ? this.inflationAdjusted : this.nominal),
        alternateY: Math.floor(
          showInflation ? this.nominal : this.inflationAdjusted,
        ),
      });
    }

    const numeric = Math.floor(
      showInflation ? this.inflationAdjusted : this.nominal,
    );
    return { formatted: formatCurrency(numeric), numeric };
  }

  /**
   * Returns the growth matrix data for charting: entry k is the balance at
   * the end of simulated year k+1 (there is no "today" row), plus one final
   * entry for a trailing partial year.
   */
  public getGrowthMatrix(): LineGraphEntry[] {
    return this.growthMatrix;
  }

  /**
   * Returns the withdrawal actually applied in each simulated month (0 where
   * none was taken). Only meaningful after calculateGrowth() has been called.
   */
  public getWithdrawalSchedule(): number[] {
    return this.withdrawalSchedule;
  }

  /**
   * Returns the cumulative fees paid over the full investment horizon.
   * Only meaningful after calculateGrowth() has been called.
   */
  public getCumulativeFees(): number {
    return Math.floor(this.cumulativeFees);
  }

  /* ==================================================
   * Private Calculation Methods
   * ================================================== */

  /**
   * Validates that required inputs are present and within acceptable bounds
   * @returns True if inputs are valid, false otherwise
   */
  private isValidInput(): boolean {
    const { currentAmount, projectedGain, yearsOfGrowth } = this.props;
    if (!currentAmount) return false;
    return (
      Number(currentAmount) >= 0 &&
      projectedGain >= 0 &&
      projectedGain <= MAX_PROJECTED_GAIN &&
      yearsOfGrowth >= 0 &&
      yearsOfGrowth <= MAX_YEARS_OF_GROWTH
    );
  }

  /**
   * Simulates `months` consecutive months, then applies the chunk's
   * (pro-rated) inflation step and any rollover due at its end.
   * @param months - Months in this chunk (12 for full years)
   * @param monthlyGrowthRate - Monthly growth rate as decimal
   */
  private simulateChunk(months: number, monthlyGrowthRate: number): void {
    for (let month = 0; month < months; month++) {
      const withdrawal = this.currentWithdrawal();
      this.withdrawalSchedule.push(withdrawal);
      this.nominal -= withdrawal;
      this.inflationAdjusted -= withdrawal;

      this.nominal += this.nominal * monthlyGrowthRate;
      this.inflationAdjusted += this.inflationAdjusted * monthlyGrowthRate;

      // Fees are charged per track so the inflation-adjusted balance is not
      // overcharged with the nominal fee
      if (this.props.annualFee) {
        const monthlyFeeRate =
          this.props.annualFee / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
        const fee = this.nominal * monthlyFeeRate;
        this.nominal -= fee;
        this.inflationAdjusted -= this.inflationAdjusted * monthlyFeeRate;
        this.cumulativeFees += fee;
      }

      // Contributions earn growth in the month they are made
      if (this.shouldApplyContribution()) {
        const contribution =
          this.props.monthlyContribution * (1 + monthlyGrowthRate);
        this.nominal += contribution;
        this.inflationAdjusted += contribution;
      }

      this.monthsElapsed++;
      // A rollover due at the chunk end lands after the inflation step below
      if (month < months - 1) this.applyRolloverIfDue();
    }

    if (this.props.depreciationRate) {
      this.inflationAdjusted *= Math.pow(
        1 - this.props.depreciationRate / PERCENTAGE_DIVISOR,
        months / MONTHS_PER_YEAR,
      );
    }
    this.applyRolloverIfDue();
  }

  /* ==================================================
   * Private Cash-Flow Methods
   * ================================================== */

  /**
   * Withdrawal for the month about to be simulated. Withdrawals begin
   * yearWithdrawalsBegin years from today and only apply in advanced mode.
   * A dynamic policy replaces the fixed amount: it is re-evaluated from the
   * nominal balance at the first withdrawal month and every 12 months after.
   */
  private currentWithdrawal(): number {
    const { advanced, dynamicWithdrawal, monthlyWithdrawal } = this.props;
    const sinceStart =
      this.monthsElapsed - toMonths(this.props.yearWithdrawalsBegin);
    if (!advanced || sinceStart < 0) return 0;
    if (!dynamicWithdrawal) return monthlyWithdrawal;
    if (sinceStart % MONTHS_PER_YEAR === 0) {
      this.dynamicMonthly = dynamicMonthlyWithdrawal(
        this.nominal,
        dynamicWithdrawal,
      );
    }
    return this.dynamicMonthly;
  }

  /**
   * Contributions stop yearContributionsStop years from today; outside
   * advanced mode, or with a falsy stop year, they never stop.
   */
  private shouldApplyContribution(): boolean {
    const { advanced, yearContributionsStop } = this.props;
    return (
      !advanced ||
      !yearContributionsStop ||
      this.monthsElapsed < toMonths(yearContributionsStop)
    );
  }

  /**
   * Adds the rolled-over balance once exactly yearOfRollover years from today
   * have been simulated. Each track receives its own figure so an
   * inflation-adjusted amount is not deflated again here.
   */
  private applyRolloverIfDue(): void {
    const { rollOver, investmentToRoll, yearOfRollover } = this.props;
    if (
      !rollOver ||
      !investmentToRoll ||
      yearOfRollover === undefined ||
      this.monthsElapsed !== toMonths(yearOfRollover)
    ) {
      return;
    }
    const roll =
      typeof investmentToRoll === "number"
        ? { nominal: investmentToRoll, inflationAdjusted: investmentToRoll }
        : investmentToRoll;
    this.nominal += roll.nominal;
    this.inflationAdjusted += roll.inflationAdjusted;
  }
}
