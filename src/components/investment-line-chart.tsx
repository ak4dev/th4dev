/* ==================================================
 * Investment Line Chart Component
 * ================================================== */

import { Fragment } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import type { DisplayTrack, LineGraphEntry } from "../common/types/types";
import type { PercentileBand } from "../common/helpers/monte-carlo";
import {
  buildChartRows,
  MC_SERIES_KEYS,
  type ChartRow,
  type McSeriesKey,
} from "../common/helpers/growth-rows";
import { styled } from "../../stitches.config";
import { CHART_HEIGHT } from "../common/constants/app-constants";
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
} from "./ui/primitives";

/* ==================================================
 * Styled Components
 * ================================================== */

const ChartContainer = styled("div", {
  width: "100%",
  height: CHART_HEIGHT,
  marginTop: 32,
  backgroundColor: "$currentLine",
  borderRadius: "8px",
  padding: "16px",
  transition: "background-color 0.25s ease",
});

const ChartTitle = styled("h4", {
  margin: 0,
  marginBottom: "10px",
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "$foreground",
});

/* ==================================================
 * Constants
 * ================================================== */

const CHART_PADDING_MULTIPLIER = 1.05;
const COMPACT_MAX_FRACTION_DIGITS = 1;

/** Grid lines: the theme's comment colour, faint enough to stay behind the data */
const GRID_STROKE =
  "color-mix(in srgb, var(--colors-comment) 25%, transparent)";

/** Colour and legend labels for each Monte Carlo series */
const MC_SERIES: Record<
  McSeriesKey,
  { color: string; label: string; bandPrefix: string }
> = {
  mc: { color: "var(--colors-purple)", label: "Median (MC)", bandPrefix: "" },
  mcB: {
    color: "var(--colors-green)",
    label: "Median B (MC)",
    bandPrefix: "B ",
  },
};

/* ==================================================
 * Number Formatting
 * ================================================== */

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: COMPACT_MAX_FRACTION_DIGITS,
});

const compact = (value: number) => `$${numberFormatter.format(value)}`;

/* ==================================================
 * Helpers
 * ================================================== */

/**
 * Determines line color based on investment performance
 * @param matrix - Growth matrix for the investment
 * @param track - The track being plotted, so the colour reads the drawn line
 * @param defaultColor - Default color to use for positive performance
 * @param initialAmount - Starting balance; falls back to the first matrix entry
 * @returns CSS color value
 */
function getPerformanceColor(
  matrix: LineGraphEntry[] | undefined,
  track: DisplayTrack,
  defaultColor: string,
  initialAmount?: number,
): string {
  if (!matrix || matrix.length === 0) return defaultColor;

  const start = initialAmount ?? matrix[0][track];
  const end = matrix[matrix.length - 1][track];

  if (end < 0) return "var(--colors-red)";
  if (end < start) return "var(--colors-orange)";

  return defaultColor;
}

/** Largest value plotted in a row, for Y-axis scaling */
function rowMax(row: ChartRow): number {
  return Math.max(
    row.investmentA ?? 0,
    row.investmentB ?? 0,
    row.mc?.outer[1] ?? 0,
    row.mcB?.outer[1] ?? 0,
  );
}

/* ==================================================
 * Chart Component
 * ================================================== */

/**
 * Props for the InvestmentLineChart component
 */
interface InvestmentLineChartProps {
  /** Growth matrix for investment A */
  growthMatrixA: LineGraphEntry[];
  /** Growth matrix for investment B (optional) */
  growthMatrixB?: LineGraphEntry[];
  /**
   * Which of each entry's two tracks to plot. The matrices carry both, so the
   * Inflated toggle is resolved here, at the view, and not in the engine.
   */
  track: DisplayTrack;
  /** Whether advanced mode is enabled */
  advanced?: boolean;
  /** Optional target value for Investment A — rendered as a dashed reference line */
  targetValueA?: number;
  /** Optional target value for Investment B — rendered as a dashed reference line */
  targetValueB?: number;
  /** Monte Carlo percentile bands for Investment A */
  mcBandsA?: PercentileBand[];
  /** Monte Carlo percentile bands for Investment B */
  mcBandsB?: PercentileBand[];
  /** Starting balance of Investment A: anchors the line at today and the performance colour */
  initialAmountA?: number;
  /** Starting balance of Investment B */
  initialAmountB?: number;
}

/**
 * Line chart component for visualizing investment growth over time
 * Supports dual investment tracking with performance-based color coding
 */
export function InvestmentLineChart({
  growthMatrixA,
  growthMatrixB,
  track,
  advanced = false,
  targetValueA,
  targetValueB,
  mcBandsA,
  mcBandsB,
  initialAmountA,
  initialAmountB,
}: InvestmentLineChartProps) {
  const rows = buildChartRows({
    matrixA: growthMatrixA,
    matrixB: growthMatrixB,
    track,
    advanced,
    initialA: initialAmountA,
    initialB: initialAmountB,
    bands: { mc: mcBandsA, mcB: mcBandsB },
  });
  const activeSeries = MC_SERIES_KEYS.filter((key) =>
    rows.some((row) => row[key] !== undefined),
  );

  // CSS color variables
  const fg = "var(--colors-foreground)";
  const cyan = "var(--colors-cyan)";
  const green = "var(--colors-green)";

  // Determine line colors based on performance
  const investmentAColor = getPerformanceColor(
    growthMatrixA,
    track,
    cyan,
    initialAmountA,
  );
  const investmentBColor = getPerformanceColor(
    growthMatrixB,
    track,
    green,
    initialAmountB,
  );

  const targets = [
    {
      tag: "A",
      value: targetValueA,
      color: investmentAColor,
      position: "insideTopRight",
    },
    {
      tag: "B",
      value: advanced ? targetValueB : undefined,
      color: investmentBColor,
      position: "insideBottomRight",
    },
  ] as const;

  // Calculate max value for Y-axis scaling (with 5% padding)
  const maxValue =
    Math.max(...rows.map(rowMax), ...targets.map((t) => t.value ?? 0)) *
    CHART_PADDING_MULTIPLIER;

  return (
    <ChartContainer>
      <ChartTitle>Investment Growth Projection</ChartTitle>
      <ResponsiveContainer width="100%" height="92%">
        <ComposedChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: fg }}
            label={{ value: "Year", position: "insideBottomRight", fill: fg }}
          />
          <YAxis
            domain={[0, maxValue]}
            tickFormatter={compact}
            tick={{ fontSize: 12, fill: fg }}
            label={{
              value: "Value",
              angle: -90,
              position: "insideLeft",
              fill: fg,
            }}
          />
          <Tooltip
            formatter={(
              value: number | string | (string | number)[] | undefined,
            ) => {
              if (typeof value === "number") return compact(value);
              if (Array.isArray(value) && value.length === 2)
                return `${compact(Number(value[0]))} - ${compact(Number(value[1]))}`;
              return "";
            }}
            labelFormatter={(label) => `Year: ${label}`}
            contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ color: fg }}
          />

          {/* Target reference lines */}
          {targets.map(({ tag, value, color, position }) =>
            value != null && value > 0 ? (
              <ReferenceLine
                key={tag}
                y={value}
                stroke={color}
                strokeDasharray="6 3"
                strokeOpacity={0.7}
                label={{
                  value: `Target ${tag}: ${compact(value)}`,
                  fill: color,
                  fontSize: 11,
                  position,
                }}
              />
            ) : null,
          )}

          {/* Monte Carlo confidence bands (P10-P90 outer, P25-P75 inner) */}
          {activeSeries.map((key) => {
            const { color, label, bandPrefix } = MC_SERIES[key];
            return (
              <Fragment key={key}>
                <Area
                  type="monotone"
                  dataKey={`${key}.outer`}
                  fill={color}
                  fillOpacity={0.08}
                  stroke="none"
                  name={`${bandPrefix}P10-P90`}
                  legendType="none"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey={`${key}.inner`}
                  fill={color}
                  fillOpacity={0.12}
                  stroke="none"
                  name={`${bandPrefix}P25-P75`}
                  legendType="none"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey={`${key}.p50`}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  name={label}
                  isAnimationActive={false}
                />
              </Fragment>
            );
          })}

          {/* Investment A Line */}
          <Line
            type="monotone"
            dataKey="investmentA"
            stroke={investmentAColor}
            strokeWidth={3}
            dot={false}
            name="Investment A"
            isAnimationActive={false}
          />

          {/* Investment B Line */}
          {advanced && growthMatrixB && (
            <Line
              type="monotone"
              dataKey="investmentB"
              stroke={investmentBColor}
              strokeWidth={3}
              dot={false}
              name="Investment B"
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
