/* ==================================================
 * Stock Data Modal
 * ================================================== */

import { useState, type Dispatch, type SetStateAction } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Icons from "@radix-ui/react-icons";
import { styled } from "../../stitches.config";
import { compactModernInputStyles } from "../common/constants/input-styles";
import { normalizeStockSymbol } from "../common/helpers/stock-client";
import type { PortfolioHolding } from "../common/types/portfolio-types";
import { useFetchPrices } from "./portfolio/useFetchPrices";
import {
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogLabel,
  DialogInput,
  DialogCloseButton,
  ActionButton,
  SecondaryButton,
  IconButton,
  ErrorText,
} from "./ui/primitives";

/* ==================================================
 * Styled Components
 * ================================================== */

const Row = styled("div", {
  display: "flex",
  gap: "0.5rem",
  alignItems: "center",
  marginBottom: "0.75rem",
});

const TagList = styled("div", {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
  marginBottom: "0.75rem",
});

const Tag = styled("span", {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  backgroundColor: "$currentLine",
  color: "$foreground",
  borderRadius: 4,
  padding: "0.25rem 0.5rem",
  fontSize: "0.8rem",
  fontWeight: 500,
});

const Results = styled("pre", {
  backgroundColor: "$currentLine",
  color: "$foreground",
  borderRadius: 5,
  padding: "0.75rem",
  fontSize: "0.75rem",
  maxHeight: 260,
  overflowY: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  margin: 0,
});

const StartPriceTable = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  marginBottom: "1rem",
});

const StartPriceRow = styled("div", {
  display: "grid",
  gridTemplateColumns: "5rem 1fr",
  gap: "0.5rem",
  alignItems: "center",
});

const SymbolLabel = styled("span", {
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "$cyan",
});

const SmallInput = styled("input", {
  ...compactModernInputStyles,
  borderRadius: 5,
  padding: "0.3rem 0.5rem",
  width: "100%",
});

const Hint = styled("p", {
  fontSize: "0.7rem",
  color: "$comment",
  margin: "-0.75rem 0 1rem",
});

/* ==================================================
 * Component
 * ================================================== */

interface StockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  /** Portfolio holdings — symbols are derived from these */
  holdings: PortfolioHolding[];
  setHoldings: Dispatch<SetStateAction<PortfolioHolding[]>>;
}

export default function StockModal({
  open,
  onOpenChange,
  apiUrl,
  setApiUrl,
  holdings,
  setHoldings,
}: StockModalProps) {
  const [addInput, setAddInput] = useState("");
  const [results, setResults] = useState<string | null>(null);
  const { fetchPrices, loading, error } = useFetchPrices(apiUrl, setHoldings);

  const symbols = holdings.map((h) => h.symbol);

  const addSymbols = () => {
    const incoming = [
      ...new Set(
        addInput
          .split(",")
          .map((s) => normalizeStockSymbol(s))
          .filter(Boolean),
      ),
    ];
    if (incoming.length) {
      setHoldings((prev) => {
        const known = new Set(prev.map((h) => h.symbol));
        const fresh = incoming.filter((s) => !known.has(s));
        return fresh.length
          ? [...prev, ...fresh.map((symbol) => ({ symbol, allocationPct: 0 }))]
          : prev;
      });
    }
    setAddInput("");
  };

  const removeSymbol = (symbol: string) =>
    setHoldings((prev) => prev.filter((h) => h.symbol !== symbol));

  // Editing a start price resets the capital-preservation baseline to today
  const setStartPrice = (symbol: string, raw: string) => {
    const price = parseFloat(raw);
    const cleared = Number.isNaN(price);
    setHoldings((prev) =>
      prev.map((h) =>
        h.symbol === symbol
          ? {
              ...h,
              startPrice: cleared ? undefined : price,
              projectionStartDate: cleared
                ? undefined
                : new Date().toISOString(),
            }
          : h,
      ),
    );
  };

  const handleFetch = async () => {
    setResults(null);
    const data = await fetchPrices(symbols);
    if (data.length) setResults(JSON.stringify(data, null, 2));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <DialogOverlay />
        <DialogContent>
          <DialogCloseButton aria-label="Close">
            <Icons.Cross2Icon />
          </DialogCloseButton>

          <DialogTitle>Stock Data Fetcher</DialogTitle>

          <DialogLabel htmlFor="stock-api-url">
            API URL{" "}
            <span style={{ opacity: 0.6 }}>
              (use {"{symbol}"} as placeholder)
            </span>
          </DialogLabel>
          <DialogInput
            id="stock-api-url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            spellCheck={false}
          />
          <Hint>
            Free key at alphavantage.co · Replace <code>demo</code> with your
            key for live data
          </Hint>

          <DialogLabel>Symbols</DialogLabel>
          {symbols.length > 0 && (
            <TagList>
              {symbols.map((sym) => (
                <Tag key={sym}>
                  {sym}
                  <IconButton
                    onClick={() => removeSymbol(sym)}
                    aria-label={`Remove ${sym}`}
                  >
                    <Icons.Cross2Icon width={10} height={10} />
                  </IconButton>
                </Tag>
              ))}
            </TagList>
          )}
          <Row>
            <DialogInput
              css={{ marginBottom: 0, flex: 1 }}
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              placeholder="AAPL, MSFT, GOOG…"
              aria-label="Symbols to add"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSymbols();
                }
              }}
            />
            <SecondaryButton onClick={addSymbols}>Add</SecondaryButton>
            <ActionButton
              onClick={() => void handleFetch()}
              disabled={loading || symbols.length === 0}
            >
              {loading ? "Fetching…" : "Fetch"}
            </ActionButton>
          </Row>

          {error && (
            <ErrorText css={{ margin: "0 0 0.75rem" }}>{error}</ErrorText>
          )}

          {/* Editable projection start prices */}
          {holdings.length > 0 && (
            <>
              <DialogLabel>Projection Start Prices</DialogLabel>
              <Hint>
                Autofilled on first fetch and locked. Edit here to reset the
                capital-preservation baseline to today.
              </Hint>
              <StartPriceTable>
                {holdings.map((h) => (
                  <StartPriceRow key={h.symbol}>
                    <SymbolLabel>{h.symbol}</SymbolLabel>
                    <SmallInput
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label={`${h.symbol} projection start price`}
                      value={h.startPrice ?? ""}
                      onChange={(e) => setStartPrice(h.symbol, e.target.value)}
                      placeholder="—"
                    />
                  </StartPriceRow>
                ))}
              </StartPriceTable>
            </>
          )}

          {results && <Results>{results}</Results>}
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
