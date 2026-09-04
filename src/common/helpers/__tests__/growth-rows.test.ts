import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { addMonths } from "date-fns/addMonths";
import { addYears } from "date-fns/addYears";
import {
  buildChartRows,
  buildTableRows,
  displayTrack,
  endingAmounts,
} from "../growth-rows";
import { InvestmentCalculator } from "../investment-growth-calculator";
import type { LineGraphEntry } from "../../types/types";
import {
  runCombinedSimulation,
  runRolloverSimulation,
  type MonteCarloParams,
  type PercentileBand,
} from "../monte-carlo";

const TODAY = new Date(2026, 0, 15);

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterAll(() => {
  vi.useRealTimers();
});

const entry = (x: Date, nominal: number, real = nominal): LineGraphEntry => ({
  x,
  nominal,
  real,
});

/** A band dated by whole months from today, exactly as the engine emits it */
const band = (
  months: number,
  value: number,
  depletedPct = 0,
): PercentileBand => ({
  months,
  p10: value - 20,
  p25: value - 10,
  p50: value,
  p75: value + 10,
  p90: value + 20,
  depletedPct,
});

/** A matrix in the calculator's convention: entry k = balance at the end of year k+1 */
const yearlyMatrix = (values: number[]) =>
  values.map((v, k) => entry(addYears(TODAY, k + 1), v));

/** A real growth matrix: $10 000 at 10% for `years`, no cash flows */
const growthMatrix = (years: number) => {
  const calc = new InvestmentCalculator({
    initialAmount: 10000,
    projectedGain: 10,
    yearsOfGrowth: years,
    monthlyContribution: 0,
    monthlyWithdrawal: 0,
    withdrawalStartYear: 0,
    inflationPct: 0,
  });
  calc.calculateGrowth();
  return calc.getGrowthMatrix();
};

/** The same scenario as zero-volatility Monte Carlo params */
const mcParams = (years: number): MonteCarloParams => ({
  initialAmount: 10000,
  projectedGain: 10,
  yearsOfGrowth: years,
  monthlyContribution: 0,
  monthlyWithdrawal: 0,
  withdrawalStartYear: 0,
  inflationPct: 0,
  volatility: 0,
  simCount: 1,
  seed: 1,
});

describe("buildChartRows", () => {
  it("starts with a today row carrying the initial amounts", () => {
    const rows = buildChartRows({
      matrixA: yearlyMatrix([1100]),
      matrixB: yearlyMatrix([550]),
      track: "nominal",
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
      track: "nominal",
      advanced: false,
      bands: {},
    });
    expect(rows.map((r) => r.investmentA)).toEqual([null, 1100, 1210, 1331]);
    expect(rows.map((r) => r.date)).toEqual(["2026", "2027", "2028", "2029"]);
  });

  it("aligns a Monte Carlo band with the row for its month", () => {
    const rows = buildChartRows({
      matrixA: yearlyMatrix([1100, 1210, 1331]),
      track: "nominal",
      advanced: false,
      initialA: 1000,
      bands: {
        mc: [band(0, 1000), band(12, 1100), band(24, 1210), band(36, 1331)],
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
      track: "nominal",
      advanced: false,
      bands: {
        // The trailing entry is dated at month 30, its own date, not year 3
        mc: [band(0, 1000), band(12, 1100), band(24, 1210), band(30, 1270)],
      },
    });
    expect(rows).toHaveLength(4);
    expect(rows[3].investmentA).toBe(1270);
    expect(rows[3].mc?.p50).toBe(1270);
    expect(rows[3].date).toBe("2028-07");
  });

  it("gives each lane's partial year its own row instead of pairing by index", () => {
    const matrixA = growthMatrix(10.5);
    const matrixB = growthMatrix(12);
    const rows = buildChartRows({
      matrixA,
      matrixB,
      track: "nominal",
      advanced: true,
      initialA: 10000,
      initialB: 10000,
      bands: {},
    });

    // A's 10.5-year point sits alone, half a year after the shared 2036 row
    const partialA = matrixA[matrixA.length - 1];
    const partialRow = rows.find((r) => r.date === "2036-07");
    expect(partialRow).toMatchObject({
      investmentA: partialA.nominal,
      investmentB: null,
    });

    // B's 11-year point keeps its own year rather than landing on A's partial
    const yearElevenB = matrixB[10];
    expect(rows.find((r) => r.investmentB === yearElevenB.nominal)?.date).toBe(
      "2037",
    );
    expect(rows.map((r) => r.date)).toEqual([
      ...new Set(rows.map((r) => r.date)),
    ]);
  });

  it("puts a combined band on its own month when a lane's horizon is fractional", () => {
    // A finishes mid-2036, B runs a further year and a half. The combined
    // cone is one series over both lanes' dates, so resolving a band through
    // A's matrix would drop the year-11 value onto A's partial-year row and
    // leave the 2037 row without a band at all.
    const matrixA = growthMatrix(10.5);
    const matrixB = growthMatrix(12);
    const bands = runCombinedSimulation(mcParams(10.5), mcParams(12));
    const rows = buildChartRows({
      matrixA,
      matrixB,
      track: "nominal",
      advanced: true,
      initialA: 10000,
      initialB: 10000,
      bands: { mc: bands },
    });
    const bandAt = (months: number) =>
      bands.find((b) => b.months === months)!.p50;
    const rowAt = (date: string) => rows.find((r) => r.date === date)!;

    expect(rowAt("2036-07").mc?.p50).toBe(bandAt(126));
    expect(rowAt("2037").mc?.p50).toBe(bandAt(132));
    expect(rowAt("2038").mc?.p50).toBe(bandAt(144));
    // Every row the lanes reach carries a band, and no band invents a row
    expect(rows.every((r) => r.mc !== undefined)).toBe(true);
    expect(rows).toHaveLength(bands.length);
    // A is finished by 2037, so the cone there is B plus A's held balance
    expect(rowAt("2037").investmentA).toBeNull();
    expect(bandAt(132)).toBe(
      matrixA[matrixA.length - 1].nominal + rowAt("2037").investmentB!,
    );
  });

  it("matches the real calculator's matrix convention", () => {
    const calc = new InvestmentCalculator({
      initialAmount: 10000,
      projectedGain: 10,
      yearsOfGrowth: 3,
      monthlyContribution: 0,
      monthlyWithdrawal: 0,
      withdrawalStartYear: 0,
      inflationPct: 0,
    });
    calc.calculateGrowth();
    const matrix = calc.getGrowthMatrix();
    // A zero-volatility Monte Carlo path: band 0 = today, band k = end of year k
    const mc = [
      band(0, 10000),
      ...matrix.map((e, k) => band((k + 1) * 12, e.nominal)),
    ];

    const rows = buildChartRows({
      matrixA: matrix,
      track: "nominal",
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
      track: "nominal",
      advanced: true,
      bands: { mcB: [band(36, 500), band(48, 550)] },
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
      track: "nominal",
      advanced: true,
      bands: {},
    });
    expect(advanced.map((r) => r.investmentB)).toEqual([null, 550, 605, 665]);
    expect(advanced[3]).toMatchObject({ date: "2029", investmentA: null });

    const basic = buildChartRows({
      matrixA: yearlyMatrix([1100]),
      matrixB,
      track: "nominal",
      advanced: false,
      initialB: 500,
      bands: {},
    });
    expect(basic).toHaveLength(2);
    expect(basic.every((r) => r.investmentB === null)).toBe(true);
  });
});

describe("buildChartRows – the plan's anchor", () => {
  const anchor = new Date(2030, 5, 10);

  it("dates every row from the anchor it is given", () => {
    const rows = buildChartRows({
      matrixA: [
        entry(addMonths(anchor, 12), 1100),
        entry(addMonths(anchor, 18), 1160),
      ],
      track: "nominal",
      advanced: false,
      initialA: 1000,
      bands: {},
      today: anchor,
    });
    // Row 0 is the anchor itself, then whole-year and mid-year offsets read
    // straight back off the dates the engine stamped
    expect(rows.map((r) => r.date)).toEqual(["2030", "2031", "2031-12"]);
    expect(rows.map((r) => r.investmentA)).toEqual([1000, 1100, 1160]);
  });

  it("still works with the anchor omitted, reading the clock itself", () => {
    // The parameter is optional, and a caller that has no plan anchor of its
    // own gets today at local midnight
    const rows = buildChartRows({
      matrixA: yearlyMatrix([1100, 1210]),
      track: "nominal",
      advanced: false,
      initialA: 1000,
      bands: {},
    });
    expect(rows.map((r) => r.date)).toEqual(["2026", "2027", "2028"]);
    expect(rows.map((r) => r.investmentA)).toEqual([1000, 1100, 1210]);
  });

  it("resolves an entry stamped just before midnight by calendar month", () => {
    // The engine anchored a fraction of a second before midnight on the 31st
    // and this row builder a fraction after. Calendar months read the offset
    // the engine meant, so the year-1 entry stays on row 1 rather than
    // sliding back into the month before it.
    const engineAnchor = new Date(2026, 0, 31);
    const rowAnchor = new Date(2026, 1, 1);
    const rows = buildChartRows({
      matrixA: [entry(addMonths(engineAnchor, 12), 1100)],
      track: "nominal",
      advanced: false,
      initialA: 1000,
      bands: {},
      today: rowAnchor,
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].investmentA).toBe(1100);
  });
});

describe("buildTableRows", () => {
  it("takes each column from the entry's own named track", () => {
    // No display toggle enters into it: the table prints both columns, and
    // the entry says which of its two numbers is which
    const rows = buildTableRows(
      [entry(addYears(TODAY, 1), 16453, 14496)],
      10000,
    );
    expect(rows[0]).toMatchObject({
      nominal: 16453,
      inflationAdjusted: 14496,
    });
  });

  it("measures % change against the starting amount from the first row", () => {
    const rows = buildTableRows(yearlyMatrix([11047, 12203]), 10000);
    expect(rows.map((r) => r.year)).toEqual([2027, 2028]);
    expect(rows[0].pctChange).toBeCloseTo(10.47, 2);
    expect(rows[1].pctChange).toBeCloseTo(22.03, 2);
  });

  it("reports 0% change when the starting amount is 0", () => {
    expect(buildTableRows(yearlyMatrix([500]), 0)[0].pctChange).toBe(0);
  });

  it("agrees with the calculator's own track names", () => {
    const calc = new InvestmentCalculator({
      initialAmount: 10000,
      projectedGain: 10,
      yearsOfGrowth: 2,
      monthlyContribution: 0,
      monthlyWithdrawal: 0,
      withdrawalStartYear: 0,
      inflationPct: 2.5,
    });
    calc.calculateGrowth();
    const rows = buildTableRows(calc.getGrowthMatrix(), 10000);
    rows.forEach((row) => {
      expect(row.nominal).toBeGreaterThan(row.inflationAdjusted);
      expect(row.pctChange).toBeGreaterThan(0);
    });
  });
});

describe("displayTrack", () => {
  it("maps the Inflated toggle onto the track name", () => {
    expect(displayTrack(true)).toBe("real");
    expect(displayTrack(false)).toBe("nominal");
  });

  it("selects the series the chart plots", () => {
    const matrix = [entry(addYears(TODAY, 1), 16453, 14496)];
    const plotted = (showInflation: boolean) =>
      buildChartRows({
        matrixA: matrix,
        track: displayTrack(showInflation),
        advanced: false,
        initialA: 10000,
        bands: {},
      })[1].investmentA;
    expect(plotted(false)).toBe(16453);
    expect(plotted(true)).toBe(14496);
  });
});

describe("endingAmounts", () => {
  const laneProps = (initialAmount: number, yearsOfGrowth: number) => ({
    initialAmount,
    projectedGain: 10,
    yearsOfGrowth,
    monthlyContribution: 0,
    monthlyWithdrawal: 0,
    withdrawalStartYear: 0,
    inflationPct: 0,
  });

  it("reads each track off the last entry, whatever is on screen", () => {
    const matrix = [entry(addYears(TODAY, 1), 16453, 14496)];
    expect(endingAmounts(matrix, 10000)).toEqual({
      nominal: 16453,
      inflationAdjusted: 14496,
    });
  });

  it("rolls a 0-year lane's starting balance into the receiving lane", () => {
    const laneA = new InvestmentCalculator(laneProps(50000, 0));
    laneA.calculateGrowth();
    // A 0-year horizon simulates no chunks, so there is no matrix to read
    expect(laneA.getGrowthMatrix()).toHaveLength(0);

    const ending = endingAmounts(laneA.getGrowthMatrix(), 50000);
    expect(ending).toEqual({ nominal: 50000, inflationAdjusted: 50000 });

    const laneB = new InvestmentCalculator({
      ...laneProps(20000, 5),
      rollOver: true,
      investmentToRoll: ending,
      yearOfRollover: 0,
    });
    const finalB = laneB.calculateGrowth().nominal;
    expect(finalB).toBeGreaterThan(115000);

    // The deterministic line must agree with Monte Carlo at zero volatility.
    // A 0-year lane A also means a rollover at month 0, which the engine now
    // reads off A's horizon rather than taking as a parameter.
    const bands = runRolloverSimulation(
      { ...mcParams(0), initialAmount: 50000 },
      { ...mcParams(5), initialAmount: 20000 },
    );
    expect(bands.at(-1)?.p50).toBe(finalB);
  });
});
