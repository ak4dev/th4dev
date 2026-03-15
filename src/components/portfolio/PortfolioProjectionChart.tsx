/* ==================================================
 * Portfolio Required-Price Projection Chart
 * ================================================== */

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
import { styled } from "../../../stitches.config";
import type { PortfolioProjection } from "../../common/types/portfolio-types";
import { CHART_HEIGHT } from "../../common/constants/app-constants";

/* ==================================================
 * Styled Components
 * ================================================== */

const ChartContainer = styled("div", {
  width: "100%",
  height: CHART_HEIGHT,
  marginTop: 24,
  backgroundColor: "$currentLine",
  borderRadius: "8px",
  padding: "16px",
});

const ChartTitle = styled("h4", {
  margin: 0,
  marginBottom: "10px",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "$comment",
});

/* ==================================================
 * Constants
 * ================================================== */

/** Recharts line colors cycled for each symbol */
const LINE_COLORS = [
  "var(--colors-cyan)",
  "var(--colors-green)",
  "var(--colors-orange)",
  "var(--colors-pink)",
  "var(--colors-purple)",
  "var(--colors-yellow)",
  "var(--colors-red)",
];

const COMPACT_MAX_FRACTION_DIGITS = 2;

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: COMPACT_MAX_FRACTION_DIGITS,
});

/* ==================================================
 * Props
 * ================================================== */

interface PortfolioProjectionChartProps {
  projection: PortfolioProjection;
}

/* ==================================================
 * Component
 * ================================================== */

/**
 * Line chart displaying the required share price per holding over time
 * to preserve the user's initial portfolio capital after withdrawals.
 */
export default function PortfolioProjectionChart({
  projection,
}: PortfolioProjectionChartProps) {
  const symbols = Object.keys(projection);

  if (symbols.length === 0) return null;

  // Build flat data array keyed by year label
  const allYears = new Set<number>();
  symbols.forEach((sym) =>
    projection[sym].forEach((pt) => allYears.add(pt.year)),
  );

  const data = Array.from(allYears)
    .sort((a, b) => a - b)
    .map((year) => {
      const entry: Record<string, string | number> = {
        date: format(projection[symbols[0]][year]?.date ?? new Date(), "yyyy"),
      };
      symbols.forEach((sym) => {
        const pt = projection[sym].find((p) => p.year === year);
        if (pt) entry[sym] = pt.requiredPrice;
      });
      return entry;
    });

  const fg = "var(--colors-foreground)";

  return (
    <ChartContainer>
      <ChartTitle>Required Share Price Projection</ChartTitle>
      <ResponsiveContainer width="100%" height="92%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#55555533" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: fg }}
            label={{ value: "Year", position: "insideBottomRight", fill: fg }}
          />
          <YAxis
            tickFormatter={(v: number) => priceFormatter.format(v)}
            tick={{ fontSize: 12, fill: fg }}
            label={{
              value: "Required Price",
              angle: -90,
              position: "insideLeft",
              fill: fg,
            }}
          />
          <Tooltip
            formatter={(v: number | undefined) =>
              v != null ? priceFormatter.format(v) : ""
            }
            labelFormatter={(label) => `Year: ${label}`}
            contentStyle={{
              backgroundColor: "var(--colors-currentLine)",
              border: "1px solid var(--colors-foreground)",
              color: "var(--colors-foreground)",
              borderRadius: 6,
              fontSize: 12,
            }}
            itemStyle={{ color: "var(--colors-foreground)" }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ color: fg }}
          />
          {symbols.map((sym, i) => (
            <Line
              key={sym}
              type="monotone"
              dataKey={sym}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              name={sym}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
