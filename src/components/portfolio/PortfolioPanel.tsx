/* ==================================================
 * Portfolio Panel
 * ================================================== */

import { useState } from "react";
import * as Icons from "@radix-ui/react-icons";
import { styled } from "../../../stitches.config";
import { fetchStockData } from "../../common/helpers/stock-client";
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
  gridTemplateColumns: "6rem 1fr 1fr auto",
  gap: "8px",
  alignItems: "center",
});

const HeaderRow = styled("div", {
  display: "grid",
  gridTemplateColumns: "6rem 1fr 1fr auto",
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
  all: "unset",
  width: "100%",
  boxSizing: "border-box",
  backgroundColor: "$background",
  color: "$foreground",
  border: "1px solid transparent",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: "0.8rem",
  textAlign: "right",
  "&:focus": { borderColor: "$purple" },
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

const PortfolioLabel = styled("label", {
  fontSize: "0.75rem",
  color: "$comment",
  whiteSpace: "nowrap",
});

const PortfolioValueInput = styled("input", {
  all: "unset",
  backgroundColor: "$background",
  color: "$foreground",
  border: "1px solid transparent",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: "0.875rem",
  width: 140,
  "&:focus": { borderColor: "$purple" },
});

/* ==================================================
 * Props
 * ================================================== */

interface PortfolioPanelProps {
  /** Holdings state (symbol + allocation + optional fetched price) */
  holdings: PortfolioHolding[];
  /** Setter for holdings */
  setHoldings: (holdings: PortfolioHolding[]) => void;
  /** API URL template with {symbol} placeholder */
  stockApiUrl: string;
  /**
   * Default total portfolio value in USD, derived from investment calculator.
   * The user can override this inline.
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
}

/* ==================================================
 * Helpers
 * ================================================== */

/**
 * Extracts a price from an Alpha Vantage GLOBAL_QUOTE response or any object
 * that contains a numeric field whose key contains "price" (case-insensitive).
 */
function extractPrice(data: unknown): number | undefined {
  if (typeof data !== "object" || data === null) return undefined;

  // Alpha Vantage: { "Global Quote": { "05. price": "123.45", ... } }
  const globalQuote = (data as Record<string, unknown>)["Global Quote"];
  if (typeof globalQuote === "object" && globalQuote !== null) {
    const priceKey = Object.keys(globalQuote as object).find((k) =>
      k.toLowerCase().includes("price"),
    );
    if (priceKey) {
      const val = parseFloat(
        String((globalQuote as Record<string, unknown>)[priceKey]),
      );
      if (!isNaN(val)) return val;
    }
  }

  // Fallback: search top-level keys for a "price" field
  const topKey = Object.keys(data as object).find((k) =>
    k.toLowerCase().includes("price"),
  );
  if (topKey) {
    const val = parseFloat(String((data as Record<string, unknown>)[topKey]));
    if (!isNaN(val)) return val;
  }

  return undefined;
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
}: PortfolioPanelProps) {
  const [portfolioValue, setPortfolioValue] = useState<number>(
    defaultPortfolioValue,
  );
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Keep portfolioValue in sync when the calculator's total changes
  // (only if the user hasn't manually overridden it)
  // We use a simple comparison: if portfolioValue is still at defaultPortfolioValue,
  // update it. We achieve this by only showing the default if portfolioValue === 0.

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

      const updated = holdings.map((h) => {
        const result = results.find((r) => r.symbol === h.symbol);
        if (!result || result.error || !result.data) return h;
        const price = extractPrice(result.data);
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
    holdingsWithPrice.length > 0 && portfolioValue > 0
      ? computePortfolioProjection({
          holdings: holdingsWithPrice,
          totalPortfolioValue: portfolioValue,
          monthlyWithdrawal,
          yearsForward,
        })
      : {};

  const hasProjection = Object.keys(projection).length > 0;

  return (
    <Wrapper>
      <SectionTitle>Portfolio Capital Preservation</SectionTitle>

      {/* Portfolio total value override */}
      <PortfolioValueRow>
        <PortfolioLabel htmlFor="portfolio-value">
          Total Portfolio Value ($)
        </PortfolioLabel>
        <PortfolioValueInput
          id="portfolio-value"
          type="number"
          min={0}
          value={portfolioValue || ""}
          onChange={(e) => setPortfolioValue(parseFloat(e.target.value) || 0)}
          placeholder={String(defaultPortfolioValue)}
        />
        <InfoText>
          Monthly withdrawal: ${monthlyWithdrawal.toLocaleString()} · Horizon:{" "}
          {yearsForward} yrs
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
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={h.allocationPct || ""}
                onChange={(e) =>
                  updateAllocation(
                    h.symbol,
                    Math.min(100, parseFloat(e.target.value) || 0),
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
        growthMatrix={growthMatrix}
        holdings={holdings}
        withdrawalStartYear={withdrawalStartYear}
        monthlyWithdrawal={monthlyWithdrawal}
      />
    </Wrapper>
  );
}
