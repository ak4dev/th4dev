/* ==================================================
 * Capital Preservation Schedule
 * ================================================== */

import { useState } from "react";
import { format } from "date-fns";
import { styled } from "../../../stitches.config";
import type { LineGraphEntry } from "../../common/types/types";
import type { PortfolioHolding } from "../../common/types/portfolio-types";
import { interpolateMonthly } from "../../common/helpers/interpolate-monthly";
import { interpolateDailyForMonth } from "../../common/helpers/interpolate-daily";

/* ==================================================
 * Styled Components
 * ================================================== */

const Container = styled("div", {
  marginTop: "16px",
});

const Header = styled("div", {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "8px",
  flexWrap: "wrap",
  gap: "8px",
});

const Heading = styled("h4", {
  margin: 0,
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "$comment",
});

const ToggleGroup = styled("div", {
  display: "flex",
  gap: "4px",
});

const ToggleButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  fontSize: "0.7rem",
  padding: "2px 8px",
  borderRadius: 4,
  border: "1px solid $comment",
  color: "$comment",
  variants: {
    active: {
      true: {
        backgroundColor: "$purple",
        borderColor: "$purple",
        color: "$background",
      },
    },
  },
});

const StatusBanner = styled("div", {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "8px",
});

const StatusChip = styled("div", {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "0.75rem",
  backgroundColor: "$currentLine",
  borderRadius: 5,
  padding: "5px 10px",
  border: "1px solid transparent",
  variants: {
    status: {
      safe: {
        borderColor: "var(--colors-green)",
        color: "var(--colors-green)",
      },
      warn: {
        borderColor: "var(--colors-orange)",
        color: "var(--colors-orange)",
      },
      danger: { borderColor: "var(--colors-red)", color: "var(--colors-red)" },
    },
  },
});

const TableWrap = styled("div", {
  maxHeight: 360,
  overflowY: "auto",
  borderRadius: 6,
  border: "1px solid $comment",
});

const Table = styled("table", {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.75rem",
});

const Th = styled("th", {
  position: "sticky",
  top: 0,
  textAlign: "right",
  padding: "4px 10px",
  borderBottom: "1px solid $comment",
  color: "$comment",
  backgroundColor: "$background",
  fontWeight: 500,
  whiteSpace: "nowrap",
  "&:first-child": { textAlign: "left" },
});

const Td = styled("td", {
  padding: "3px 10px",
  borderBottom: "1px solid rgba(128,128,128,0.1)",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  "&:first-child": { textAlign: "left", color: "$comment" },
  variants: {
    highlight: {
      true: {
        backgroundColor: "rgba(189,147,249,0.12)",
        fontWeight: 600,
      },
    },
    daily: {
      true: {
        backgroundColor: "rgba(98,114,164,0.08)",
        fontSize: "0.7rem",
        color: "$comment",
      },
    },
  },
});

const ExpandBtn = styled("button", {
  all: "unset",
  cursor: "pointer",
  fontSize: "0.65rem",
  marginLeft: 6,
  opacity: 0.6,
  "&:hover": { opacity: 1 },
});

/* ==================================================
 * Helpers
 * ================================================== */

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function growthColor(pct: number): string {
  if (pct <= 0) return "var(--colors-green)";
  if (pct <= 50) return "var(--colors-yellow)";
  if (pct <= 100) return "var(--colors-orange)";
  return "var(--colors-red)";
}

type StatusLevel = "safe" | "warn" | "danger";

function statusLevel(pct: number): StatusLevel {
  if (pct <= 0) return "safe";
  if (pct <= 50) return "warn";
  return "danger";
}

function statusIcon(level: StatusLevel): string {
  if (level === "safe") return "✓";
  if (level === "warn") return "⚠";
  return "✗";
}

/* ==================================================
 * Props
 * ================================================== */

interface CapitalPreservationScheduleProps {
  /**
   * Year-by-year growth matrix from InvestmentCalculator.
   * Entry[0] is the starting (current) portfolio value.
   */
  growthMatrix: LineGraphEntry[];
  /** Holdings — those with currentPrice are included in the schedule */
  holdings: PortfolioHolding[];
  /**
   * Year offset at which withdrawals begin (from sliders).
   * This row is highlighted in the schedule as the critical withdrawal date.
   */
  withdrawalStartYear: number;
  /** Monthly withdrawal amount — used to compute "safe withdrawal" status */
  monthlyWithdrawal: number;
}

/* ==================================================
 * Component
 * ================================================== */

/**
 * Capital Preservation Schedule
 *
 * Shows the required share price per holding at each future date such that
 * the holding grows proportionally with the portfolio projection.
 *
 * Formula:  requiredPrice(t) = currentPrice × (projectedValue[t] / projectedValue[0])
 *
 * Features:
 * - Yearly / monthly granularity toggle
 * - Status banner: current price vs. required at withdrawal start date
 * - Highlighted row at the configured withdrawal start year
 * - Color-coded growth % remaining per cell
 */
export default function CapitalPreservationSchedule({
  growthMatrix,
  holdings,
  withdrawalStartYear,
  monthlyWithdrawal,
}: CapitalPreservationScheduleProps) {
  const [granularity, setGranularity] = useState<"yearly" | "monthly">(
    "yearly",
  );
  // Set of month-row indices that are expanded to show daily breakdown
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());

  const toggleMonth = (idx: number) =>
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const pricedHoldings = holdings.filter(
    (h) => h.currentPrice != null && h.currentPrice > 0,
  );

  if (growthMatrix.length === 0 || pricedHoldings.length === 0) return null;

  const initialValue = growthMatrix[0]?.y;
  if (!initialValue) return null;

  const matrix =
    granularity === "monthly" ? interpolateMonthly(growthMatrix) : growthMatrix;

  // Find the row closest to the withdrawal start date
  const withdrawalRowIdx = Math.min(
    withdrawalStartYear * (granularity === "monthly" ? 12 : 1),
    matrix.length - 1,
  );

  const withdrawalEntry = matrix[withdrawalRowIdx];

  // Status banner: compare current prices to what's needed at withdrawal start
  const statusItems = pricedHoldings.map((h) => {
    const requiredAtWithdrawal =
      h.currentPrice! * (withdrawalEntry?.y / initialValue);
    // "safe" if the stock is already on a path to meet the required price.
    // Since we don't have live market data beyond what was fetched, we compare
    // today's price vs what it will need to be at withdrawal time — the delta
    // tells the user how much growth is still needed.
    const pctNeeded =
      ((requiredAtWithdrawal - h.currentPrice!) / h.currentPrice!) * 100;
    const level = statusLevel(pctNeeded);
    return { h, requiredAtWithdrawal, pctNeeded, level };
  });

  // "Safe today" = at current price, is today's portfolio value on track?
  // Useful summary: can monthly withdrawals be funded purely from growth?
  const portfolioGrowthPerMonth =
    initialValue *
    (growthMatrix.length > 1
      ? growthMatrix[1].y / growthMatrix[0].y - 1
      : 0.1 / 12);
  const withdrawalSafe =
    monthlyWithdrawal > 0 ? portfolioGrowthPerMonth >= monthlyWithdrawal : true;

  return (
    <Container>
      <Header>
        <Heading>Capital Preservation Schedule</Heading>
        <ToggleGroup>
          <ToggleButton
            active={granularity === "yearly"}
            onClick={() => {
              setGranularity("yearly");
              setExpandedMonths(new Set());
            }}
          >
            Yearly
          </ToggleButton>
          <ToggleButton
            active={granularity === "monthly"}
            onClick={() => setGranularity("monthly")}
          >
            Monthly
          </ToggleButton>
        </ToggleGroup>
      </Header>

      {/* Status banner — one chip per priced holding */}
      {withdrawalEntry && (
        <StatusBanner>
          {monthlyWithdrawal > 0 && (
            <StatusChip status={withdrawalSafe ? "safe" : "warn"}>
              {withdrawalSafe ? "✓" : "⚠"} Monthly withdrawal ($
              {monthlyWithdrawal.toLocaleString()}) is{" "}
              {withdrawalSafe
                ? "covered by growth"
                : "exceeding monthly growth"}
            </StatusChip>
          )}
          {statusItems.map(({ h, requiredAtWithdrawal, pctNeeded, level }) => (
            <StatusChip key={h.symbol} status={level}>
              {statusIcon(level)} {h.symbol}: needs{" "}
              {usd.format(requiredAtWithdrawal)} at withdrawal{" "}
              <span style={{ opacity: 0.75 }}>
                ({pctNeeded >= 0 ? "+" : ""}
                {pctNeeded.toFixed(1)}% from ${h.currentPrice!.toFixed(2)})
              </span>
            </StatusChip>
          ))}
        </StatusBanner>
      )}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>{granularity === "monthly" ? "Month" : "Year"}</Th>
              <Th>Portfolio Target</Th>
              {pricedHoldings.map((h) => (
                <Th key={h.symbol}>{h.symbol}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((entry, idx) => {
              const growthFactor = entry.y / initialValue;
              const label =
                granularity === "monthly"
                  ? format(entry.x, "MMM yyyy")
                  : format(entry.x, "yyyy");
              const isWithdrawalRow =
                idx === withdrawalRowIdx && withdrawalStartYear > 0;
              const isExpanded =
                granularity === "monthly" && expandedMonths.has(idx);
              const nextEntry = matrix[idx + 1];

              // Compute daily rows when expanded
              const dailyRows =
                isExpanded && nextEntry
                  ? interpolateDailyForMonth(entry, nextEntry)
                  : [];

              return (
                <>
                  <tr key={idx}>
                    <Td highlight={isWithdrawalRow}>
                      {granularity === "monthly" && nextEntry && (
                        <ExpandBtn
                          title={isExpanded ? "Collapse days" : "Expand days"}
                          onClick={() => toggleMonth(idx)}
                        >
                          {isExpanded ? "▼" : "▶"}
                        </ExpandBtn>
                      )}
                      {label}
                      {isWithdrawalRow && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: "0.65rem",
                            color: "var(--colors-purple)",
                          }}
                        >
                          ← withdrawal start
                        </span>
                      )}
                    </Td>
                    <Td
                      highlight={isWithdrawalRow}
                      style={{ color: "var(--colors-foreground)" }}
                    >
                      {usd.format(entry.y)}
                    </Td>
                    {pricedHoldings.map((h) => {
                      const required = h.currentPrice! * growthFactor;
                      const pct =
                        ((required - h.currentPrice!) / h.currentPrice!) * 100;

                      return (
                        <Td
                          key={h.symbol}
                          highlight={isWithdrawalRow}
                          style={{ color: growthColor(pct) }}
                        >
                          {usd.format(required)}
                          <span
                            style={{
                              opacity: 0.65,
                              marginLeft: 4,
                              fontSize: "0.68rem",
                            }}
                          >
                            {pct >= 0 ? "+" : ""}
                            {pct.toFixed(1)}%
                          </span>
                        </Td>
                      );
                    })}
                  </tr>

                  {/* Daily drill-down rows */}
                  {dailyRows.map((dayEntry, dIdx) => {
                    const dayFactor = dayEntry.y / initialValue;
                    return (
                      <tr key={`${idx}-d${dIdx}`}>
                        <Td daily>
                          &nbsp;&nbsp;&nbsp;{format(dayEntry.x, "EEE, MMM d")}
                        </Td>
                        <Td daily style={{ color: "var(--colors-foreground)" }}>
                          {usd.format(dayEntry.y)}
                        </Td>
                        {pricedHoldings.map((h) => {
                          const required = h.currentPrice! * dayFactor;
                          const pct =
                            ((required - h.currentPrice!) / h.currentPrice!) *
                            100;
                          return (
                            <Td
                              key={h.symbol}
                              daily
                              style={{ color: growthColor(pct) }}
                            >
                              {usd.format(required)}
                              <span
                                style={{
                                  opacity: 0.6,
                                  marginLeft: 3,
                                  fontSize: "0.65rem",
                                }}
                              >
                                {pct >= 0 ? "+" : ""}
                                {pct.toFixed(1)}%
                              </span>
                            </Td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </Container>
  );
}
