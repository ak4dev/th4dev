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
import { format } from "date-fns/format";
import { styled } from "../../../stitches.config";
import type { PortfolioProjection } from "../../common/types/portfolio-types";
import { CHART_HEIGHT } from "../../common/constants/app-constants";
import { formatPrice } from "../../common/helpers/format";
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
} from "../ui/primitives";

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

/** Grid lines: the theme's comment colour, faint enough to stay behind the data */
const GRID_STROKE =
  "color-mix(in srgb, var(--colors-comment) 25%, transparent)";

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

  // Every series shares the same year axis, so row i is year i for all symbols
  const data = projection[symbols[0]].map((pt, i) => ({
    date: format(pt.date, "yyyy"),
    ...Object.fromEntries(
      symbols.map((sym) => [sym, projection[sym][i]?.requiredPrice]),
    ),
  }));

  const fg = "var(--colors-foreground)";

  return (
    <ChartContainer>
      <ChartTitle>Required Share Price Projection</ChartTitle>
      <ResponsiveContainer width="100%" height="92%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: fg }}
            label={{ value: "Year", position: "insideBottomRight", fill: fg }}
          />
          <YAxis
            tickFormatter={formatPrice}
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
              v != null ? formatPrice(v) : ""
            }
            labelFormatter={(label) => `Year: ${label}`}
            contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
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
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
