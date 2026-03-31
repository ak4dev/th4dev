/* ==================================================
 * Main Application Component
 * ================================================== */

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { styled, themeClasses, keyframes } from "../stitches.config";
import { ThemeSelector } from "./components/ThemeSwitcher";
import StateIOPopover from "./components/sidebar/StateIOPopover";
import SubdomainRouter from "./components/SubdomainRouter";
import StockModal from "./components/StockModal";
import LandingReadme from "./components/LandingReadme";
import {
  DEFAULT_THEME,
  DEFAULT_INITIAL_AMOUNT,
  DEFAULT_PROJECTED_GAIN,
  DEFAULT_YEARS_OF_GROWTH,
  DEFAULT_MONTHLY_CONTRIBUTION,
  DEFAULT_MONTHLY_WITHDRAWAL,
  DEFAULT_WITHDRAWAL_START_YEAR,
  DEFAULT_INFLATION_RATE,
  DEFAULT_TARGET_VALUE,
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
  overflow: "auto",
});

const overlayShow = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const contentShow = keyframes({
  from: { opacity: 0, transform: "translate(-50%, -52%) scale(0.97)" },
  to: { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
});

const HelpOverlay = styled(Dialog.Overlay, {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.65)",
  animation: `${overlayShow} 150ms ease`,
  zIndex: 200,
});

const HelpContent = styled(Dialog.Content, {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(1160px, 95vw)",
  maxHeight: "90vh",
  overflowY: "auto",
  animation: `${contentShow} 150ms ease`,
  zIndex: 201,
  "&:focus": { outline: "none" },
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
    targetValueA: DEFAULT_TARGET_VALUE,
    targetValueB: DEFAULT_TARGET_VALUE,
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
    fees: false,
    monteCarlo: false,
    fire: false,
    scenarios: false,
  },
  stock: {
    apiUrl: DEFAULT_STOCK_API_URL,
    holdings: [],
  },
};

/* ==================================================
 * State Persistence (opt-in)
 * ================================================== */

const STORAGE_KEY = "th4_app_state";
/** Stores only the user's consent preference — not financial data */
const STORAGE_CONSENT_KEY = "th4_localstorage_enabled";

interface PersistedState {
  theme?: string;
  sliders?: Record<string, number>;
  inputs?: Record<string, string>;
  toggles?: TH4State["toggles"];
  stockApiUrl?: string;
  stockHoldings?: PortfolioHolding[];
}

function loadConsent(): boolean {
  try {
    return localStorage.getItem(STORAGE_CONSENT_KEY) === "true";
  } catch {
    return false;
  }
}

function saveConsent(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(STORAGE_CONSENT_KEY, "true");
    } else {
      localStorage.removeItem(STORAGE_CONSENT_KEY);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

function loadPersistedState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : {};
  } catch {
    return {};
  }
}

function savePersistedState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/* ==================================================
 * Origin normalisation
 *
 * If the app is loaded on a subdomain (e.g. f.local.dev), redirect to the
 * root domain with a ?p= query param so all localStorage lives under one
 * origin.  On localhost / bare IP addresses no redirect is performed.
 * ================================================== */

function getRootOriginAndPage(): { rootOrigin: string | null; page: string } {
  const { protocol, hostname, port, search } = window.location;
  const parts = hostname.split(".");

  // Read explicit page param first (e.g. ?p=f)
  const params = new URLSearchParams(search);
  const pageParam = params.get("p");

  // On localhost / bare IP there is no meaningful subdomain
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    !hostname.includes(".");

  if (isLocal) {
    return { rootOrigin: null, page: pageParam ?? hostname };
  }

  const knownPageSubdomains = ["f"];
  const subdomain = parts[0];
  const isPageSubdomain = knownPageSubdomains.includes(subdomain);

  if (isPageSubdomain) {
    const rootHost = parts.slice(1).join(".");
    const portSuffix = port ? `:${port}` : "";
    const rootOrigin = `${protocol}//${rootHost}${portSuffix}`;
    return { rootOrigin, page: subdomain };
  }

  return { rootOrigin: null, page: pageParam ?? subdomain };
}

const { rootOrigin, page: initialPage } = getRootOriginAndPage();

// Redirect subdomain visits to the root origin so localStorage is unified
if (rootOrigin) {
  window.location.replace(`${rootOrigin}?p=${initialPage}`);
}

/* ==================================================
 * Main Component
 * ================================================== */

/**
 * Main application component that manages investment calculator state
 * and provides theme switching and state persistence functionality
 */
export default function App() {
  // Consent is read once — it's the only thing always in localStorage
  const [localStorageEnabled, setLocalStorageEnabledRaw] =
    useState(loadConsent);

  // Hydrate from localStorage only when the user has opted in
  const persisted = localStorageEnabled ? loadPersistedState() : {};

  const [theme, setTheme] = useState(persisted.theme ?? defaultState.theme);
  const [sliders, setSliders] = useState(
    persisted.sliders ?? defaultState.sliders,
  );
  const [inputs, setInputs] = useState(persisted.inputs ?? defaultState.inputs);
  const [toggles, setToggles] = useState(
    persisted.toggles ?? defaultState.toggles,
  );
  const [stockApiUrl, setStockApiUrl] = useState(
    persisted.stockApiUrl ?? defaultState.stock!.apiUrl,
  );
  const [stockHoldings, setStockHoldings] = useState<PortfolioHolding[]>(
    persisted.stockHoldings ?? defaultState.stock!.holdings,
  );
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // activePage seeded from ?p= param or subdomain; subsequent nav is in-app
  const [activePage, setActivePage] = useState(initialPage);

  const setLocalStorageEnabled = (enabled: boolean) => {
    saveConsent(enabled);
    setLocalStorageEnabledRaw(enabled);
  };

  /** Apply theme class to document body */
  useEffect(() => {
    Object.values(themeClasses).forEach((cls) =>
      document.body.classList.remove(cls),
    );
    const cls = themeClasses[theme];
    if (cls) document.body.classList.add(cls);
  }, [theme]);

  /** Persist financial state when user has opted in */
  useEffect(() => {
    if (!localStorageEnabled) return;
    savePersistedState({
      theme,
      sliders,
      inputs,
      toggles,
      stockApiUrl,
      stockHoldings,
    });
  }, [
    localStorageEnabled,
    theme,
    sliders,
    inputs,
    toggles,
    stockApiUrl,
    stockHoldings,
  ]);

  /** Keyboard shortcuts */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault();
        setStockModalOpen((p) => !p);
      }
      if (e.ctrlKey && e.shiftKey && e.key === "H") {
        e.preventDefault();
        setHelpOpen((p) => !p);
      }
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setActivePage("f");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const setAppState = (state: TH4State): void => {
    if (state.theme) setTheme(state.theme);
    if (state.sliders) setSliders((prev) => ({ ...prev, ...state.sliders }));
    if (state.inputs) setInputs((prev) => ({ ...prev, ...state.inputs }));
    if (state.toggles) setToggles((prev) => ({ ...prev, ...state.toggles }));
    if (state.stock) {
      setStockApiUrl(state.stock.apiUrl);
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
          activePage={activePage}
          onNavigate={setActivePage}
          sliders={sliders}
          setSliders={setSliders}
          inputs={inputs}
          setInputs={setInputs}
          toggles={toggles}
          setToggles={setToggles}
          stockApiUrl={stockApiUrl}
          stockHoldings={stockHoldings}
          setStockHoldings={setStockHoldings}
          localStorageEnabled={localStorageEnabled}
          onLocalStorageToggle={setLocalStorageEnabled}
        />
      </Content>

      <Sidebar>
        <ThemeSelector activeTheme={theme} onThemeChange={setTheme} />
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

      <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
        <Dialog.Portal>
          <HelpOverlay />
          <HelpContent aria-describedby={undefined}>
            <Dialog.Title style={{ display: "none" }}>Help</Dialog.Title>
            <LandingReadme
              onNavigate={(page) => {
                setActivePage(page);
                setHelpOpen(false);
              }}
              localStorageEnabled={localStorageEnabled}
              onLocalStorageToggle={setLocalStorageEnabled}
            />
          </HelpContent>
        </Dialog.Portal>
      </Dialog.Root>
    </Container>
  );
}
