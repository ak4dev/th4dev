/* ==================================================
 * Portfolio Panel
 * ================================================== */

import { useState } from "react";
import * as Icons from "@radix-ui/react-icons";
import { styled } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";
import {
  extractQuoteSymbol,
  extractStockPrice,
  fetchStockData,
  normalizeStockSymbol,
} from "../../common/helpers/stock-client";
import { computePortfolioProjection } from "../../common/helpers/portfolio-projection";
import type { PortfolioHolding } from "../../common/types/portfolio-types";
import type { LineGraphEntry } from "../../common/types/types";
import PortfolioProjectionChart from "./PortfolioProjectionChart";
import CapitalPreservationSchedule from "./CapitalPreservationSchedule";

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

const HoldingRow = styled("div", {
  display: "grid",
  gridTemplateColumns: "6rem 7.25rem minmax(8rem, 1fr) auto",
  gap: "8px",
  alignItems: "center",
});

const HeaderRow = styled("div", {
  display: "grid",
  gridTemplateColumns: "6rem 7.25rem minmax(8rem, 1fr) auto",
  gap: "8px",
  paddingBottom: "4px",
  borderBottom: "1px solid $comment",
});

const ColLabel = styled("span", {
  fontSize: "0.7rem",
  color: "$comment",
  fontWeight: 500,
});

const SymbolTag = styled("span", {
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "$cyan",
});

const NumberInput = styled("input", {
  ...compactModernInputStyles,
  width: "100%",
  maxWidth: "7.25rem",
  minWidth: 0,
  textAlign: "right",
});

const PriceDisplay = styled("span", {
  fontSize: "0.8rem",
  color: "$green",
  textAlign: "right",
});

const IconButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  color: "$comment",
  padding: "2px",
  "&:hover": { color: "$red" },
});

const Row = styled("div", {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
});

const ActionButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  backgroundColor: "$purple",
  color: "$background",
  padding: "6px 14px",
  borderRadius: 5,
  fontSize: "0.8rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
  "&:hover": { opacity: 0.85 },
  "&:disabled": { opacity: 0.4, cursor: "not-allowed" },
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

const ErrorText = styled("p", {
  color: "$red",
  fontSize: "0.75rem",
  margin: 0,
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
  ...compactModernInputStyles,
  width: 160,
  textAlign: "right",
  fontSize: "0.88rem",
  color: "$cyan",
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

interface PortfolioPanelProps {
  /** Holdings state (symbol + allocation + optional fetched price) */
  holdings: PortfolioHolding[];
  /** Setter for holdings */
  setHoldings: (holdings: PortfolioHolding[]) => void;
  /** API URL template with {symbol} placeholder */
  stockApiUrl: string;
  /**
    * Total portfolio value in USD, derived from investment calculator.
   */
  defaultPortfolioValue: number;
  /** Monthly withdrawal amount from the investment calculator */
  monthlyWithdrawal: number;
  /** Year offset at which withdrawals begin — forwarded to the preservation schedule */
  withdrawalStartYear: number;
  /** Number of years to project forward */
  yearsForward: number;
  /**
   * Growth matrix from the investment calculator — used to derive the
   * required stock price at each projected year (capital preservation schedule).
   */
  growthMatrix: LineGraphEntry[];
  /**
   * Optional Investment B withdrawal start year — shown as a second indicator
   * in the capital preservation schedule when advanced mode is active.
   */
  withdrawalStartYearB?: number;
  /** Optional Investment B growth matrix for the second withdrawal indicator */
  growthMatrixB?: LineGraphEntry[];
  /** Optional Investment B default portfolio value */
  defaultPortfolioValueB?: number;
  /** Optional Investment B monthly withdrawal */
  monthlyWithdrawalB?: number;
  /** Optional Investment B years of growth */
  yearsForwardB?: number;
}

/* ==================================================
 * Component
 * ================================================== */

export default function PortfolioPanel({
  holdings,
  setHoldings,
  stockApiUrl,
  defaultPortfolioValue,
  monthlyWithdrawal,
  withdrawalStartYear,
  yearsForward,
  growthMatrix,
  withdrawalStartYearB,
  growthMatrixB,
  defaultPortfolioValueB,
  monthlyWithdrawalB,
  yearsForwardB,
}: PortfolioPanelProps) {
  const hasB = !!growthMatrixB;
  const [selectedInvestment, setSelectedInvestment] = useState<"A" | "B">("A");

  // Reset to A if B becomes unavailable
  const activeInvestment = hasB ? selectedInvestment : "A";

  const activeDefaultPortfolioValue =
    activeInvestment === "B" && defaultPortfolioValueB != null
      ? defaultPortfolioValueB
      : defaultPortfolioValue;
  const activeMonthlyWithdrawal =
    activeInvestment === "B" && monthlyWithdrawalB != null
      ? monthlyWithdrawalB
      : monthlyWithdrawal;
  const activeYearsForward =
    activeInvestment === "B" && yearsForwardB != null
      ? yearsForwardB
      : yearsForward;

  // When B is selected, B's matrix is primary; A's is passed as secondary so
  // both withdrawal-start rows are highlighted in the preservation schedule.
  const activeGrowthMatrix =
    activeInvestment === "B" && growthMatrixB ? growthMatrixB : growthMatrix;
  const activeGrowthMatrixB =
    activeInvestment === "B" ? growthMatrix : growthMatrixB;

  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const activePortfolioValue = activeDefaultPortfolioValue;

  const updateAllocation = (symbol: string, pct: number) => {
    setHoldings(
      holdings.map((h) =>
        h.symbol === symbol ? { ...h, allocationPct: pct } : h,
      ),
    );
  };

  const removeHolding = (symbol: string) => {
    setHoldings(holdings.filter((h) => h.symbol !== symbol));
  };

  const handleFetchPrices = async () => {
    if (!holdings.length) return;
    setLoading(true);
    setFetchError(null);

    try {
      const symbols = holdings.map((h) => h.symbol);
      const results = await fetchStockData(stockApiUrl, symbols);

      const resultBySymbol = new Map(
        results.map((result) => {
          const responseSymbol =
            result.data != null ? extractQuoteSymbol(result.data) : undefined;
          return [
            normalizeStockSymbol(responseSymbol || result.symbol),
            result,
          ] as const;
        }),
      );

      const updated = holdings.map((h) => {
        const result = resultBySymbol.get(normalizeStockSymbol(h.symbol));
        if (!result || result.error || !result.data) return h;
        const price = extractStockPrice(result.data);
        return price !== undefined ? { ...h, currentPrice: price } : h;
      });

      setHoldings(updated);
    } catch (err) {
      setFetchError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const totalAllocation = holdings.reduce((s, h) => s + h.allocationPct, 0);
  const allocationValid = Math.abs(totalAllocation - 100) < 0.01;

  const holdingsWithPrice = holdings.filter(
    (h) => h.currentPrice != null && h.currentPrice > 0,
  );

  const projection =
    holdingsWithPrice.length > 0 && activePortfolioValue > 0
      ? computePortfolioProjection({
          holdings: holdingsWithPrice,
          totalPortfolioValue: activePortfolioValue,
          monthlyWithdrawal: activeMonthlyWithdrawal,
          yearsForward: activeYearsForward,
        })
      : {};

  const hasProjection = Object.keys(projection).length > 0;

  return (
    <Wrapper>
      <SectionTitleRow>
        <SectionTitle>Portfolio Capital Preservation</SectionTitle>
        {hasB && (
          <InvestmentToggleGroup>
            <InvestmentToggleButton
              active={activeInvestment === "A"}
              onClick={() => {
                setSelectedInvestment("A");
              }}
            >
              Investment A
            </InvestmentToggleButton>
            <InvestmentToggleButton
              active={activeInvestment === "B"}
              onClick={() => {
                setSelectedInvestment("B");
              }}
            >
              Investment B
            </InvestmentToggleButton>
          </InvestmentToggleGroup>
        )}
      </SectionTitleRow>

      {/* Portfolio total value override */}
      <PortfolioValueRow>
        <PortfolioLabel>Total Portfolio Value ($)</PortfolioLabel>
        <PortfolioValueValue aria-live="polite">
          {Math.max(0, activePortfolioValue).toLocaleString("en-US")}
        </PortfolioValueValue>
        <InfoText>
          Monthly withdrawal: ${activeMonthlyWithdrawal.toLocaleString()} ·
          Horizon: {activeYearsForward} yrs
        </InfoText>
      </PortfolioValueRow>

      {/* Holdings table */}
      {holdings.length > 0 ? (
        <HoldingsTable>
          <HeaderRow>
            <ColLabel>Symbol</ColLabel>
            <ColLabel style={{ textAlign: "right" }}>Allocation %</ColLabel>
            <ColLabel style={{ textAlign: "right" }}>Current Price</ColLabel>
            <ColLabel />
          </HeaderRow>
          {holdings.map((h) => (
            <HoldingRow key={h.symbol}>
              <SymbolTag>{h.symbol}</SymbolTag>
              <NumberInput
                type="text"
                inputMode="decimal"
                value={h.allocationPct || ""}
                onChange={(e) =>
                  updateAllocation(
                    h.symbol,
                    Math.min(
                      100,
                      parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0,
                    ),
                  )
                }
                placeholder="0"
              />
              <PriceDisplay>
                {h.currentPrice != null ? `$${h.currentPrice.toFixed(2)}` : "—"}
              </PriceDisplay>
              <IconButton
                onClick={() => removeHolding(h.symbol)}
                aria-label={`Remove ${h.symbol}`}
              >
                <Icons.Cross2Icon width={12} height={12} />
              </IconButton>
            </HoldingRow>
          ))}
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
          onClick={handleFetchPrices}
          disabled={loading || holdings.length === 0}
        >
          {loading ? "Fetching…" : "Fetch Current Prices"}
        </ActionButton>
        {holdings.length > 0 && (
          <AllocationSum valid={allocationValid}>
            Allocated: {totalAllocation.toFixed(1)}%{" "}
            {allocationValid ? "✓" : "(must equal 100%)"}
          </AllocationSum>
        )}
      </Row>

      {fetchError && <ErrorText>{fetchError}</ErrorText>}

      {/* Withdrawal-based projection chart */}
      {hasProjection && allocationValid ? (
        <PortfolioProjectionChart projection={projection} />
      ) : holdingsWithPrice.length > 0 && !allocationValid ? (
        <InfoText>
          Set allocations that sum to 100% to see the projection.
        </InfoText>
      ) : holdingsWithPrice.length === 0 && holdings.length > 0 ? (
        <InfoText>Fetch current prices to generate the projection.</InfoText>
      ) : null}

      {/* Capital preservation schedule — requires fetched prices */}
      <CapitalPreservationSchedule
        growthMatrix={activeGrowthMatrix}
        holdings={holdings}
        withdrawalStartYear={
          activeInvestment === "B"
            ? (withdrawalStartYearB ?? 0)
            : withdrawalStartYear
        }
        monthlyWithdrawal={activeMonthlyWithdrawal}
        withdrawalStartYearB={
          activeInvestment === "B" ? withdrawalStartYear : withdrawalStartYearB
        }
        growthMatrixB={activeGrowthMatrixB}
        primaryWithdrawalLabel={activeInvestment === "B" ? "B" : "A"}
        secondaryWithdrawalLabel={activeInvestment === "B" ? "A" : "B"}
      />
    </Wrapper>
  );
}
