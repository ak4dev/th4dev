import { describe, it, expect } from "vitest";
import { addMonths } from "date-fns/addMonths";
import { addYears } from "date-fns/addYears";
import {
  buildScheduleMatrix,
  withdrawalRowIndex,
} from "../preservation-schedule";
import { InvestmentCalculator } from "../investment-growth-calculator";
import type {
  InvestmentCalculatorProps,
  LineGraphEntry,
} from "../../types/types";

const today = new Date(2026, 0, 15);

/** Mimics getGrowthMatrix(): entry i is dated today + (i + 1) years. */
const yearly = (n: number): LineGraphEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    x: addYears(today, i + 1),
    nominal: 1000 * (i + 2),
    real: 900 * (i + 2),
  }));

describe("buildScheduleMatrix", () => {
  it("prepends a today row so that yearly index == years elapsed", () => {
    const m = buildScheduleMatrix({
      yearly: yearly(3),
      initialValue: 1000,
      granularity: "yearly",
      today,
    });
    expect(m).toHaveLength(4);
    expect(m[0]).toEqual({ x: today, nominal: 1000, real: 1000 });
    expect(m[2]).toEqual({
      x: addYears(today, 2),
      nominal: 3000,
      real: 2700,
    });
  });

  it("interpolates monthly rows when the engine's months are not supplied", () => {
    const m = buildScheduleMatrix({
      yearly: yearly(3),
      initialValue: 1000,
      granularity: "monthly",
      today,
    });
    expect(m).toHaveLength(37);
    expect(m[0]).toEqual({ x: today, nominal: 1000, real: 1000 });
    expect(m[12].x).toEqual(addYears(today, 1));
    expect(m[12].nominal).toBe(2000);
    expect(m[12].real).toBe(1800);
    expect(m[24].x).toEqual(addYears(today, 2));
    expect(m[36]).toEqual(yearly(3)[2]);
  });

  it("gives the today row the same balance on both tracks", () => {
    // No time has passed, so the deflator is 1: today's balance is the same
    // number whichever track the schedule is read on
    const m = buildScheduleMatrix({
      yearly: yearly(2),
      initialValue: 12345,
      granularity: "yearly",
      today,
    });
    expect(m[0].nominal).toBe(12345);
    expect(m[0].real).toBe(12345);
  });

  it("does not mutate the calculator matrix", () => {
    const source = yearly(2);
    buildScheduleMatrix({
      yearly: source,
      initialValue: 1000,
      granularity: "monthly",
      today,
    });
    expect(source).toEqual(yearly(2));
  });
});

/* ==================================================
 * Recorded months vs. interpolated ones
 *
 * The engine simulates every month; the schedule used
 * to throw those balances away and draw a straight line
 * between year ends instead. These cases pin that the
 * monthly view now prints the path the plan took.
 * ================================================== */

describe("buildScheduleMatrix – recorded monthly rows", () => {
  const props = (
    overrides: Partial<InvestmentCalculatorProps> = {},
  ): InvestmentCalculatorProps => ({
    initialAmount: 100000,
    projectedGain: 10,
    yearsOfGrowth: 3,
    monthlyContribution: 0,
    monthlyWithdrawal: 0,
    withdrawalStartYear: 0,
    inflationPct: 0,
    ...overrides,
  });

  const run = (overrides: Partial<InvestmentCalculatorProps> = {}) => {
    const calc = new InvestmentCalculator(props(overrides), today);
    calc.calculateGrowth();
    return calc;
  };

  /** The monthly schedule both ways, from one simulated plan */
  const schedules = (calc: InvestmentCalculator) => ({
    recorded: buildScheduleMatrix({
      yearly: calc.getGrowthMatrix(),
      monthly: calc.getMonthlyMatrix(),
      initialValue: 100000,
      granularity: "monthly",
      today,
    }),
    interpolated: buildScheduleMatrix({
      yearly: calc.getGrowthMatrix(),
      initialValue: 100000,
      granularity: "monthly",
      today,
    }),
  });

  it("keeps row index == months from today, as interpolation did", () => {
    const calc = run();
    const { recorded, interpolated } = schedules(calc);
    expect(recorded).toHaveLength(37);
    expect(recorded).toHaveLength(interpolated.length);
    expect(recorded[0]).toEqual({ x: today, nominal: 100000, real: 100000 });
    recorded.forEach((row, i) => expect(row.x).toEqual(addMonths(today, i)));
  });

  it("keeps the same row count for a fractional horizon", () => {
    const calc = run({ yearsOfGrowth: 10.5 });
    const { recorded, interpolated } = schedules(calc);
    expect(recorded).toHaveLength(127);
    expect(recorded).toHaveLength(interpolated.length);
    expect(recorded.at(-1)!.x).toEqual(addMonths(today, 126));
  });

  it("puts the year-k checkpoint on row 12k, unchanged", () => {
    const calc = run({ inflationPct: 3, monthlyContribution: 400 });
    const { recorded } = schedules(calc);
    calc
      .getGrowthMatrix()
      .forEach((yearRow, k) => expect(recorded[12 * (k + 1)]).toEqual(yearRow));
  });

  it("prints the balance the plan held, not a chord across the year", () => {
    // Pure compounding: the true curve is convex, so the straight line
    // between year ends sits ABOVE it everywhere in between
    const calc = run();
    const { recorded, interpolated } = schedules(calc);
    const engineMonths = calc.getMonthlyMatrix();

    expect(recorded[6].nominal).toBe(engineMonths[5].nominal);
    expect(recorded[6].nominal).toBe(Math.floor(100000 * (1 + 0.1 / 12) ** 6));
    expect(interpolated[6].nominal).toBeGreaterThan(recorded[6].nominal);
  });

  it("shows a mid-year withdrawal as a step on its own month", () => {
    // Withdrawals of $2 000 start at 0.5 years. Interpolation smears that
    // step across all twelve rows of year 1; the recorded path holds flat and
    // then turns at row 6, which is where the plan actually turns.
    const calc = run({
      projectedGain: 0,
      monthlyWithdrawal: 2000,
      withdrawalStartYear: 0.5,
    });
    const { recorded, interpolated } = schedules(calc);
    const nominal = (rows: LineGraphEntry[]) => rows.map((r) => r.nominal);

    expect(nominal(recorded).slice(0, 7)).toEqual(
      Array<number>(7).fill(100000),
    );
    expect(nominal(recorded).slice(7, 13)).toEqual([
      98000, 96000, 94000, 92000, 90000, 88000,
    ]);
    // The straight line spends the year's whole $12 000 evenly from row 1, so
    // it is already $1 000 down before a cent has left the plan and $6 000
    // down on the month the first withdrawal is actually taken
    expect(interpolated[1].nominal).toBe(99000);
    expect(interpolated[6].nominal).toBe(94000);
    expect(recorded[6].nominal - interpolated[6].nominal).toBe(6000);
  });

  it("leaves the yearly view alone even when months are supplied", () => {
    const calc = run({ monthlyWithdrawal: 2000, withdrawalStartYear: 0.5 });
    const withMonths = buildScheduleMatrix({
      yearly: calc.getGrowthMatrix(),
      monthly: calc.getMonthlyMatrix(),
      initialValue: 100000,
      granularity: "yearly",
      today,
    });
    expect(withMonths).toEqual([
      { x: today, nominal: 100000, real: 100000 },
      ...calc.getGrowthMatrix(),
    ]);
  });

  it("does not mutate either source matrix", () => {
    const calc = run({ monthlyContribution: 250 });
    const yearlySnapshot = [...calc.getGrowthMatrix()];
    const monthlySnapshot = [...calc.getMonthlyMatrix()];
    schedules(calc);
    expect(calc.getGrowthMatrix()).toEqual(yearlySnapshot);
    expect(calc.getMonthlyMatrix()).toEqual(monthlySnapshot);
  });
});

describe("withdrawalRowIndex", () => {
  it("maps a start year to the matching yearly or monthly row", () => {
    expect(withdrawalRowIndex(5, "yearly", 11)).toBe(5);
    expect(withdrawalRowIndex(5, "monthly", 121)).toBe(60);
    expect(withdrawalRowIndex(10.5, "monthly", 127)).toBe(126);
    expect(withdrawalRowIndex(10.5, "yearly", 12)).toBe(11);
  });

  it("returns -1 when withdrawals never start", () => {
    expect(withdrawalRowIndex(0, "yearly", 11)).toBe(-1);
    expect(withdrawalRowIndex(undefined, "monthly", 121)).toBe(-1);
  });

  it("clamps to the last row", () => {
    expect(withdrawalRowIndex(50, "yearly", 11)).toBe(10);
  });
});
