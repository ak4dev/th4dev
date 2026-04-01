/* ==================================================
 * Investment Line Chart Component
 * ================================================== */

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
import { format } from "date-fns";
import type { LineGraphEntry } from "../common/types/types";
import type { PercentileBand } from "../common/helpers/monte-carlo";
import { styled } from "../../stitches.config";
import { CHART_HEIGHT } from "../common/constants/app-constants";

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

/* ==================================================
 * Number Formatting
 * ================================================== */

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: COMPACT_MAX_FRACTION_DIGITS,
});

/* ==================================================
 * Data Preparation
 * ================================================== */

/**
 * Prepares chart data from investment growth matrices
 * @param matrixA - Growth matrix for investment A
 * @param matrixB - Growth matrix for investment B (optional)
 * @param advanced - Whether advanced mode is enabled
 * @param yearOfRollover - Year when rollover occurs (optional)
 * @returns Array of chart data points
 */
function prepareChartData(
  matrixA: LineGraphEntry[],
  matrixB?: LineGraphEntry[],
  advanced?: boolean,
  yearOfRollover?: number,
) {
  const allYears = new Set<number>();
  matrixA.forEach((e) => allYears.add(parseInt(format(e.x, "yyyy"))));
  matrixB?.forEach((e) => allYears.add(parseInt(format(e.x, "yyyy"))));
  const sortedYears = Array.from(allYears).sort((a, b) => a - b);

  return sortedYears.map((year) => {
    const entryA = matrixA.find((e) => parseInt(format(e.x, "yyyy")) === year);
    const entryB = matrixB?.find((e) => parseInt(format(e.x, "yyyy")) === year);

    const investmentA = entryA ? entryA.y : null;
    let investmentBValue = entryB?.y ?? null;

    // Apply rollover amount to investment B in the rollover year
    if (yearOfRollover !== undefined && year === yearOfRollover && entryA) {
      investmentBValue = (investmentBValue ?? 0) + entryA.y;
    }

    return {
      date: `${year}`,
      investmentA,
      investmentB: advanced ? investmentBValue : null,
    };
  });
}

/* ==================================================
 * Color Helpers
 * ================================================== */

/**
 * Determines line color based on investment performance
 * @param matrix - Growth matrix for the investment
 * @param defaultColor - Default color to use for positive performance
 * @returns CSS color value
 */
function getPerformanceColor(
  matrix: LineGraphEntry[] | undefined,
  defaultColor: string,
): string {
  if (!matrix || matrix.length === 0) return defaultColor;

  const start = matrix[0].y;
  const end = matrix[matrix.length - 1].y;
  const red = "var(--colors-red)";
  const orange = "var(--colors-orange)";

  if (end < 0) return red;
  if (end < start) return orange;

  return defaultColor;
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
  /** Whether advanced mode is enabled */
  advanced?: boolean;
  /** Year when rollover occurs (optional) */
  yearOfRollover?: number;
  /** Optional target value for Investment A — rendered as a dashed reference line */
  targetValueA?: number;
  /** Optional target value for Investment B — rendered as a dashed reference line */
  targetValueB?: number;
  /** Monte Carlo percentile bands for Investment A */
  mcBandsA?: PercentileBand[];
  /** Monte Carlo percentile bands for Investment B */
  mcBandsB?: PercentileBand[];
}

/**
 * Line chart component for visualizing investment growth over time
 * Supports dual investment tracking with performance-based color coding
 */
export function InvestmentLineChart({
  growthMatrixA,
  growthMatrixB,
  advanced = false,
  yearOfRollover,
  targetValueA,
  targetValueB,
  mcBandsA,
  mcBandsB,
}: InvestmentLineChartProps) {
  const data = prepareChartData(
    growthMatrixA,
    growthMatrixB,
    advanced,
    yearOfRollover,
  );

  // Build year-keyed maps from MC bands so we can align by band.year
  const hasMCA = mcBandsA && mcBandsA.length > 0;
  const hasMCB = mcBandsB && mcBandsB.length > 0;
  const bandAByYear = hasMCA
    ? new Map(mcBandsA.map((b) => [b.year, b]))
    : new Map<number, (typeof mcBandsA extends (infer U)[] | undefined ? U : never)>();
  const bandBByYear = hasMCB
    ? new Map(mcBandsB.map((b) => [b.year, b]))
    : new Map<number, (typeof mcBandsB extends (infer U)[] | undefined ? U : never)>();

  // Determine how many chart points we need — may exceed deterministic data
  // if individual-mode MC bands are offset beyond the growth matrices
  const maxMCYear = Math.max(
    hasMCA ? mcBandsA[mcBandsA.length - 1].year : 0,
    hasMCB ? mcBandsB[mcBandsB.length - 1].year : 0,
  );
  const baseStartYear = parseInt(data[0]?.date ?? "0");
  const totalPoints = Math.max(data.length, maxMCYear + 1);

  // Extend chart data with null-valued points for years beyond deterministic range
  const extendedData = Array.from({ length: totalPoints }, (_, i) =>
    data[i] ?? { date: `${baseStartYear + i}`, investmentA: null, investmentB: null },
  );

  // Merge MC bands by year field
  const mergedData = extendedData.map((d, i) => {
    const bandA = bandAByYear.get(i);
    const bandB = bandBByYear.get(i);
    return {
      ...d,
      ...(bandA
        ? {
            mcP10: bandA.p10,
            mcP25: bandA.p25,
            mcP50: bandA.p50,
            mcP75: bandA.p75,
            mcP90: bandA.p90,
            mcOuter: [bandA.p10, bandA.p90],
            mcInner: [bandA.p25, bandA.p75],
          }
        : {}),
      ...(bandB
        ? {
            mcBP50: bandB.p50,
            mcBOuter: [bandB.p10, bandB.p90],
            mcBInner: [bandB.p25, bandB.p75],
          }
        : {}),
    };
  });

  // CSS color variables
  const fg = "var(--colors-foreground)";
  const cyan = "var(--colors-cyan)";
  const green = "var(--colors-green)";

  // Determine line colors based on performance
  const investmentAColor = getPerformanceColor(growthMatrixA, cyan);
  const investmentBColor = getPerformanceColor(growthMatrixB, green);

  // Calculate max value for Y-axis scaling (with 5% padding)
  const allValues = [
    ...mergedData.map((d) => d.investmentA ?? 0),
    ...(advanced ? mergedData.map((d) => d.investmentB ?? 0) : []),
    ...(targetValueA ? [targetValueA] : []),
    ...(targetValueB && advanced ? [targetValueB] : []),
    ...(hasMCA ? mcBandsA.map((b) => b.p90) : []),
    ...(hasMCB ? mcBandsB.map((b) => b.p90) : []),
  ];
  const maxValue = Math.max(...allValues) * CHART_PADDING_MULTIPLIER;

  return (
    <ChartContainer>
      <ChartTitle>Investment Growth Projection</ChartTitle>
      <ResponsiveContainer width="100%" height="92%">
        <ComposedChart data={mergedData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#55555533" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: fg }}
            label={{ value: "Year", position: "insideBottomRight", fill: fg }}
          />
          <YAxis
            domain={[0, maxValue]}
            tickFormatter={(value: number) =>
              `$${numberFormatter.format(value)}`
            }
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
              if (typeof value === "number")
                return `$${numberFormatter.format(value)}`;
              if (Array.isArray(value) && value.length === 2)
                return `$${numberFormatter.format(Number(value[0]))} - $${numberFormatter.format(Number(value[1]))}`;
              return "";
            }}
            labelFormatter={(label) => `Year: ${label}`}
            contentStyle={{
              backgroundColor: "var(--colors-currentLine)",
              border: "1px solid var(--colors-foreground)",
              color: "var(--colors-foreground)",
              borderRadius: 6,
              fontSize: 12,
            }}
            itemStyle={{
              color: "var(--colors-foreground)",
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ color: fg }}
          />

          {/* Target reference lines */}
          {targetValueA != null && targetValueA > 0 && (
            <ReferenceLine
              y={targetValueA}
              stroke={investmentAColor}
              strokeDasharray="6 3"
              strokeOpacity={0.7}
              label={{
                value: `Target A: $${numberFormatter.format(targetValueA)}`,
                fill: investmentAColor,
                fontSize: 11,
                position: "insideTopRight",
              }}
            />
          )}
          {advanced && targetValueB != null && targetValueB > 0 && (
            <ReferenceLine
              y={targetValueB}
              stroke={investmentBColor}
              strokeDasharray="6 3"
              strokeOpacity={0.7}
              label={{
                value: `Target B: $${numberFormatter.format(targetValueB)}`,
                fill: investmentBColor,
                fontSize: 11,
                position: "insideBottomRight",
              }}
            />
          )}

          {/* Monte Carlo confidence bands A (P10-P90 outer, P25-P75 inner) */}
          {hasMCA && (
            <>
              <Area
                type="monotone"
                dataKey="mcOuter"
                fill="var(--colors-purple)"
                fillOpacity={0.08}
                stroke="none"
                name="P10-P90"
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="mcInner"
                fill="var(--colors-purple)"
                fillOpacity={0.12}
                stroke="none"
                name="P25-P75"
                legendType="none"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="mcP50"
                stroke="var(--colors-purple)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                name="Median (MC)"
                isAnimationActive={false}
              />
            </>
          )}

          {/* Monte Carlo confidence bands B */}
          {hasMCB && (
            <>
              <Area
                type="monotone"
                dataKey="mcBOuter"
                fill="var(--colors-green)"
                fillOpacity={0.08}
                stroke="none"
                name="B P10-P90"
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="mcBInner"
                fill="var(--colors-green)"
                fillOpacity={0.12}
                stroke="none"
                name="B P25-P75"
                legendType="none"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="mcBP50"
                stroke="var(--colors-green)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                name="Median B (MC)"
                isAnimationActive={false}
              />
            </>
          )}

          {/* Investment A Line */}
          <Line
            type="monotone"
            dataKey="investmentA"
            stroke={investmentAColor}
            strokeWidth={3}
            dot={false}
            name="Investment A"
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
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
