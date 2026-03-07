// src/components/investment-line-chart.tsx
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { format } from "date-fns";
import type { LineGraphEntry } from "../common/types/types";
import { styled } from "../../stitches.config";

// ==================================================
// Styled container
// ==================================================
const ChartContainer = styled("div", {
  width: "100%",
  height: 350,
  marginTop: 32,
  backgroundColor: "$currentLine",
  borderRadius: "8px",
  padding: "16px",
  transition: "background-color 0.25s ease",
});

// ==================================================
// Format large numbers compactly (1.4M, 2.7B)
// ==================================================
const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

// ==================================================
// Prepare chart data
// ==================================================
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

// ==================================================
// Performance color helper
// ==================================================
function getPerformanceColor(
  matrix: LineGraphEntry[] | undefined,
  defaultColor: string,
) {
  if (!matrix || matrix.length === 0) return defaultColor;
  const start = matrix[0].y;
  const end = matrix[matrix.length - 1].y;
  const red = "var(--colors-red)";
  const orange = "var(--colors-orange)";
  if (end < 0) return red;
  if (end < start) return orange;
  return defaultColor;
}

// ==================================================
// Chart Component
// ==================================================
export function InvestmentLineChart({
  growthMatrixA,
  growthMatrixB,
  advanced = false,
  yearOfRollover,
}: {
  growthMatrixA: LineGraphEntry[];
  growthMatrixB?: LineGraphEntry[];
  advanced?: boolean;
  yearOfRollover?: number;
}) {
  const data = prepareChartData(
    growthMatrixA,
    growthMatrixB,
    advanced,
    yearOfRollover,
  );

  const fg = "var(--colors-foreground)";
  const cyan = "var(--colors-cyan)";
  const green = "var(--colors-green)";

  const investmentAColor = getPerformanceColor(growthMatrixA, cyan);
  const investmentBColor = getPerformanceColor(growthMatrixB, green);

  // Determine max value for axis scaling (5% padding above)
  const allValues = [
    ...data.map((d) => d.investmentA ?? 0),
    ...(advanced ? data.map((d) => d.investmentB ?? 0) : []),
  ];
  const maxValue = Math.max(...allValues) * 1.05;

  return (
    <ChartContainer>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#55555533" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: fg }}
            label={{ value: "Year", position: "insideBottomRight", fill: fg }}
          />
          <YAxis
            domain={[0, maxValue]}
            tickFormatter={(value) => `$${numberFormatter.format(value)}`}
            tick={{ fontSize: 12, fill: fg }}
            label={{
              value: "Value",
              angle: -90,
              position: "insideLeft",
              fill: fg,
            }}
          />
          <Tooltip
            formatter={(value: any) =>
              value !== null && value !== undefined
                ? `$${numberFormatter.format(value)}`
                : ""
            }
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

          {/* Investment A */}
          <Line
            type="monotone"
            dataKey="investmentA"
            stroke={investmentAColor}
            strokeWidth={3}
            dot={false}
            name="Investment A"
          />

          {/* Investment B */}
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
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
