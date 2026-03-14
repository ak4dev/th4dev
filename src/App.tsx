/* ==================================================
 * Main Application Component
 * ================================================== */

import { useState, useEffect } from "react";
import { styled, themeClasses } from "../stitches.config";
import { ThemeSelector } from "./components/ThemeSwitcher";
import StateIOPopover from "./components/sidebar/StateIOPopover";
import SubdomainRouter from "./components/SubdomainRouter";
import StockModal from "./components/StockModal";
import {
  DEFAULT_THEME,
  DEFAULT_INITIAL_AMOUNT,
  DEFAULT_PROJECTED_GAIN,
  DEFAULT_YEARS_OF_GROWTH,
  DEFAULT_MONTHLY_CONTRIBUTION,
  DEFAULT_MONTHLY_WITHDRAWAL,
  DEFAULT_WITHDRAWAL_START_YEAR,
  DEFAULT_INFLATION_RATE,
} from "./common/constants/app-constants";
import type { TH4State } from "./common/types/types";
import type { PortfolioHolding } from "./common/types/portfolio-types";

export type { TH4State };

/* ==================================================
 * Styled Components
 * ================================================== */

const Container = styled("div", {
  display: "flex",
  height: "100vh",
  backgroundColor: "$background",
});

const Sidebar = styled("div", {
  width: 60,
  backgroundColor: "$currentLine",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "1rem 0",
});

const Content = styled("div", {
  flex: 1,
  padding: "1rem",
});

/* ==================================================
 * Default State
 * ================================================== */

const DEFAULT_STOCK_API_URL =
  "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey=demo";

const defaultState: TH4State = {
  theme: DEFAULT_THEME,
  sliders: {
    investmentA: DEFAULT_INITIAL_AMOUNT,
    investmentB: DEFAULT_INITIAL_AMOUNT,
    projectedGainA: DEFAULT_PROJECTED_GAIN,
    projectedGainB: DEFAULT_PROJECTED_GAIN,
    yearsOfGrowthA: DEFAULT_YEARS_OF_GROWTH,
    yearsOfGrowthB: DEFAULT_YEARS_OF_GROWTH,
    monthlyContributionA: DEFAULT_MONTHLY_CONTRIBUTION,
    monthlyContributionB: DEFAULT_MONTHLY_CONTRIBUTION,
    monthlyWithdrawalA: DEFAULT_MONTHLY_WITHDRAWAL,
    monthlyWithdrawalB: DEFAULT_MONTHLY_WITHDRAWAL,
    withdrawalStartYearA: DEFAULT_WITHDRAWAL_START_YEAR,
    withdrawalStartYearB: DEFAULT_WITHDRAWAL_START_YEAR,
    yearlyInflation: DEFAULT_INFLATION_RATE,
  },
  inputs: {
    currentAmountA: String(DEFAULT_INITIAL_AMOUNT),
    currentAmountB: String(DEFAULT_INITIAL_AMOUNT),
  },
  toggles: {
    advanced: false,
    rollover: false,
    showInflation: false,
    portfolio: false,
  },
  stock: {
    apiUrl: DEFAULT_STOCK_API_URL,
    holdings: [{ symbol: "IBM", allocationPct: 100 }],
  },
};

/* ==================================================
 * Main Component
 * ================================================== */

/**
 * Main application component that manages investment calculator state
 * and provides theme switching and state persistence functionality
 */
export default function App() {
  const [theme, setTheme] = useState(defaultState.theme);
  const [sliders, setSliders] = useState(defaultState.sliders);
  const [inputs, setInputs] = useState(defaultState.inputs);
  const [toggles, setToggles] = useState(defaultState.toggles);
  const [stockApiUrl, setStockApiUrl] = useState(defaultState.stock!.apiUrl);
  const [stockHoldings, setStockHoldings] = useState<PortfolioHolding[]>(
    defaultState.stock!.holdings,
  );
  const [stockModalOpen, setStockModalOpen] = useState(false);

  /**
   * Apply theme changes to document body
   */
  useEffect(() => {
    // Remove all existing theme classes
    Object.values(themeClasses).forEach((cls) =>
      document.body.classList.remove(cls),
    );

    // Apply current theme class
    const cls = themeClasses[theme];
    if (cls) {
      document.body.classList.add(cls);
    }
  }, [theme]);

  /**
   * Ctrl+Shift+S (all OSes) opens the stock data modal
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault();
        setStockModalOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /**
   * Extract subdomain from current hostname for routing
   */
  const hostname = window.location.hostname;
  const subdomain = hostname.split(".")[0];

  /**
   * Update application state from imported data
   */
  const setAppState = (state: TH4State): void => {
    if (state.theme) {
      setTheme(state.theme);
    }
    if (state.sliders) {
      setSliders((prev) => ({ ...prev, ...state.sliders }));
    }
    if (state.inputs) {
      setInputs((prev) => ({ ...prev, ...state.inputs }));
    }
    if (state.toggles) {
      setToggles((prev) => ({ ...prev, ...state.toggles }));
    }
    if (state.stock) {
      setStockApiUrl(state.stock.apiUrl);
      // Support old exports that used `symbols: string[]` instead of holdings
      const legacySymbols = (state.stock as unknown as { symbols?: string[] })
        .symbols;
      if (state.stock.holdings) {
        setStockHoldings(state.stock.holdings);
      } else if (legacySymbols) {
        setStockHoldings(
          legacySymbols.map((s) => ({ symbol: s, allocationPct: 0 })),
        );
      }
    }
  };

  return (
    <Container>
      <Content>
        <SubdomainRouter
          subdomain={subdomain}
          sliders={sliders}
          setSliders={setSliders}
          inputs={inputs}
          setInputs={setInputs}
          toggles={toggles}
          setToggles={setToggles}
          stockApiUrl={stockApiUrl}
          stockHoldings={stockHoldings}
          setStockHoldings={setStockHoldings}
        />
      </Content>

      <Sidebar>
        <ThemeSelector onThemeChange={setTheme} />
        <StateIOPopover
          getState={() => ({
            theme,
            sliders,
            inputs,
            toggles,
            stock: { apiUrl: stockApiUrl, holdings: stockHoldings },
          })}
          setState={setAppState}
        />
      </Sidebar>

      <StockModal
        open={stockModalOpen}
        onOpenChange={setStockModalOpen}
        apiUrl={stockApiUrl}
        setApiUrl={setStockApiUrl}
        holdings={stockHoldings}
        setHoldings={setStockHoldings}
      />
    </Container>
  );
}
