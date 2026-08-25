/* ==================================================
 * Growth Display Rows
 *
 * Maps calculator growth matrices and Monte Carlo bands
 * onto the rows the chart and totals table render.
 *
 * Index conventions: growthMatrix[k] is the balance at
 * the END of year k+1 (there is no "today" entry), while
 * Monte Carlo band.year k is the balance k years from
 * today (band 0 = the initial amount). Chart rows are
 * indexed by years from today, so row 0 is today and
 * row i pairs matrix[i-1] with band i.
 * ================================================== */

import { format } from "date-fns";
import type { LineGraphEntry } from "../types/types";
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
  /** Monte Carlo bands per series, keyed by years from today */
  bands: Partial<Record<McSeriesKey, PercentileBand[]>>;
  today?: Date;
}

/**
 * Builds one chart row per year from today. Rows extend to the last Monte
 * Carlo band year so individual-mode B bands offset past A's horizon still
 * have an x position.
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
  const yearCount = Math.max(matrixA.length, matrixBRows.length);
  const bandMaps = MC_SERIES_KEYS.map(
    (key) =>
      [key, new Map((bands[key] ?? []).map((b) => [b.year, b]))] as const,
  );
  const maxBandYear = Math.max(
    -1,
    ...bandMaps.flatMap(([, byYear]) => [...byYear.keys()]),
  );

  const rows: ChartRow[] = [
    {
      date: format(today, "yyyy"),
      investmentA: initialA ?? null,
      investmentB: advanced ? (initialB ?? null) : null,
    },
  ];
  for (let i = 0; i < yearCount; i++) {
    const entry = matrixA[i] ?? matrixBRows[i];
    rows.push({
      date: format(entry.x, "yyyy"),
      investmentA: matrixA[i]?.y ?? null,
      investmentB: matrixBRows[i]?.y ?? null,
    });
  }
  const todayYear = today.getFullYear();
  while (rows.length <= maxBandYear) {
    rows.push({
      date: `${todayYear + rows.length}`,
      investmentA: null,
      investmentB: null,
    });
  }

  rows.forEach((row, year) => {
    for (const [key, byYear] of bandMaps) {
      const band = byYear.get(year);
      if (band) {
        row[key] = {
          p50: band.p50,
          outer: [band.p10, band.p90],
          inner: [band.p25, band.p75],
        };
      }
    }
  });

  return rows;
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
