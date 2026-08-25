import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { addMonths, addYears } from "date-fns";
import { buildChartRows, buildTableRows, endingAmounts } from "../growth-rows";
import { InvestmentCalculator } from "../investment-growth-calculator";
import type { LineGraphEntry } from "../../types/types";
import { runRolloverSimulation, type PercentileBand } from "../monte-carlo";

const TODAY = new Date(2026, 0, 15);

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterAll(() => {
  vi.useRealTimers();
});

const entry = (x: Date, y: number, alternateY = y): LineGraphEntry => ({
  x,
  y,
  alternateY,
});

const band = (year: number, value: number): PercentileBand => ({
  year,
  p10: value - 20,
  p25: value - 10,
  p50: value,
  p75: value + 10,
  p90: value + 20,
});

/** A matrix in the calculator's convention: entry k = balance at the end of year k+1 */
const yearlyMatrix = (values: number[]) =>
  values.map((v, k) => entry(addYears(TODAY, k + 1), v));

describe("buildChartRows", () => {
  it("starts with a today row carrying the initial amounts", () => {
    const rows = buildChartRows({
      matrixA: yearlyMatrix([1100]),
      matrixB: yearlyMatrix([550]),
      advanced: true,
      initialA: 1000,
      initialB: 500,
      bands: {},
    });
    expect(rows[0]).toEqual({
      date: "2026",
      investmentA: 1000,
      investmentB: 500,
    });
    expect(rows).toHaveLength(2);
  });

  it("puts growthMatrix[i-1] on row i, dated by the entry", () => {
    const rows = buildChartRows({
      matrixA: yearlyMatrix([1100, 1210, 1331]),
      advanced: false,
      bands: {},
    });
    expect(rows.map((r) => r.investmentA)).toEqual([null, 1100, 1210, 1331]);
    expect(rows.map((r) => r.date)).toEqual(["2026", "2027", "2028", "2029"]);
  });

  it("aligns Monte Carlo band year i with row i", () => {
    const rows = buildChartRows({
      matrixA: yearlyMatrix([1100, 1210, 1331]),
      advanced: false,
      initialA: 1000,
      bands: {
        mc: [band(0, 1000), band(1, 1100), band(2, 1210), band(3, 1331)],
      },
    });
    expect(rows).toHaveLength(4);
    rows.forEach((row) => expect(row.mc?.p50).toBe(row.investmentA));
    expect(rows[1].mc).toEqual({
      p50: 1100,
      outer: [1080, 1120],
      inner: [1090, 1110],
    });
  });

  it("keeps a trailing partial-year entry on the extra band row", () => {
    const partial = entry(addMonths(addYears(TODAY, 2), 6), 1270);
    const rows = buildChartRows({
      matrixA: [...yearlyMatrix([1100, 1210]), partial],
      advanced: false,
      bands: {
        mc: [band(0, 1000), band(1, 1100), band(2, 1210), band(3, 1270)],
      },
    });
    expect(rows).toHaveLength(4);
    expect(rows[3].investmentA).toBe(1270);
    expect(rows[3].mc?.p50).toBe(1270);
    expect(rows[3].date).toBe("2028-07");
  });

  it("gives each lane's partial year its own row instead of pairing by index", () => {
    const build = (years: number) => {
      const calc = new InvestmentCalculator({
        currentAmount: "10000",
        projectedGain: 10,
        yearsOfGrowth: years,
        monthlyContribution: 0,
        monthlyWithdrawal: 0,
        yearWithdrawalsBegin: 0,
        maxMonthlyWithdrawal: 10000,
        depreciationRate: 0,
      });
      calc.calculateGrowth(false);
      return calc.getGrowthMatrix();
    };
    const matrixA = build(10.5);
    const matrixB = build(12);
    const rows = buildChartRows({
      matrixA,
      matrixB,
      advanced: true,
      initialA: 10000,
      initialB: 10000,
      bands: {},
    });

    // A's 10.5-year point sits alone, half a year after the shared 2036 row
    const partialA = matrixA[matrixA.length - 1];
    const partialRow = rows.find((r) => r.date === "2036-07");
    expect(partialRow).toMatchObject({
      investmentA: partialA.y,
      investmentB: null,
    });

    // B's 11-year point keeps its own year rather than landing on A's partial
    const yearElevenB = matrixB[10];
    expect(rows.find((r) => r.investmentB === yearElevenB.y)?.date).toBe(
      "2037",
    );
    expect(rows.map((r) => r.date)).toEqual([
      ...new Set(rows.map((r) => r.date)),
    ]);
  });

  it("matches the real calculator's matrix convention", () => {
    const calc = new InvestmentCalculator({
      currentAmount: "10000",
      projectedGain: 10,
      yearsOfGrowth: 3,
      monthlyContribution: 0,
      monthlyWithdrawal: 0,
      yearWithdrawalsBegin: 0,
      maxMonthlyWithdrawal: 10000,
      depreciationRate: 0,
    });
    calc.calculateGrowth(false);
    const matrix = calc.getGrowthMatrix();
    // A zero-volatility Monte Carlo path: band 0 = today, band k = end of year k
    const mc = [band(0, 10000), ...matrix.map((e, k) => band(k + 1, e.y))];

    const rows = buildChartRows({
      matrixA: matrix,
      advanced: false,
      initialA: 10000,
      bands: { mc },
    });

    expect(rows).toHaveLength(matrix.length + 1);
    rows.forEach((row) => expect(row.mc?.p50).toBe(row.investmentA));
    expect(rows[1].investmentA).toBeGreaterThan(10000);
  });

  it("creates rows for band years past the end of the matrices", () => {
    const rows = buildChartRows({
      matrixA: yearlyMatrix([1100, 1210]),
      advanced: true,
      bands: { mcB: [band(3, 500), band(4, 550)] },
    });
    expect(rows).toHaveLength(5);
    expect(rows[3]).toEqual({
      date: "2029",
      investmentA: null,
      investmentB: null,
      mcB: { p50: 500, outer: [480, 520], inner: [490, 510] },
    });
    expect(rows[2].mc).toBeUndefined();
    expect(rows[2].mcB).toBeUndefined();
  });

  it("extends rows to a longer B matrix and hides B when not advanced", () => {
    const matrixB = yearlyMatrix([550, 605, 665]);
    const advanced = buildChartRows({
      matrixA: yearlyMatrix([1100]),
      matrixB,
      advanced: true,
      bands: {},
    });
    expect(advanced.map((r) => r.investmentB)).toEqual([null, 550, 605, 665]);
    expect(advanced[3]).toMatchObject({ date: "2029", investmentA: null });

    const basic = buildChartRows({
      matrixA: yearlyMatrix([1100]),
      matrixB,
      advanced: false,
      initialB: 500,
      bands: {},
    });
    expect(basic).toHaveLength(2);
    expect(basic.every((r) => r.investmentB === null)).toBe(true);
  });
});

describe("buildTableRows", () => {
  it("resolves the nominal column by the inflation toggle, not by slot", () => {
    const inflated = buildTableRows(
      [entry(addYears(TODAY, 1), 14496, 16453)],
      true,
      10000,
    );
    expect(inflated[0]).toMatchObject({
      nominal: 16453,
      inflationAdjusted: 14496,
    });

    const nominal = buildTableRows(
      [entry(addYears(TODAY, 1), 16453, 14496)],
      false,
      10000,
    );
    expect(nominal[0]).toMatchObject({
      nominal: 16453,
      inflationAdjusted: 14496,
    });
  });

  it("measures % change against the starting amount from the first row", () => {
    const rows = buildTableRows(yearlyMatrix([11047, 12203]), false, 10000);
    expect(rows.map((r) => r.year)).toEqual([2027, 2028]);
    expect(rows[0].pctChange).toBeCloseTo(10.47, 2);
    expect(rows[1].pctChange).toBeCloseTo(22.03, 2);
  });

  it("reports 0% change when the starting amount is 0", () => {
    expect(buildTableRows(yearlyMatrix([500]), false, 0)[0].pctChange).toBe(0);
  });

  it("agrees with the calculator's y/alternateY slot semantics", () => {
    const calc = new InvestmentCalculator({
      currentAmount: "10000",
      projectedGain: 10,
      yearsOfGrowth: 2,
      monthlyContribution: 0,
      monthlyWithdrawal: 0,
      yearWithdrawalsBegin: 0,
      maxMonthlyWithdrawal: 10000,
      depreciationRate: 2.5,
    });
    calc.calculateGrowth(true);
    const rows = buildTableRows(calc.getGrowthMatrix(), true, 10000);
    rows.forEach((row) => {
      expect(row.nominal).toBeGreaterThan(row.inflationAdjusted);
      expect(row.pctChange).toBeGreaterThan(0);
    });
  });
});

describe("endingAmounts", () => {
  const laneProps = (currentAmount: string, yearsOfGrowth: number) => ({
    currentAmount,
    projectedGain: 10,
    yearsOfGrowth,
    monthlyContribution: 0,
    monthlyWithdrawal: 0,
    yearWithdrawalsBegin: 0,
    maxMonthlyWithdrawal: 10000,
    depreciationRate: 0,
  });

  it("resolves the nominal track by the inflation toggle", () => {
    const matrix = [entry(addYears(TODAY, 1), 14496, 16453)];
    expect(endingAmounts(matrix, true, 10000)).toEqual({
      nominal: 16453,
      inflationAdjusted: 14496,
    });
    expect(endingAmounts(matrix, false, 10000)).toEqual({
      nominal: 14496,
      inflationAdjusted: 16453,
    });
  });

  it("rolls a 0-year lane's starting balance into the receiving lane", () => {
    const laneA = new InvestmentCalculator(laneProps("50000", 0));
    laneA.calculateGrowth(false);
    // A 0-year horizon simulates no chunks, so there is no matrix to read
    expect(laneA.getGrowthMatrix()).toHaveLength(0);

    const ending = endingAmounts(laneA.getGrowthMatrix(), false, 50000);
    expect(ending).toEqual({ nominal: 50000, inflationAdjusted: 50000 });

    const laneB = new InvestmentCalculator({
      ...laneProps("20000", 5),
      rollOver: true,
      investmentToRoll: ending,
      yearOfRollover: 0,
    });
    const finalB = laneB.calculateGrowth(false).numeric;
    expect(finalB).toBeGreaterThan(115000);

    // The deterministic line must agree with Monte Carlo at zero volatility
    const mcParams = (initialAmount: number, yearsOfGrowth: number) => ({
      initialAmount,
      projectedGain: 10,
      yearsOfGrowth,
      monthlyContribution: 0,
      monthlyWithdrawal: 0,
      withdrawalStartYear: 0,
      depreciationRate: 0,
      showInflation: false,
      volatility: 0,
      simCount: 5,
      seed: 1,
    });
    const bands = runRolloverSimulation(
      mcParams(50000, 0),
      mcParams(20000, 5),
      0,
    );
    expect(bands.at(-1)?.p50).toBe(finalB);
  });
});
