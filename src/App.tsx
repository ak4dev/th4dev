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
import { DEFAULT_STATE, normalizeState } from "./common/helpers/state-manager";
import type { TH4State } from "./common/types/types";
import type { PortfolioHolding } from "./common/types/portfolio-types";
import type { BudgetItem } from "./common/helpers/budget-manager";
import type { ScenarioSnapshot } from "./common/helpers/scenario-manager";

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
  animation: `${String(overlayShow)} 150ms ease`,
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
  animation: `${String(contentShow)} 150ms ease`,
  zIndex: 201,
  "&:focus": { outline: "none" },
});

/* ==================================================
 * Default State — imported from state-manager module
 * ================================================== */

const defaultState = DEFAULT_STATE;

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
  budgetItems?: BudgetItem[];
  scenarios?: ScenarioSnapshot[];
  activePage?: string;
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
      // Clean up legacy standalone keys
      localStorage.removeItem("th4_budget");
      localStorage.removeItem("th4_scenarios");
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

// Clean up the ?p= query param after reading so the URL stays tidy
if (!rootOrigin && new URLSearchParams(window.location.search).has("p")) {
  const url = new URL(window.location.href);
  url.searchParams.delete("p");
  window.history.replaceState(null, "", url.toString());
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
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>(
    persisted.budgetItems ?? [],
  );
  const [scenarios, setScenarios] = useState<ScenarioSnapshot[]>(
    persisted.scenarios ?? [],
  );
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // activePage seeded from persisted state, ?p= param, or subdomain
  const [activePage, setActivePage] = useState(
    persisted.activePage ?? initialPage,
  );

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
      budgetItems,
      scenarios,
      activePage,
    });
  }, [
    localStorageEnabled,
    theme,
    sliders,
    inputs,
    toggles,
    stockApiUrl,
    stockHoldings,
    budgetItems,
    scenarios,
    activePage,
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

  /**
   * Applies an imported or loaded TH4State to all React state setters.
   * Uses normalizeState() to fill any missing fields with defaults,
   * then does a full replacement (not merge) for every state variable.
   */
  const setAppState = (raw: TH4State): void => {
    const state = normalizeState(raw);
    setTheme(state.theme);
    setSliders(state.sliders);
    setInputs(state.inputs);
    setToggles(state.toggles);
    setBudgetItems(state.budgetItems ?? []);
    setScenarios(state.scenarios ?? []);
    setActivePage(state.activePage ?? "f");
    setStockApiUrl(state.stock!.apiUrl);
    setStockHoldings(state.stock!.holdings);
  };

  return (
    <Container>
      <Content>
        <SubdomainRouter
          activePage={activePage}
          onNavigate={setActivePage}
          theme={theme}
          setTheme={setTheme}
          sliders={sliders}
          setSliders={setSliders}
          inputs={inputs}
          setInputs={setInputs}
          toggles={toggles}
          setToggles={setToggles}
          stockApiUrl={stockApiUrl}
          stockHoldings={stockHoldings}
          setStockHoldings={setStockHoldings}
          budgetItems={budgetItems}
          setBudgetItems={setBudgetItems}
          scenarios={scenarios}
          setScenarios={setScenarios}
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
            budgetItems,
            scenarios,
            activePage,
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
