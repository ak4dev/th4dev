/* ==================================================
 * Investment Growth Calculator
 * ================================================== */

import { addMonths } from "date-fns/addMonths";
import { startOfDay } from "date-fns/startOfDay";
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

/** Converts a (possibly fractional) year offset into whole months, e.g. 10.5 -> 126 */
export function toMonths(years: number): number {
  return Math.round(years * MONTHS_PER_YEAR);
}

/**
 * The plan's clock: today at local midnight.
 *
 * Every date the plan displays is `today` plus a whole number of months, so
 * the whole pipeline needs exactly ONE of these — decided once per plan and
 * injected — rather than one per helper per render. Two clocks read a
 * fraction of a second apart used to be able to straddle midnight and skew
 * the rows of a single render against each other.
 *
 * Truncating to midnight is not cosmetic: it makes the anchor reproducible
 * for a whole day, so the same plan re-rendered at 09:00 and at 17:00 stamps
 * byte-identical dates, and it keeps `addMonths` arithmetic clear of the
 * time-of-day component.
 */
export const planAnchor = (): Date => startOfDay(new Date());

/**
 * Inflation index for a guardrail entered in today's dollars: (1 + i)^t, the
 * reciprocal of the deflator this engine applies to every checkpoint. A floor
 * or ceiling multiplied by it keeps a constant purchasing power for the whole
 * plan instead of shrinking in real terms every year.
 *
 * @param inflationPct   - Annual inflation as a percentage (PlanInputs.inflationPct)
 * @param monthsElapsed  - Whole months from today
 * @returns The multiplier to apply to a guardrail at that month (1 at month 0)
 */
export function guardrailIndex(
  inflationPct: number,
  monthsElapsed: number,
): number {
  if (!inflationPct) return 1;
  return Math.pow(
    1 + inflationPct / PERCENTAGE_DIVISOR,
    monthsElapsed / MONTHS_PER_YEAR,
  );
}

/**
 * Monthly amount for one dynamic-withdrawal year: ratePct% of the balance,
 * spread over 12 months and clamped to the guardrails (the floor wins when it
 * exceeds the ceiling).
 *
 * The guardrails are entered in today's dollars, so `index` scales them to the
 * month being evaluated (see guardrailIndex). It defaults to 1, which leaves
 * the pure nominal clamp callers without inflation already rely on.
 */
export function dynamicMonthlyWithdrawal(
  balance: number,
  { ratePct, floor, ceiling }: DynamicWithdrawal,
  index = 1,
): number {
  const monthly = (balance * ratePct) / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
  const indexedFloor = floor * index;
  const indexedCeiling = ceiling * index;
  return Math.min(
    Math.max(monthly, indexedFloor),
    Math.max(indexedCeiling, indexedFloor),
  );
}

/**
 * Investment Growth Calculator
 *
 * Handles complex investment growth calculations including:
 * - Monthly compound growth
 * - Regular contributions and fixed or percentage-of-balance withdrawals
 * - Fractional (partial) years for horizon, contribution stop, and withdrawal start
 * - Investment rollovers
 * - Data generation for charting
 *
 * A single nominal balance is simulated. The inflation-adjusted ("real",
 * today's-dollars) figure is never accumulated in parallel: it is derived at
 * each checkpoint by deflating that one nominal balance, so both displayed
 * tracks always describe the same plan.
 *
 * The balance is floored at zero: a withdrawal is capped at what the plan
 * holds, and the month it first falls short is reported by
 * getDepletedAtMonth().
 *
 * All year-valued inputs (yearsOfGrowth, contributionStopYear,
 * withdrawalStartYear, yearOfRollover) accept fractional values, which are
 * resolved to whole months from today (e.g. 10.5 years -> 126 months).
 * Monte Carlo (monte-carlo.ts) applies the same cash flows in the same order.
 */
export class InvestmentCalculator {
  private readonly props: InvestmentCalculatorProps;
  private readonly today: Date;
  private readonly growthMatrix: LineGraphEntry[] = [];
  private readonly monthlyMatrix: LineGraphEntry[] = [];
  private readonly withdrawalSchedule: number[] = [];
  private cumulativeFees = 0;
  /** Absolute months elapsed since today while simulating */
  private monthsElapsed = 0;
  /** Monthly amount in force for the current dynamic-withdrawal year */
  private dynamicMonthly = 0;
  private nominal = 0;
  /** Months from today at which the balance first ran dry, if it ever did */
  private depletedAtMonth: number | undefined;

  /**
   * @param props - The plan to simulate
   * @param today - The plan's anchor, every emitted date being this plus a
   *   whole number of months. A caller that renders more than one lane, or
   *   that also prints a date of its own, MUST pass the same anchor to all of
   *   them: the default reads the clock afresh, and two reads either side of
   *   midnight describe two different plans. See planAnchor().
   */
  constructor(props: InvestmentCalculatorProps, today: Date = planAnchor()) {
    this.props = props;
    this.today = today;
  }

  /* ==================================================
   * Public Methods
   * ================================================== */

  /**
   * Runs the plan and returns its ending balance on BOTH tracks.
   *
   * It takes no display flag and never did any formatting: which track is on
   * screen, and how a number is punctuated, are decisions for the view. An
   * invalid plan ends at zero on both tracks and leaves an empty matrix.
   *
   * @returns The ending balance, nominal and in today's dollars
   */
  public calculateGrowth(): { nominal: number; real: number } {
    if (!this.isValidInput()) {
      return { nominal: 0, real: 0 };
    }

    this.growthMatrix.length = 0;
    this.monthlyMatrix.length = 0;
    this.withdrawalSchedule.length = 0;
    this.cumulativeFees = 0;
    this.monthsElapsed = 0;
    this.dynamicMonthly = 0;
    this.depletedAtMonth = undefined;
    this.nominal = this.props.initialAmount;
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
      this.growthMatrix.push(this.checkpoint(start + months));
    }

    return {
      nominal: Math.floor(this.nominal),
      real: Math.floor(this.deflate(this.nominal, totalMonths)),
    };
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
   * Every simulated month, in the same shape and by the same rule as the
   * yearly matrix: entry k is the balance at the END of month k+1, and there
   * is no "today" row. `getMonthlyMatrix()[12 * k - 1]` is therefore the very
   * same checkpoint as `getGrowthMatrix()[k - 1]`.
   *
   * These are RECORDED, not reconstructed. A monthly schedule built by
   * interpolating between year ends smears a mid-year step change - a
   * withdrawal that starts at 0.5 years, a rollover that lands there - across
   * the whole year and reads a balance the plan never held. Only meaningful
   * after calculateGrowth() has been called.
   */
  public getMonthlyMatrix(): LineGraphEntry[] {
    return this.monthlyMatrix;
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

  /**
   * Months from today at which the plan first could not fund the withdrawal it
   * asked for, or undefined when it never ran dry. Contributions can refill a
   * drained plan, so this is the FIRST such month, not necessarily the state
   * at the horizon. Only meaningful after calculateGrowth() has been called.
   */
  public getDepletedAtMonth(): number | undefined {
    return this.depletedAtMonth;
  }

  /* ==================================================
   * Private Calculation Methods
   * ================================================== */

  /**
   * Validates that required inputs are present and within acceptable bounds
   * @returns True if inputs are valid, false otherwise
   */
  private isValidInput(): boolean {
    const { initialAmount, projectedGain, yearsOfGrowth } = this.props;
    // A plain range check on a number, like the two below it. Reading the
    // principal out of a string, and deciding what an unreadable one means,
    // now happens once at the boundary that owns the text box.
    return (
      Number.isFinite(initialAmount) &&
      initialAmount >= 0 &&
      projectedGain >= 0 &&
      projectedGain <= MAX_PROJECTED_GAIN &&
      yearsOfGrowth >= 0 &&
      yearsOfGrowth <= MAX_YEARS_OF_GROWTH
    );
  }

  /**
   * The balance as of `months` from today, on both tracks. The one place a
   * checkpoint is minted, so the monthly and yearly matrices cannot drift
   * apart in their dating, their flooring or their deflator.
   */
  private checkpoint(months: number): LineGraphEntry {
    return {
      x: addMonths(this.today, months),
      nominal: Math.floor(this.nominal),
      real: Math.floor(this.deflate(this.nominal, months)),
    };
  }

  /**
   * Purchasing power of `nominal` dollars `months` from today: the Fisher
   * deflator (1 + i)^-t, matching the FIRE panel's real-return formula for
   * the same inflation slider. Note it is not (1 - i)^t, which understates
   * purchasing power (at 10% over 30 years by 26%).
   */
  private deflate(nominal: number, months: number): number {
    return (
      nominal *
      Math.pow(
        1 + this.props.inflationPct / PERCENTAGE_DIVISOR,
        -months / MONTHS_PER_YEAR,
      )
    );
  }

  /**
   * Simulates `months` consecutive months of the nominal balance, applying
   * any rollover due along the way.
   * @param months - Months in this chunk (12 for full years)
   * @param monthlyGrowthRate - Monthly growth rate as decimal
   */
  private simulateChunk(months: number, monthlyGrowthRate: number): void {
    for (let month = 0; month < months; month++) {
      // A plan can only spend what it holds. Capping the draw floors the
      // balance at zero, so an exhausted portfolio stops paying out instead of
      // compounding a negative balance at the growth rate.
      const requested = this.currentWithdrawal();
      const withdrawal = Math.min(requested, Math.max(0, this.nominal));
      this.withdrawalSchedule.push(withdrawal);
      this.nominal -= withdrawal;
      if (this.nominal <= 0) {
        this.nominal = 0;
        // Only a plan that asked for money it did not have has run dry; one
        // that merely starts empty and is being funded has not
        if (requested > 0) this.depletedAtMonth ??= this.monthsElapsed;
      }

      // Growth, fees and contributions all still run on the floored balance:
      // the first two are no-ops at zero, and the third must keep applying so
      // a drained plan that is still being funded recovers
      this.nominal += this.nominal * monthlyGrowthRate;

      if (this.props.annualFeePct) {
        const monthlyFeeRate =
          this.props.annualFeePct / PERCENTAGE_DIVISOR / MONTHS_PER_YEAR;
        const fee = this.nominal * monthlyFeeRate;
        this.nominal -= fee;
        this.cumulativeFees += fee;
      }

      // Contributions earn growth in the month they are made
      if (this.shouldApplyContribution()) {
        this.nominal +=
          this.props.monthlyContribution * (1 + monthlyGrowthRate);
      }

      this.monthsElapsed++;
      this.applyRolloverIfDue();
      // Recorded AFTER the rollover, exactly as the year-end row is: a roll
      // due at this month is part of the balance the month closes on
      this.monthlyMatrix.push(this.checkpoint(this.monthsElapsed));
    }
  }

  /* ==================================================
   * Private Cash-Flow Methods
   * ================================================== */

  /**
   * Withdrawal the plan asks for in the month about to be simulated, before
   * the balance is checked. Withdrawals begin withdrawalStartYear years from
   * today. Whether the plan has withdrawals at all is decided by the caller,
   * not here: basic mode passes 0 and no policy.
   *
   * A dynamic policy replaces the fixed amount: it is re-evaluated from the
   * nominal balance at the first withdrawal month and every 12 months after,
   * with its guardrails indexed to that month so they stay constant in
   * today's dollars rather than shrinking in real terms every year.
   */
  private currentWithdrawal(): number {
    const { dynamicWithdrawal, monthlyWithdrawal } = this.props;
    const sinceStart =
      this.monthsElapsed - toMonths(this.props.withdrawalStartYear);
    if (sinceStart < 0) return 0;
    if (!dynamicWithdrawal) return monthlyWithdrawal;
    if (sinceStart % MONTHS_PER_YEAR === 0) {
      this.dynamicMonthly = dynamicMonthlyWithdrawal(
        this.nominal,
        dynamicWithdrawal,
        guardrailIndex(this.props.inflationPct, this.monthsElapsed),
      );
    }
    return this.dynamicMonthly;
  }

  /**
   * Contributions stop contributionStopYear years from today. An unset stop
   * year is the only "never stop" sentinel: 0 stops them immediately, exactly
   * as 0.5 stops them after six months.
   */
  private shouldApplyContribution(): boolean {
    const { contributionStopYear } = this.props;
    return (
      contributionStopYear === undefined ||
      this.monthsElapsed < toMonths(contributionStopYear)
    );
  }

  /**
   * Adds the rolled-over balance once exactly yearOfRollover years from today
   * have been simulated. Only the nominal figure is added: because
   * monthsElapsed is absolute from today, deflating the balance at a later
   * checkpoint charges the rollover exactly its own elapsed time.
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
    this.nominal +=
      typeof investmentToRoll === "number"
        ? investmentToRoll
        : investmentToRoll.nominal;
  }
}
