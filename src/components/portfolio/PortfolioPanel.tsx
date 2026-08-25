/* ==================================================
 * Portfolio Panel
 * ================================================== */

import { useState, type Dispatch, type SetStateAction } from "react";
import * as Icons from "@radix-ui/react-icons";
import { styled } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";
import { computePortfolioProjection } from "../../common/helpers/portfolio-projection";
import type { PortfolioHolding } from "../../common/types/portfolio-types";
import type { LineGraphEntry } from "../../common/types/types";
import PortfolioProjectionChart from "./PortfolioProjectionChart";
import CapitalPreservationSchedule from "./CapitalPreservationSchedule";
import { useFetchPrices } from "./useFetchPrices";
import { ActionButton, ErrorText, IconButton } from "../ui/primitives";

/* ==================================================
 * Styled Components
 * ================================================== */

const Wrapper = styled("div", {
  marginTop: "24px",
  backgroundColor: "$currentLine",
  borderRadius: "12px",
  padding: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
});

const SectionTitle = styled("h3", {
  margin: 0,
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "$foreground",
});

const HoldingsTable = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
});

const GRID = {
  display: "grid",
  gridTemplateColumns: "6rem 7.25rem 6rem 6rem minmax(6rem, 1fr) auto",
  gap: "8px",
} as const;

const HoldingRow = styled("div", {
  ...GRID,
  alignItems: "center",
});

const HeaderRow = styled("div", {
  ...GRID,
  paddingBottom: "4px",
  borderBottom: "1px solid $comment",
});

const ColLabel = styled("span", {
  fontSize: "0.7rem",
  color: "$comment",
  fontWeight: 500,
  variants: {
    align: {
      right: { textAlign: "right" },
    },
  },
});

const SymbolTag = styled("span", {
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "$cyan",
});

const NumberInput = styled("input", {
  ...compactModernInputStyles,
  width: "5ch",
  maxWidth: "5ch",
  minWidth: 0,
  textAlign: "right",
});

const PriceDisplay = styled("span", {
  fontSize: "0.8rem",
  color: "$green",
  textAlign: "right",
});

const TargetPriceCell = styled("span", {
  fontSize: "0.8rem",
  textAlign: "right",
  variants: {
    status: {
      met: { color: "$green" },
      unmet: { color: "$red" },
      unknown: { color: "$comment" },
    },
  },
  defaultVariants: { status: "unknown" },
});

const RefPriceCell = styled("span", {
  fontSize: "0.8rem",
  color: "$comment",
  textAlign: "right",
});

const Row = styled("div", {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
});

const AllocationSum = styled("span", {
  fontSize: "0.75rem",
  variants: {
    valid: {
      true: { color: "$green" },
      false: { color: "$orange" },
    },
  },
});

const InfoText = styled("p", {
  color: "$comment",
  fontSize: "0.75rem",
  margin: 0,
});

const PortfolioValueRow = styled("div", {
  display: "flex",
  gap: "8px",
  alignItems: "center",
});

const PortfolioLabel = styled("span", {
  fontSize: "0.75rem",
  color: "$comment",
  whiteSpace: "nowrap",
});

const PortfolioValueValue = styled("span", {
  minWidth: 0,
  textAlign: "left",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.01em",
  color: "$green",
});

const PortfolioMeta = styled("span", {
  marginLeft: "8px",
  color: "$comment",
  fontSize: "0.75rem",
});

const InvestmentToggleGroup = styled("div", {
  display: "flex",
  gap: "4px",
});

const InvestmentToggleButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  fontSize: "0.72rem",
  padding: "3px 10px",
  borderRadius: 4,
  border: "1px solid $comment",
  color: "$comment",
  variants: {
    active: {
      true: {
        backgroundColor: "$purple",
        borderColor: "$purple",
        color: "$background",
        fontWeight: 600,
      },
    },
  },
});

const SectionTitleRow = styled("div", {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
});

/* ==================================================
 * Helpers
 * ================================================== */

/**
 * Computes the minimum required price for a holding at today's date,
 * based on the start price and time elapsed since the projection was initialised.
 *
 * Formula (same as computePortfolioProjection, solved for elapsed fractional years):
 *   target = startPrice × (1 + elapsedYears × 12 × monthlyWithdrawal / totalPortfolioValue)
 */
function computeTargetPriceToday(
  h: {
    startPrice?: number;
    projectionStartDate?: string;
    currentPrice?: number;
  },
  totalPortfolioValue: number,
  monthlyWithdrawal: number,
): number | undefined {
  if (h.startPrice == null) return h.currentPrice;
  if (!h.projectionStartDate || totalPortfolioValue <= 0) return h.startPrice;
  const elapsedYears = Math.max(
    0,
    (Date.now() - new Date(h.projectionStartDate).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000),
  );
  return Math.max(
    0,
    h.startPrice *
      (1 + (elapsedYears * 12 * monthlyWithdrawal) / totalPortfolioValue),
  );
}

/* ==================================================
 * Props
 * ================================================== */

/**
 * Inputs the panel needs from one investment lane. The hub builds one for
 * Investment A and, while advanced mode is on, one for Investment B.
 */
export interface PortfolioLane {
  /** Balance today — the calculator's starting amount (year-0 row of the schedule) */
  initialValue: number;
  /** Projected ending balance from the calculator — the total the projection preserves */
  portfolioValue: number;
  /**
   * Effective monthly withdrawal in USD. With dynamic withdrawal on this is
   * a representative amount (the first scheduled withdrawal), not a slider.
   */
  monthlyWithdrawal: number;
  /** Annual projected gain percentage (e.g. 10 for 10%) */
  projectedGain: number;
  /** Year offset at which withdrawals begin */
  withdrawalStartYear: number;
  /** Number of years to project forward */
  years: number;
  /** InvestmentCalculator.getGrowthMatrix() — entry 0 is today + 1 year */
  growthMatrix: LineGraphEntry[];
}

type LaneKey = "A" | "B";

interface PortfolioPanelProps {
  /** Holdings state (symbol + allocation + optional fetched price) */
  holdings: PortfolioHolding[];
  setHoldings: Dispatch<SetStateAction<PortfolioHolding[]>>;
  /** API URL template with {symbol} placeholder */
  stockApiUrl: string;
  /** Investment A is always present; B only while advanced mode is on */
  lanes: { A: PortfolioLane; B?: PortfolioLane };
}

/* ==================================================
 * Component
 * ================================================== */

export default function PortfolioPanel({
  holdings,
  setHoldings,
  stockApiUrl,
  lanes,
}: PortfolioPanelProps) {
  const [selectedLane, setSelectedLane] = useState<LaneKey>("A");
  // Fall back to A when B becomes unavailable
  const activeKey: LaneKey = lanes.B && selectedLane === "B" ? "B" : "A";
  const otherKey: LaneKey = activeKey === "A" ? "B" : "A";
  const active = lanes[activeKey] ?? lanes.A;
  const other = lanes[otherKey];

  // Raw allocation text per symbol while its input is being edited
  const [allocDrafts, setAllocDrafts] = useState<Record<string, string>>({});
  const {
    fetchPrices,
    loading,
    error: fetchError,
  } = useFetchPrices(stockApiUrl, setHoldings);

  const updateAllocation = (symbol: string, pct: number) =>
    setHoldings((prev) =>
      prev.map((h) => (h.symbol === symbol ? { ...h, allocationPct: pct } : h)),
    );

  const dropDraft = (symbol: string) =>
    setAllocDrafts((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([s]) => s !== symbol)),
    );

  const removeHolding = (symbol: string) => {
    setHoldings((prev) => prev.filter((h) => h.symbol !== symbol));
    dropDraft(symbol);
  };

  // Keep the raw text while typing so "12." and "0.5" survive the controlled re-render
  const editAllocation = (symbol: string, raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    setAllocDrafts((prev) => ({ ...prev, [symbol]: cleaned }));
    const parsed = parseFloat(cleaned);
    if (!Number.isNaN(parsed)) updateAllocation(symbol, Math.min(100, parsed));
    else if (cleaned === "") updateAllocation(symbol, 0);
  };

  const commitAllocation = (symbol: string) => {
    const draft = allocDrafts[symbol];
    if (draft === undefined) return;
    updateAllocation(symbol, Math.min(100, parseFloat(draft) || 0));
    dropDraft(symbol);
  };

  const totalAllocation = holdings.reduce((s, h) => s + h.allocationPct, 0);
  const allocationValid = Math.abs(totalAllocation - 100) < 0.01;

  const holdingsWithPrice = holdings.filter(
    (h) => h.currentPrice != null && h.currentPrice > 0,
  );

  const projection =
    holdingsWithPrice.length > 0 && active.portfolioValue > 0
      ? computePortfolioProjection({
          holdings: holdingsWithPrice,
          totalPortfolioValue: active.portfolioValue,
          monthlyWithdrawal: active.monthlyWithdrawal,
          yearsForward: active.years,
        })
      : {};

  const showChart = allocationValid && Object.keys(projection).length > 0;
  const projectionHint = !holdingsWithPrice.length
    ? "Fetch current prices to generate the projection."
    : !allocationValid
      ? "Set allocations that sum to 100% to see the projection."
      : null;

  return (
    <Wrapper>
      <SectionTitleRow>
        <SectionTitle>Portfolio Capital Preservation</SectionTitle>
        {lanes.B && (
          <InvestmentToggleGroup>
            {(["A", "B"] as const).map((key) => (
              <InvestmentToggleButton
                key={key}
                active={activeKey === key}
                onClick={() => setSelectedLane(key)}
              >
                Investment {key}
              </InvestmentToggleButton>
            ))}
          </InvestmentToggleGroup>
        )}
      </SectionTitleRow>

      <PortfolioValueRow>
        <PortfolioLabel>Total Portfolio Value</PortfolioLabel>
        <PortfolioValueValue aria-live="polite">
          ${Math.max(0, active.portfolioValue).toLocaleString("en-US")}
        </PortfolioValueValue>
        <PortfolioMeta>
          · Monthly withdrawal: ${active.monthlyWithdrawal.toLocaleString()} ·
          Horizon: {active.years} yrs
        </PortfolioMeta>
      </PortfolioValueRow>

      {/* Holdings table */}
      {holdings.length > 0 ? (
        <HoldingsTable>
          <HeaderRow>
            <ColLabel>Symbol</ColLabel>
            <ColLabel>Allocation %</ColLabel>
            <ColLabel align="right">Target price</ColLabel>
            <ColLabel align="right">Proj. start</ColLabel>
            <ColLabel align="right">Current Price</ColLabel>
            <ColLabel />
          </HeaderRow>
          {holdings.map((h) => {
            const targetPrice = computeTargetPriceToday(
              h,
              active.portfolioValue,
              active.monthlyWithdrawal,
            );
            const targetMet =
              targetPrice != null && h.currentPrice != null
                ? h.currentPrice >= targetPrice
                : undefined;
            return (
              <HoldingRow key={h.symbol}>
                <SymbolTag>{h.symbol}</SymbolTag>
                <NumberInput
                  type="text"
                  inputMode="decimal"
                  aria-label={`${h.symbol} allocation percent`}
                  value={allocDrafts[h.symbol] ?? (h.allocationPct || "")}
                  onChange={(e) => editAllocation(h.symbol, e.target.value)}
                  onBlur={() => commitAllocation(h.symbol)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  placeholder="0"
                />
                <TargetPriceCell
                  status={
                    targetMet == null ? "unknown" : targetMet ? "met" : "unmet"
                  }
                >
                  {targetPrice != null ? `$${targetPrice.toFixed(2)}` : "—"}
                </TargetPriceCell>
                <RefPriceCell>
                  {h.startPrice != null ? `$${h.startPrice.toFixed(2)}` : "—"}
                </RefPriceCell>
                <PriceDisplay>
                  {h.currentPrice != null
                    ? `$${h.currentPrice.toFixed(2)}`
                    : "—"}
                </PriceDisplay>
                <IconButton
                  css={{ padding: "2px" }}
                  onClick={() => removeHolding(h.symbol)}
                  aria-label={`Remove ${h.symbol}`}
                >
                  <Icons.Cross2Icon width={12} height={12} />
                </IconButton>
              </HoldingRow>
            );
          })}
        </HoldingsTable>
      ) : (
        <InfoText>
          Add stock symbols via the Stock Fetcher (Ctrl+Shift+S) to build your
          portfolio.
        </InfoText>
      )}

      {/* Allocation sum indicator + actions */}
      <Row>
        <ActionButton
          size="sm"
          onClick={() => void fetchPrices(holdings.map((h) => h.symbol))}
          disabled={loading || holdings.length === 0}
        >
          {loading ? "Fetching…" : "Fetch Current Prices"}
        </ActionButton>
        {holdings.length > 0 && (
          <AllocationSum valid={allocationValid}>
            Allocated: {totalAllocation.toFixed(1)}%{" "}
            {allocationValid ? "(OK)" : "(must equal 100%)"}
          </AllocationSum>
        )}
      </Row>

      {fetchError && <ErrorText>{fetchError}</ErrorText>}

      {/* Withdrawal-based projection chart */}
      {holdings.length > 0 &&
        (showChart ? (
          <PortfolioProjectionChart projection={projection} />
        ) : (
          projectionHint && <InfoText>{projectionHint}</InfoText>
        ))}

      {/* Capital preservation schedule — requires fetched prices */}
      <CapitalPreservationSchedule
        growthMatrix={active.growthMatrix}
        initialValue={active.initialValue}
        holdings={holdings}
        withdrawalStartYear={active.withdrawalStartYear}
        monthlyWithdrawal={active.monthlyWithdrawal}
        projectedGain={active.projectedGain}
        withdrawalStartYearB={other?.withdrawalStartYear}
        primaryWithdrawalLabel={activeKey}
        secondaryWithdrawalLabel={otherKey}
      />
    </Wrapper>
  );
}
