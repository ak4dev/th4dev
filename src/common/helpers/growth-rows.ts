/* ==================================================
 * Growth Display Rows
 *
 * Maps calculator growth matrices and Monte Carlo bands
 * onto the rows the chart and totals table render.
 *
 * Index conventions: growthMatrix[k] is the balance at
 * the END of year k+1 (there is no "today" entry), while
 * a Monte Carlo band carries the month it describes.
 * Chart rows are keyed by months from today, so lanes with
 * different fractional horizons never share a row and a
 * band never has to borrow a date from another lane.
 * ================================================== */

import { addMonths } from "date-fns/addMonths";
import { differenceInCalendarMonths } from "date-fns/differenceInCalendarMonths";
import { format } from "date-fns/format";
import { MONTHS_PER_YEAR } from "../constants/app-constants";
import { planAnchor } from "./investment-growth-calculator";
import type {
  DisplayTrack,
  LineGraphEntry,
  RolloverAmounts,
} from "../types/types";
import type { PercentileBand } from "./monte-carlo";

/* ---------- Display track ---------- */

/**
 * The series the Inflated toggle selects.
 *
 * This is the ONE place the toggle is turned into a track name. The engine
 * computes both tracks and knows nothing about the switch, so a view that
 * shows a balance says which of the two it is showing rather than inheriting
 * a slot whose meaning moved with a flag.
 *
 * @param showInflation - Whether the Inflated toggle is on
 * @returns The LineGraphEntry key to read
 */
export const displayTrack = (showInflation: boolean): DisplayTrack =>
  showInflation ? "real" : "nominal";

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
  /** Which of each entry's two tracks is plotted */
  track: DisplayTrack;
  /** Investment B is only plotted in advanced mode */
  advanced: boolean;
  /** Starting balances; when given, row 0 carries them so the lines start today */
  initialA?: number;
  initialB?: number;
  /** Monte Carlo bands per series; each band carries its own month */
  bands: Partial<Record<McSeriesKey, PercentileBand[]>>;
  /**
   * The anchor the matrices were simulated against. Pass the plan's own, so
   * the rows are dated by the same clock that produced them; the default
   * reads a fresh one, which is only safe because of the calendar-month
   * arithmetic below.
   */
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
  track,
  advanced,
  initialA,
  initialB,
  bands,
  today = planAnchor(),
}: ChartRowInputs): ChartRow[] {
  const matrixBRows = advanced ? (matrixB ?? []) : [];

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
  // Calendar months, not elapsed time: an entry is dated `anchor + n months`,
  // and this recovers n exactly. A caller that passes the plan's own anchor
  // has one clock and nothing to defend against; one that lets `today`
  // default has two, and only the calendar-month reading keeps a pair read
  // either side of midnight from shifting an entry into the previous month.
  const monthsFromToday = (x: Date) => differenceInCalendarMonths(x, today);

  const first = rowAt(0);
  first.investmentA = initialA ?? null;
  first.investmentB = advanced ? (initialB ?? null) : null;
  for (const entry of matrixA)
    rowAt(monthsFromToday(entry.x)).investmentA = entry[track];
  for (const entry of matrixBRows)
    rowAt(monthsFromToday(entry.x)).investmentB = entry[track];

  // Bands are dated by the engine, in the same months-from-today units as the
  // matrices, so a lane with a fractional horizon puts its trailing band on
  // its own row and leaves the whole-year rows to the lanes that reach them
  for (const key of MC_SERIES_KEYS) {
    for (const band of bands[key] ?? []) {
      rowAt(band.months)[key] = {
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
 * Both tracks of a lane's ending balance, for rolling into another lane.
 *
 * The last matrix entry already carries both, so the display toggle does not
 * enter into it. A 0-year lane has no entries at all, and ends where it
 * started - on both tracks, since no time has passed to deflate.
 */
export function endingAmounts(
  matrix: LineGraphEntry[],
  initialAmount: number,
): RolloverAmounts {
  const last = matrix.at(-1);
  if (!last) {
    return { nominal: initialAmount, inflationAdjusted: initialAmount };
  }
  return { nominal: last.nominal, inflationAdjusted: last.real };
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
 * The year-by-year table prints BOTH tracks side by side, so it needs no
 * display toggle: each entry already names which of its two numbers is which.
 */
export function buildTableRows(
  matrix: LineGraphEntry[],
  initialAmount: number,
): TableRow[] {
  return matrix.map((entry) => {
    const { nominal, real: inflationAdjusted } = entry;
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
