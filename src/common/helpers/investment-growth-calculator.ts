/* ==================================================
 * Investment Growth Calculator
 * ================================================== */

import { addMonths, addYears } from "date-fns";
import type { InvestmentCalculatorProps, LineGraphEntry } from "../types/types";
import {
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
  MAX_PROJECTED_GAIN,
  MAX_YEARS_OF_GROWTH,
} from "../constants/app-constants";

/**
 * Investment Growth Calculator
 *
 * Handles complex investment growth calculations including:
 * - Monthly compound growth
 * - Regular contributions and withdrawals
 * - Fractional (partial) years for horizon, contribution stop, and withdrawal start
 * - Inflation adjustments
 * - Investment rollovers
 * - Data generation for charting
 *
 * All year-valued inputs (yearsOfGrowth, yearContributionsStop,
 * yearWithdrawalsBegin, yearOfRollover) accept fractional values, which are
 * resolved to whole months (e.g. 10.5 years → 126 months from today).
 */
export class InvestmentCalculator {
  private readonly props: InvestmentCalculatorProps;
  private readonly today: Date = new Date();
  private readonly currentMonth: number = this.today.getMonth();
  private readonly growthMatrix: LineGraphEntry[] = [];
  private cumulativeFees: number = 0;
  /** Absolute months elapsed since today while simulating */
  private monthsElapsed: number = 0;

  /**
   * Creates an instance of InvestmentCalculator
   * @param investmentCalculatorProps - Configuration for investment calculations
   */
  constructor(investmentCalculatorProps: InvestmentCalculatorProps) {
    this.props = investmentCalculatorProps;
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

    // Reset growth data for this calculation run
    this.growthMatrix.length = 0;
    this.cumulativeFees = 0;
    this.monthsElapsed = 0;

    // Initialize calculation variables
    let nominalAmount = this.getInitialAmount();
    let inflationAdjustedAmount = nominalAmount;
    const monthlyGrowthRate = this.getMonthlyGrowthRate();

    const fullYears = Math.floor(this.props.yearsOfGrowth);
    const extraMonths =
      Math.round(this.props.yearsOfGrowth * MONTHS_PER_YEAR) -
      fullYears * MONTHS_PER_YEAR;

    // Calculate growth year by year (whole years)
    for (let year = 0; year <= fullYears; year++) {
      const result = this.calculateYearGrowth(
        year,
        nominalAmount,
        inflationAdjustedAmount,
        monthlyGrowthRate,
        MONTHS_PER_YEAR,
      );

      nominalAmount = result.nominal;
      inflationAdjustedAmount = result.inflationAdjusted;

      // Store data point for charting
      this.addGrowthDataPoint(
        addYears(this.today, year),
        nominalAmount,
        inflationAdjustedAmount,
        showInflation,
      );
    }

    // Process the final partial year, if any (e.g. the ".5" in 10.5 years)
    if (extraMonths > 0) {
      const result = this.calculateYearGrowth(
        fullYears + 1,
        nominalAmount,
        inflationAdjustedAmount,
        monthlyGrowthRate,
        extraMonths,
      );

      nominalAmount = result.nominal;
      inflationAdjustedAmount = result.inflationAdjusted;

      this.addGrowthDataPoint(
        addMonths(addYears(this.today, fullYears), extraMonths),
        nominalAmount,
        inflationAdjustedAmount,
        showInflation,
      );
    }

    const finalAmount = showInflation ? inflationAdjustedAmount : nominalAmount;
    const numeric = Math.floor(finalAmount);
    return { formatted: this.formatCurrency(numeric), numeric };
  }

  /**
   * Returns inflation-adjusted amount for a given value
   * @param amount - The amount to adjust for inflation
   * @returns The inflation-adjusted amount
   */
  public getInflationAdjusted(amount: number): number {
    const depreciation = this.calculateDepreciation(
      amount,
      this.props.depreciationRate,
    );
    return Math.floor(amount - depreciation);
  }

  /**
   * Returns the growth matrix data for charting
   * @returns Array of line graph entries containing date and value data
   */
  public getGrowthMatrix(): LineGraphEntry[] {
    return this.growthMatrix;
  }

  /**
   * Returns the cumulative fees paid over the full investment horizon.
   * Only meaningful after calculateGrowth() has been called.
   */
  public getCumulativeFees(): number {
    return Math.floor(this.cumulativeFees);
  }

  /**
   * Returns the investment identifier
   * @returns The unique identifier for this investment
   */
  public getInvestmentId(): string {
    return this.props.investmentId;
  }

  /**
   * Calculates percentage change between two amounts
   * @param originalAmount - The original amount
   * @param newAmount - The new amount
   * @returns Percentage change as an integer
   */
  public getPercentageChange(
    originalAmount: number,
    newAmount: number,
  ): number {
    if (originalAmount === 0) return 0;
    return Math.floor(
      ((newAmount - originalAmount) / originalAmount) * PERCENTAGE_DIVISOR,
    );
  }

  /* ==================================================
   * Private Calculation Methods
   * ================================================== */

  /**
   * Validates that required inputs are present and within acceptable bounds
   * @returns True if inputs are valid, false otherwise
   */
  private isValidInput(): boolean {
    if (!InvestmentCalculator.isValidNumericString(this.props.currentAmount)) {
      return false;
    }
    const amount = Number(this.props.currentAmount);
    return (
      amount >= 0 &&
      this.props.projectedGain >= 0 &&
      this.props.projectedGain <= MAX_PROJECTED_GAIN &&
      this.props.yearsOfGrowth >= 0 &&
      this.props.yearsOfGrowth <= MAX_YEARS_OF_GROWTH
    );
  }

  /**
   * Checks whether a value is a non-empty string that parses to a finite number
   * @param value - The value to check
   * @returns True if the value represents a valid numeric string
   */
  private static isValidNumericString(value: string | undefined): boolean {
    return value !== undefined && value !== "" && !isNaN(Number(value));
  }

  /**
   * Gets the initial investment amount as a number
   * @returns The initial investment amount
   */
  private getInitialAmount(): number {
    return parseInt(this.props.currentAmount || "0") || 0;
  }

  /**
   * Calculates monthly growth rate from annual percentage
   * @returns Monthly growth rate as a decimal
   */
  private getMonthlyGrowthRate(): number {
    return this.props.projectedGain / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
  }

  /**
   * Converts a (possibly fractional) year offset into whole months
   * @param years - Year offset (e.g. 10.5)
   * @returns Whole-month equivalent (e.g. 126)
   */
  private static toMonths(years: number): number {
    return Math.round(years * MONTHS_PER_YEAR);
  }

  /**
   * Calculates growth for a single year (or partial final year) including all
   * monthly operations
   * @param year - The year number (0-based)
   * @param startingNominal - Starting nominal amount
   * @param startingInflationAdjusted - Starting inflation-adjusted amount
   * @param monthlyGrowthRate - Monthly growth rate as decimal
   * @param monthsToProcess - Months to process in this year (12 for full years)
   * @returns Object containing nominal and inflation-adjusted amounts
   */
  private calculateYearGrowth(
    year: number,
    startingNominal: number,
    startingInflationAdjusted: number,
    monthlyGrowthRate: number,
    monthsToProcess: number,
  ): { nominal: number; inflationAdjusted: number } {
    let nominal = startingNominal;
    let inflationAdjusted = startingInflationAdjusted;

    // Determine starting month (current month for year 0, January for subsequent years)
    const startMonth = year === 0 ? this.currentMonth : 0;
    const endMonth = Math.min(startMonth + monthsToProcess, MONTHS_PER_YEAR);

    // Process each month in the year
    for (let month = startMonth; month < endMonth; month++) {
      // Apply withdrawals first
      if (this.shouldApplyWithdrawal()) {
        nominal -= this.props.monthlyWithdrawal;
        inflationAdjusted -= this.props.monthlyWithdrawal;
      }

      // Apply monthly compound growth
      nominal += nominal * monthlyGrowthRate;
      inflationAdjusted += inflationAdjusted * monthlyGrowthRate;

      // Deduct monthly fee (expense ratio) — computed per track so the
      // inflation-adjusted balance is not overcharged with the nominal fee
      if (this.props.annualFee) {
        const monthlyFeeRate =
          this.props.annualFee / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
        const fee = nominal * monthlyFeeRate;
        nominal -= fee;
        inflationAdjusted -= inflationAdjusted * monthlyFeeRate;
        this.cumulativeFees += fee;
      }

      // Apply contributions with immediate growth
      if (this.shouldApplyContribution()) {
        const contribution = this.props.monthlyContribution;
        const contributionGrowth = contribution * monthlyGrowthRate;

        nominal += contribution + contributionGrowth;
        inflationAdjusted += contribution + contributionGrowth;
      }

      this.monthsElapsed++;

      // Handle one-time rollover when the rollover month is reached
      if (this.shouldApplyRollover()) {
        const rolloverAmount = this.props.investmentToRoll || 0;
        nominal += rolloverAmount;
        inflationAdjusted += rolloverAmount;
      }
    }

    // Apply inflation adjustment, pro-rated for partial years
    if (this.props.depreciationRate) {
      const yearFraction = monthsToProcess / MONTHS_PER_YEAR;
      const retention =
        yearFraction === 1
          ? 1 - this.props.depreciationRate / PERCENTAGE_DIVISOR
          : Math.pow(
              1 - this.props.depreciationRate / PERCENTAGE_DIVISOR,
              yearFraction,
            );
      inflationAdjusted *= retention;
    }

    return { nominal, inflationAdjusted };
  }

  /**
   * Adds a data point to the growth matrix for charting
   * @param date - The date of the data point
   * @param nominal - Nominal amount
   * @param inflationAdjusted - Inflation-adjusted amount
   * @param showInflation - Whether inflation view is active
   */
  private addGrowthDataPoint(
    date: Date,
    nominal: number,
    inflationAdjusted: number,
    showInflation: boolean,
  ): void {
    this.growthMatrix.push({
      x: date,
      y: Math.floor(showInflation ? inflationAdjusted : nominal),
      alternateY: Math.floor(showInflation ? nominal : inflationAdjusted),
    });
  }

  /* ==================================================
   * Private Condition Checking Methods
   * ================================================== */

  /**
   * Determines if withdrawals should be applied for the current simulated month.
   * Withdrawals begin at the anniversary of today plus yearWithdrawalsBegin
   * years (fractional years resolve to whole months).
   * @returns True if withdrawals should be applied
   */
  private shouldApplyWithdrawal(): boolean {
    // Withdrawals only apply in advanced mode with a withdrawal amount set
    if (!this.props.advanced || !this.props.monthlyWithdrawal) {
      return false;
    }

    // Must have a valid withdrawal start year
    if (
      this.props.yearWithdrawalsBegin === undefined ||
      this.props.yearWithdrawalsBegin === null
    ) {
      return false;
    }

    return (
      this.monthsElapsed >=
      InvestmentCalculator.toMonths(this.props.yearWithdrawalsBegin)
    );
  }

  /**
   * Determines if contributions should be applied for the current simulated month.
   * Contributions stop once yearContributionsStop years (fractional allowed)
   * have elapsed since today.
   * @returns True if contributions should be applied
   */
  private shouldApplyContribution(): boolean {
    // If not in advanced mode or no contribution stop year set, always contribute
    if (!this.props.advanced || !this.props.yearContributionsStop) {
      return true;
    }

    return (
      this.monthsElapsed <
      InvestmentCalculator.toMonths(this.props.yearContributionsStop)
    );
  }

  /**
   * Determines if the one-time rollover should be applied after the month that
   * was just processed. The rollover lands at the end of calendar year
   * `yearOfRollover` (matching the year-end data point), with fractional years
   * extending that boundary by whole months.
   * @returns True if rollover should be applied now
   */
  private shouldApplyRollover(): boolean {
    if (
      !this.props.rollOver ||
      !this.props.investmentToRoll ||
      this.props.yearOfRollover === null ||
      this.props.yearOfRollover === undefined
    ) {
      return false;
    }

    const rolloverMonth =
      MONTHS_PER_YEAR -
      this.currentMonth +
      InvestmentCalculator.toMonths(this.props.yearOfRollover);

    return this.monthsElapsed === rolloverMonth;
  }

  /* ==================================================
   * Private Utility Methods
   * ================================================== */

  /**
   * Calculates depreciation amount based on percentage and principal
   * @param amount - The principal amount
   * @param depreciationRate - The annual depreciation rate as a percentage
   * @returns The depreciation amount
   */
  private calculateDepreciation(
    amount: number,
    depreciationRate: number,
  ): number {
    return amount * (depreciationRate / PERCENTAGE_DIVISOR);
  }

  /**
   * Formats a number as currency string
   * @param amount - The amount to format
   * @returns Formatted currency string (e.g., "$1,234")
   */
  private formatCurrency(amount: number): string {
    return `$${amount.toLocaleString()}`;
  }
}
