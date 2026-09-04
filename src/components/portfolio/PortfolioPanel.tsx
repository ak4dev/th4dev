/* ==================================================
 * Portfolio Panel
 * ================================================== */

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import * as Icons from "@radix-ui/react-icons";
import { styled } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";
import {
  parseFieldValue,
  sanitizeNumericText,
  type NumericFieldPolicy,
} from "../../common/helpers/numeric-field";
import { computePortfolioProjection } from "../../common/helpers/portfolio-projection";
import { validateStockUrlTemplate } from "../../common/helpers/stock-client";
import type { PortfolioHolding } from "../../common/types/portfolio-types";
import type { PortfolioLane } from "./portfolio-lane";
import PortfolioProjectionChart from "./PortfolioProjectionChart";
import CapitalPreservationSchedule from "./CapitalPreservationSchedule";
import { useFetchPrices } from "./useFetchPrices";
import {
  ActionButton,
  ErrorText,
  IconButton,
  PanelContainer,
} from "../ui/primitives";

/* ==================================================
 * Styled Components
 * ================================================== */

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
 * The allocation box reads a share of the portfolio: fractions of a percent
 * are typed, anything above the whole portfolio is pulled back to it, and a
 * box the user has emptied allocates nothing to that holding.
 */
const ALLOCATION_FIELD = {
  decimal: true,
  max: 100,
  fallback: 0,
} satisfies NumericFieldPolicy;

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

  // The same template drives this button and the modal's, so the check lives
  // in the client and is only surfaced here — a UI-only guard on one form
  // would leave the other Fetch button firing requests the client rejects.
  const urlError = useMemo(
    () => validateStockUrlTemplate(stockApiUrl),
    [stockApiUrl],
  );

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

  // Keep the raw text while typing so "12." and "0.5" survive the controlled
  // re-render, and write each keystroke through so the "Allocated: x%"
  // indicator answers while the user is still typing.
  const editAllocation = (symbol: string, raw: string) => {
    const cleaned = sanitizeNumericText(raw, ALLOCATION_FIELD.decimal);
    setAllocDrafts((prev) => ({ ...prev, [symbol]: cleaned }));
    // Mid-word the field's own fallback does not apply: a "." on its way to
    // ".5" is not yet a number, and zeroing the holding for that keystroke
    // would reallocate a portfolio the user is in the middle of describing.
    // Only an emptied box means nothing is allocated.
    const live = parseFieldValue(cleaned, {
      ...ALLOCATION_FIELD,
      fallback: cleaned === "" ? 0 : "revert",
    });
    if (live !== "revert") updateAllocation(symbol, live);
  };

  const commitAllocation = (symbol: string) => {
    const draft = allocDrafts[symbol];
    if (draft === undefined) return;
    updateAllocation(symbol, parseFieldValue(draft, ALLOCATION_FIELD));
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
    <PanelContainer surface="stack">
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
          disabled={loading || holdings.length === 0 || urlError !== null}
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

      {urlError ? (
        <ErrorText>
          Stock API URL: {urlError} Edit it in the Stock Fetcher (Ctrl+Shift+S).
        </ErrorText>
      ) : (
        fetchError && <ErrorText>{fetchError}</ErrorText>
      )}

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
        monthlyMatrix={active.monthlyMatrix}
        track={active.track}
        initialValue={active.portfolioValue}
        holdings={holdings}
        withdrawalStartYear={active.withdrawalStartYear}
        monthlyWithdrawal={active.monthlyWithdrawal}
        projectedGain={active.projectedGain}
        withdrawalStartYearB={other?.withdrawalStartYear}
        primaryWithdrawalLabel={activeKey}
        secondaryWithdrawalLabel={otherKey}
      />
    </PanelContainer>
  );
}
