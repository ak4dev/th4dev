/* ==================================================
 * Capital Preservation Schedule
 * ================================================== */

import { useState, Fragment } from "react";
import { format } from "date-fns";
import { styled } from "../../../stitches.config";
import type { LineGraphEntry } from "../../common/types/types";
import type { PortfolioHolding } from "../../common/types/portfolio-types";
import { interpolateDailyForMonth } from "../../common/helpers/interpolate-daily";
import {
  buildScheduleMatrix,
  withdrawalRowIndex,
  type ScheduleGranularity,
} from "../../common/helpers/preservation-schedule";
import { formatPrice, formatSignedPercent } from "../../common/helpers/format";

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
      safe: { borderColor: "$green", color: "$green" },
      warn: { borderColor: "$orange", color: "$orange" },
      danger: { borderColor: "$red", color: "$red" },
    },
  },
});

const ChipDetail = styled("span", {
  opacity: 0.75,
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
    highlightB: {
      true: {
        backgroundColor: "rgba(80,250,123,0.08)",
        fontWeight: 600,
      },
    },
    daily: {
      true: {
        backgroundColor: "rgba(98,114,164,0.08)",
        fontSize: "0.7rem",
      },
    },
    tone: {
      neutral: { color: "$foreground" },
      safe: { color: "$green" },
      warn: { color: "$yellow" },
      high: { color: "$orange" },
      danger: { color: "$red" },
    },
  },
});

const RowNote = styled("span", {
  marginLeft: 6,
  fontSize: "0.65rem",
  variants: {
    tone: {
      primary: { color: "$purple" },
      secondary: { color: "$green" },
    },
  },
});

const Pct = styled("span", {
  opacity: 0.65,
  marginLeft: 4,
  fontSize: "0.68rem",
  variants: {
    daily: {
      true: { opacity: 0.6, marginLeft: 3, fontSize: "0.65rem" },
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

type GrowthTone = "safe" | "warn" | "high" | "danger";

/** Colour band for the growth still required to reach a target price. */
function growthTone(pct: number): GrowthTone {
  if (pct <= 0) return "safe";
  if (pct <= 50) return "warn";
  if (pct <= 100) return "high";
  return "danger";
}

type StatusLevel = "safe" | "warn" | "danger";

function statusLevel(pct: number): StatusLevel {
  if (pct <= 0) return "safe";
  if (pct <= 50) return "warn";
  return "danger";
}

function statusIcon(level: StatusLevel): string {
  if (level === "safe") return "[OK]";
  if (level === "warn") return "[!]";
  return "[X]";
}

interface CellVariants {
  daily?: boolean;
  highlight?: boolean;
  highlightB?: boolean;
}

/* ==================================================
 * Props
 * ================================================== */

interface CapitalPreservationScheduleProps {
  /**
   * Year-by-year growth matrix from InvestmentCalculator.getGrowthMatrix().
   * Entry[i] is the balance i+1 years from today — there is no year-0 entry,
   * so the schedule prepends one from `initialValue`.
   */
  growthMatrix: LineGraphEntry[];
  /** The lane's balance today (the calculator's starting amount) */
  initialValue: number;
  /** Holdings — those with currentPrice are included in the schedule */
  holdings: PortfolioHolding[];
  /**
   * Year offset at which primary withdrawals begin.
   * This row is highlighted in purple.
   */
  withdrawalStartYear: number;
  /** Annual projected gain percentage (e.g. 10 for 10%) — used for safe-withdrawal status */
  projectedGain: number;
  /** Monthly withdrawal amount — used to compute "safe withdrawal" status */
  monthlyWithdrawal: number;
  /** Optional secondary withdrawal start year — highlighted in green */
  withdrawalStartYearB?: number;
  /** Label for the primary withdrawal row (default: "A") */
  primaryWithdrawalLabel?: string;
  /** Label for the secondary withdrawal row (default: "B") */
  secondaryWithdrawalLabel?: string;
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
 * Formula:  requiredPrice(t) = currentPrice × (projectedValue[t] / initialValue)
 *
 * Features:
 * - Yearly / monthly granularity toggle
 * - Status banner: current price vs. required at withdrawal start date
 * - Highlighted row at the configured withdrawal start year
 * - Color-coded growth % remaining per cell
 */
export default function CapitalPreservationSchedule({
  growthMatrix,
  initialValue,
  holdings,
  withdrawalStartYear,
  projectedGain,
  monthlyWithdrawal,
  withdrawalStartYearB,
  primaryWithdrawalLabel = "A",
  secondaryWithdrawalLabel = "B",
}: CapitalPreservationScheduleProps) {
  const [granularity, setGranularity] = useState<ScheduleGranularity>("yearly");
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

  if (
    growthMatrix.length === 0 ||
    pricedHoldings.length === 0 ||
    !(initialValue > 0)
  ) {
    return null;
  }

  const matrix = buildScheduleMatrix(growthMatrix, initialValue, granularity);
  const withdrawalRowIdx = withdrawalRowIndex(
    withdrawalStartYear,
    granularity,
    matrix.length,
  );
  const withdrawalRowIdxB = withdrawalRowIndex(
    withdrawalStartYearB,
    granularity,
    matrix.length,
  );
  // Withdrawals that start at year 0 are measured against today's row
  const withdrawalEntry = matrix[Math.max(withdrawalRowIdx, 0)];

  // Status banner: how far each price is from what withdrawal start requires
  const statusItems = pricedHoldings.map((h) => {
    const requiredAtWithdrawal =
      h.currentPrice! * (withdrawalEntry.y / initialValue);
    const pctNeeded =
      ((requiredAtWithdrawal - h.currentPrice!) / h.currentPrice!) * 100;
    return {
      h,
      requiredAtWithdrawal,
      pctNeeded,
      level: statusLevel(pctNeeded),
    };
  });

  // Can monthly withdrawals be funded purely from growth on today's balance?
  const withdrawalSafe =
    initialValue * (projectedGain / 100 / 12) >= monthlyWithdrawal;

  const holdingCells = (factor: number, cell: CellVariants) =>
    pricedHoldings.map((h) => {
      // required / currentPrice == factor, so the growth still needed is factor - 1
      const pct = (factor - 1) * 100;
      return (
        <Td key={h.symbol} {...cell} tone={growthTone(pct)}>
          {formatPrice(h.currentPrice! * factor)}
          <Pct daily={cell.daily}>{formatSignedPercent(pct)}</Pct>
        </Td>
      );
    });

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

      <StatusBanner>
        {monthlyWithdrawal > 0 && (
          <StatusChip status={withdrawalSafe ? "safe" : "warn"}>
            {withdrawalSafe ? "[OK]" : "[!]"} Monthly withdrawal ($
            {monthlyWithdrawal.toLocaleString()}) is{" "}
            {withdrawalSafe ? "covered by growth" : "exceeding monthly growth"}
          </StatusChip>
        )}
        {statusItems.map(({ h, requiredAtWithdrawal, pctNeeded, level }) => (
          <StatusChip key={h.symbol} status={level}>
            {statusIcon(level)} {h.symbol}: needs{" "}
            {formatPrice(requiredAtWithdrawal)} at withdrawal{" "}
            <ChipDetail>
              ({formatSignedPercent(pctNeeded)} from{" "}
              {formatPrice(h.currentPrice!)})
            </ChipDetail>
          </StatusChip>
        ))}
      </StatusBanner>

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
              const isWithdrawalRow = idx === withdrawalRowIdx;
              const isWithdrawalRowB =
                idx === withdrawalRowIdxB &&
                withdrawalRowIdxB !== withdrawalRowIdx;
              const rowCell: CellVariants = {
                highlight: isWithdrawalRow,
                highlightB: isWithdrawalRowB,
              };
              const nextEntry = matrix[idx + 1];
              const isExpanded =
                granularity === "monthly" && expandedMonths.has(idx);
              const dailyRows =
                isExpanded && nextEntry
                  ? interpolateDailyForMonth(entry, nextEntry)
                  : [];

              return (
                <Fragment key={idx}>
                  <tr>
                    <Td {...rowCell}>
                      {granularity === "monthly" && nextEntry && (
                        <ExpandBtn
                          title={isExpanded ? "Collapse days" : "Expand days"}
                          onClick={() => toggleMonth(idx)}
                        >
                          {isExpanded ? "▼" : "▶"}
                        </ExpandBtn>
                      )}
                      {format(
                        entry.x,
                        granularity === "monthly" ? "MMM yyyy" : "yyyy",
                      )}
                      {isWithdrawalRow && (
                        <RowNote tone="primary">
                          ← {primaryWithdrawalLabel} withdrawal start
                        </RowNote>
                      )}
                      {isWithdrawalRowB && (
                        <RowNote tone="secondary">
                          ← {secondaryWithdrawalLabel} withdrawal start
                        </RowNote>
                      )}
                    </Td>
                    <Td {...rowCell} tone="neutral">
                      {formatPrice(entry.y)}
                    </Td>
                    {holdingCells(entry.y / initialValue, rowCell)}
                  </tr>

                  {dailyRows.map((dayEntry, dIdx) => (
                    <tr key={`${idx}-d${dIdx}`}>
                      <Td daily>
                        &nbsp;&nbsp;&nbsp;{format(dayEntry.x, "EEE, MMM d")}
                      </Td>
                      <Td daily tone="neutral">
                        {formatPrice(dayEntry.y)}
                      </Td>
                      {holdingCells(dayEntry.y / initialValue, { daily: true })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </Container>
  );
}
