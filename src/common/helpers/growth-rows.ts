/* ==================================================
 * Growth Display Rows
 *
 * Maps calculator growth matrices and Monte Carlo bands
 * onto the rows the chart and totals table render.
 *
 * Index conventions: growthMatrix[k] is the balance at
 * the END of year k+1 (there is no "today" entry), while
 * Monte Carlo band.year k indexes that lane's own path
 * (band 0 = the initial amount, band i = matrix[i-1]).
 * Chart rows are keyed by months from today, so lanes with
 * different fractional horizons never share a row.
 * ================================================== */

import { addMonths, differenceInCalendarMonths, format } from "date-fns";
import { MONTHS_PER_YEAR } from "../constants/app-constants";
import type { LineGraphEntry, RolloverAmounts } from "../types/types";
import type { PercentileBand } from "./monte-carlo";

/* ---------- Chart rows ---------- */

export const MC_SERIES_KEYS = ["mc", "mcB"] as const;
export type McSeriesKey = (typeof MC_SERIES_KEYS)[number];

/** Percentile bands of one Monte Carlo series for a single row */
export interface McRowBands {
  p50: number;
  /** P10-P90 range */
  outer: [number, number];
  /** P25-P75 range */
  inner: [number, number];
}

export interface ChartRow extends Partial<Record<McSeriesKey, McRowBands>> {
  date: string;
  investmentA: number | null;
  investmentB: number | null;
}

export interface ChartRowInputs {
  matrixA: LineGraphEntry[];
  matrixB?: LineGraphEntry[];
  /** Investment B is only plotted in advanced mode */
  advanced: boolean;
  /** Starting balances; when given, row 0 carries them so the lines start today */
  initialA?: number;
  initialB?: number;
  /** Monte Carlo bands per series, keyed by index into that series' own path */
  bands: Partial<Record<McSeriesKey, PercentileBand[]>>;
  today?: Date;
}

/**
 * Builds one chart row per distinct date reached by either lane or by a Monte
 * Carlo band, keyed by months from today. A trailing partial year in one lane
 * therefore gets its own row instead of shifting the other lane's values.
 */
export function buildChartRows({
  matrixA,
  matrixB,
  advanced,
  initialA,
  initialB,
  bands,
  today = new Date(),
}: ChartRowInputs): ChartRow[] {
  const matrixBRows = advanced ? (matrixB ?? []) : [];
  const bandMaps = MC_SERIES_KEYS.map(
    (key) =>
      [key, new Map((bands[key] ?? []).map((b) => [b.year, b]))] as const,
  );

  const byMonth = new Map<number, ChartRow>();
  const rowAt = (months: number): ChartRow => {
    let row = byMonth.get(months);
    if (!row) {
      row = {
        date: format(
          addMonths(today, months),
          months % MONTHS_PER_YEAR === 0 ? "yyyy" : "yyyy-MM",
        ),
        investmentA: null,
        investmentB: null,
      };
      byMonth.set(months, row);
    }
    return row;
  };
  // Calendar months so a sub-second clock difference between the calculator's
  // "today" and this one cannot shift an entry into the previous month
  const monthsFromToday = (x: Date) => differenceInCalendarMonths(x, today);

  const first = rowAt(0);
  first.investmentA = initialA ?? null;
  first.investmentB = advanced ? (initialB ?? null) : null;
  for (const entry of matrixA)
    rowAt(monthsFromToday(entry.x)).investmentA = entry.y;
  for (const entry of matrixBRows)
    rowAt(monthsFromToday(entry.x)).investmentB = entry.y;

  const seriesMatrix: Record<McSeriesKey, LineGraphEntry[]> = {
    mc: matrixA,
    mcB: matrixBRows,
  };
  // A band's `year` indexes its own path (a trailing partial year adds a final
  // index), so resolve it through that lane's own matrix dates
  const bandMonths = (key: McSeriesKey, year: number) => {
    const entry = year > 0 ? seriesMatrix[key][year - 1] : undefined;
    return entry ? monthsFromToday(entry.x) : year * MONTHS_PER_YEAR;
  };

  for (const [key, byYear] of bandMaps) {
    for (const [year, band] of byYear) {
      rowAt(bandMonths(key, year))[key] = {
        p50: band.p50,
        outer: [band.p10, band.p90],
        inner: [band.p25, band.p75],
      };
    }
  }

  return [...byMonth.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

/* ---------- Ending balance ---------- */

/**
 * Both tracks of a lane's ending balance, for rolling into another lane. The
 * calculator stores the displayed series in `y` and the other in `alternateY`,
 * and a 0-year lane has no entries at all, so it ends where it started.
 */
export function endingAmounts(
  matrix: LineGraphEntry[],
  showInflation: boolean,
  initialAmount: number,
): RolloverAmounts {
  const last = matrix.at(-1);
  if (!last) {
    return { nominal: initialAmount, inflationAdjusted: initialAmount };
  }
  return showInflation
    ? { nominal: last.alternateY, inflationAdjusted: last.y }
    : { nominal: last.y, inflationAdjusted: last.alternateY };
}

/* ---------- Table rows ---------- */

export interface TableRow {
  year: number;
  nominal: number;
  inflationAdjusted: number;
  /** Nominal change relative to the starting amount, in percent */
  pctChange: number;
}

/**
 * The calculator stores the displayed series in `y` and the other in
 * `alternateY`, so the inflation toggle decides which slot is nominal.
 */
export function buildTableRows(
  matrix: LineGraphEntry[],
  showInflation: boolean,
  initialAmount: number,
): TableRow[] {
  return matrix.map((entry) => {
    const nominal = showInflation ? entry.alternateY : entry.y;
    const inflationAdjusted = showInflation ? entry.y : entry.alternateY;
    const pctChange =
      initialAmount === 0
        ? 0
        : ((nominal - initialAmount) / initialAmount) * 100;
    return {
      year: entry.x.getFullYear(),
      nominal,
      inflationAdjusted,
      pctChange,
    };
  });
}
