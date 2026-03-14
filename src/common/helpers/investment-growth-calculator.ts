/* ==================================================
 * Investment Growth Calculator
 * ================================================== */

import { addYears } from "date-fns";
import type { InvestmentCalculatorProps, LineGraphEntry } from "../types/types";
import {
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
} from "../constants/app-constants";

/**
 * Investment Growth Calculator
 *
 * Handles complex investment growth calculations including:
 * - Monthly compound growth
 * - Regular contributions and withdrawals
 * - Inflation adjustments
 * - Investment rollovers
 * - Data generation for charting
 */
export class InvestmentCalculator {
  private readonly props: InvestmentCalculatorProps;
  private readonly today: Date = new Date();
  private readonly currentMonth: number = this.today.getMonth();

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
   * @returns Formatted currency string of the final investment value
   */
  public calculateGrowth(showInflation: boolean): string {
    if (!this.isValidInput()) {
      return "";
    }

    // Clear any existing growth data
    this.props.growthMatrix.length = 0;

    // Initialize calculation variables
    let nominalAmount = this.getInitialAmount();
    let inflationAdjustedAmount = nominalAmount;
    const monthlyGrowthRate = this.getMonthlyGrowthRate();

    // Calculate growth year by year
    for (let year = 0; year <= this.props.yearsOfGrowth; year++) {
      const result = this.calculateYearGrowth(
        year,
        nominalAmount,
        inflationAdjustedAmount,
        monthlyGrowthRate,
      );

      nominalAmount = result.nominal;
      inflationAdjustedAmount = result.inflationAdjusted;

      // Store data point for charting
      this.addGrowthDataPoint(
        year,
        nominalAmount,
        inflationAdjustedAmount,
        showInflation,
      );
    }

    const finalAmount = showInflation ? inflationAdjustedAmount : nominalAmount;
    return this.formatCurrency(Math.floor(finalAmount));
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
    return this.props.growthMatrix;
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
   * Validates that required inputs are present and valid
   * @returns True if inputs are valid, false otherwise
   */
  private isValidInput(): boolean {
    return !!(
      this.props.currentAmount &&
      this.props.projectedGain !== undefined &&
      this.props.yearsOfGrowth !== undefined
    );
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
   * Calculates growth for a single year including all monthly operations
   * @param year - The year number (0-based)
   * @param startingNominal - Starting nominal amount
   * @param startingInflationAdjusted - Starting inflation-adjusted amount
   * @param monthlyGrowthRate - Monthly growth rate as decimal
   * @returns Object containing nominal and inflation-adjusted amounts
   */
  private calculateYearGrowth(
    year: number,
    startingNominal: number,
    startingInflationAdjusted: number,
    monthlyGrowthRate: number,
  ): { nominal: number; inflationAdjusted: number } {
    let nominal = startingNominal;
    let inflationAdjusted = startingInflationAdjusted;

    // Determine starting month (current month for year 0, January for subsequent years)
    const startMonth = year === 0 ? this.currentMonth : 0;

    // Process each month in the year
    for (let month = startMonth; month < MONTHS_PER_YEAR; month++) {
      // Apply withdrawals first
      if (this.shouldApplyWithdrawal(year, month)) {
        nominal -= this.props.monthlyWithdrawal;
        inflationAdjusted -= this.props.monthlyWithdrawal;
      }

      // Apply monthly compound growth
      nominal += nominal * monthlyGrowthRate;
      inflationAdjusted += inflationAdjusted * monthlyGrowthRate;

      // Apply contributions with immediate growth
      if (this.shouldApplyContribution(year, month)) {
        const contribution = this.props.monthlyContribution;
        const contributionGrowth = contribution * monthlyGrowthRate;

        nominal += contribution + contributionGrowth;
        inflationAdjusted += contribution + contributionGrowth;
      }
    }

    // Handle one-time rollover at year end
    if (this.shouldApplyRollover(year)) {
      const rolloverAmount = this.props.investmentToRoll || 0;
      nominal += rolloverAmount;
      inflationAdjusted += rolloverAmount;
    }

    // Apply annual inflation adjustment
    if (this.props.depreciationRate) {
      const depreciation = this.calculateDepreciation(
        inflationAdjusted,
        this.props.depreciationRate,
      );
      inflationAdjusted -= depreciation;
    }

    return { nominal, inflationAdjusted };
  }

  /**
   * Adds a data point to the growth matrix for charting
   * @param year - The year number
   * @param nominal - Nominal amount
   * @param inflationAdjusted - Inflation-adjusted amount
   * @param showInflation - Whether inflation view is active
   */
  private addGrowthDataPoint(
    year: number,
    nominal: number,
    inflationAdjusted: number,
    showInflation: boolean,
  ): void {
    this.props.growthMatrix.push({
      x: addYears(this.today, year),
      y: Math.floor(showInflation ? inflationAdjusted : nominal),
      alternateY: Math.floor(showInflation ? nominal : inflationAdjusted),
    });
  }

  /* ==================================================
   * Private Condition Checking Methods
   * ================================================== */

  /**
   * Determines if withdrawals should be applied for a given year and month
   * @param year - The year number (0-based)
   * @param month - The month number (0-based)
   * @returns True if withdrawals should be applied
   */
  private shouldApplyWithdrawal(year: number, month: number): boolean {
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

    // Special handling for year 0 (current year)
    if (year === 0) {
      return (
        this.props.yearWithdrawalsBegin === 0 && month >= this.currentMonth
      );
    }

    // For subsequent years, check if we've reached the withdrawal start year
    return (
      year > this.props.yearWithdrawalsBegin ||
      (year === this.props.yearWithdrawalsBegin && month >= 0)
    );
  }

  /**
   * Determines if contributions should be applied for a given year and month
   * @param year - The year number (0-based)
   * @param month - The month number (0-based)
   * @returns True if contributions should be applied
   */
  private shouldApplyContribution(year: number, month: number): boolean {
    // If not in advanced mode or no contribution stop year set, always contribute
    if (!this.props.advanced || !this.props.yearContributionsStop) {
      return true;
    }

    // Special handling for year 0 (current year)
    if (year === 0) {
      return month >= this.currentMonth;
    }

    // Check if we haven't reached the contribution stop year
    return (
      year < this.props.yearContributionsStop ||
      (year === this.props.yearContributionsStop && month < this.currentMonth)
    );
  }

  /**
   * Determines if a rollover should be applied for a given year
   * @param year - The year number (0-based)
   * @returns True if rollover should be applied
   */
  private shouldApplyRollover(year: number): boolean {
    return !!(
      this.props.rollOver &&
      this.props.investmentToRoll &&
      this.props.yearOfRollover !== null &&
      this.props.yearOfRollover !== undefined &&
      this.props.yearOfRollover === year
    );
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
