/* ==================================================
 * Stock Data Modal
 * ================================================== */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Icons from "@radix-ui/react-icons";
import { styled, keyframes } from "../../stitches.config";
import { compactModernInputStyles } from "../common/constants/input-styles";
import {
  extractQuoteSymbol,
  extractStockPrice,
  fetchStockData,
  normalizeStockSymbol,
} from "../common/helpers/stock-client";
import type { PortfolioHolding } from "../common/types/portfolio-types";

/* ==================================================
 * Animations
 * ================================================== */

const overlayShow = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const contentShow = keyframes({
  from: { opacity: 0, transform: "translate(-50%, -52%) scale(0.96)" },
  to: { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
});

/* ==================================================
 * Styled Components
 * ================================================== */

const Overlay = styled(Dialog.Overlay, {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  animation: `${overlayShow} 150ms ease`,
  zIndex: 100,
});

const Content = styled(Dialog.Content, {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(560px, 90vw)",
  backgroundColor: "$background",
  border: "1px solid $currentLine",
  borderRadius: 8,
  padding: "1.5rem",
  animation: `${contentShow} 150ms ease`,
  zIndex: 101,
  "&:focus": { outline: "none" },
});

const Title = styled(Dialog.Title, {
  margin: 0,
  marginBottom: "1.25rem",
  fontSize: "1rem",
  fontWeight: 600,
  color: "$foreground",
});

const Label = styled("label", {
  display: "block",
  fontSize: "0.75rem",
  color: "$comment",
  marginBottom: "0.25rem",
  userSelect: "none",
});

const Input = styled("input", {
  ...compactModernInputStyles,
  borderRadius: 7,
  padding: "0.5rem 0.7rem",
  marginBottom: "1rem",
});

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

const IconButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  color: "$comment",
  "&:hover": { color: "$red" },
});

const ActionButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  backgroundColor: "$purple",
  color: "$background",
  padding: "0.5rem 1rem",
  borderRadius: 5,
  fontSize: "0.875rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
  "&:hover": { opacity: 0.85 },
  "&:disabled": { opacity: 0.4, cursor: "not-allowed" },
});

const SecondaryButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  backgroundColor: "$currentLine",
  color: "$foreground",
  padding: "0.5rem 0.75rem",
  borderRadius: 5,
  fontSize: "0.875rem",
  whiteSpace: "nowrap",
  "&:hover": { opacity: 0.85 },
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

const ErrorText = styled("p", {
  color: "$red",
  fontSize: "0.75rem",
  margin: "0 0 0.75rem",
});

const CloseButton = styled(Dialog.Close, {
  all: "unset",
  position: "absolute",
  top: "0.75rem",
  right: "0.75rem",
  cursor: "pointer",
  color: "$comment",
  display: "flex",
  "&:hover": { color: "$foreground" },
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
  setHoldings: (holdings: PortfolioHolding[]) => void;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbols = holdings.map((h) => h.symbol);

  const addSymbols = () => {
    const incoming = addInput
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s && !symbols.includes(s));
    if (incoming.length) {
      setHoldings([
        ...holdings,
        ...incoming.map((s) => ({ symbol: s, allocationPct: 0 })),
      ]);
    }
    setAddInput("");
  };

  const removeSymbol = (symbol: string) =>
    setHoldings(holdings.filter((h) => h.symbol !== symbol));

  const handleFetch = async () => {
    if (!symbols.length) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const data = await fetchStockData(apiUrl, symbols);
      const resultBySymbol = new Map(
        data.map((result) => {
          const responseSymbol =
            result.data != null ? extractQuoteSymbol(result.data) : undefined;
          return [
            normalizeStockSymbol(responseSymbol || result.symbol),
            result,
          ] as const;
        }),
      );

      setHoldings(
        holdings.map((holding) => {
          const result = resultBySymbol.get(normalizeStockSymbol(holding.symbol));
          if (!result || result.error || !result.data) return holding;

          const price = extractStockPrice(result.data);
          return price !== undefined
            ? { ...holding, currentPrice: price }
            : holding;
        }),
      );

      setResults(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Overlay />
        <Content>
          <CloseButton aria-label="Close">
            <Icons.Cross2Icon />
          </CloseButton>

          <Title>Stock Data Fetcher</Title>

          <Label htmlFor="stock-api-url">
            API URL{" "}
            <span style={{ opacity: 0.6 }}>
              (use {"{symbol}"} as placeholder)
            </span>
          </Label>
          <Input
            id="stock-api-url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            spellCheck={false}
          />
          <Hint>
            Free key at alphavantage.co · Replace <code>demo</code> with your
            key for live data
          </Hint>

          <Label>Symbols</Label>
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
            <Input
              css={{ marginBottom: 0, flex: 1 }}
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              placeholder="AAPL, MSFT, GOOG…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSymbols();
                }
              }}
            />
            <SecondaryButton onClick={addSymbols}>Add</SecondaryButton>
            <ActionButton
              onClick={handleFetch}
              disabled={loading || symbols.length === 0}
            >
              {loading ? "Fetching…" : "Fetch"}
            </ActionButton>
          </Row>

          {error && <ErrorText>{error}</ErrorText>}
          {results && <Results>{results}</Results>}
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
