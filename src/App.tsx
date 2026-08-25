/* ==================================================
 * Main Application Component
 * ================================================== */

import { useState, useEffect, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { styled, themeClasses } from "../stitches.config";
import { ThemeSelector } from "./components/ThemeSwitcher";
import StateIOPopover from "./components/sidebar/StateIOPopover";
import SubdomainRouter from "./components/SubdomainRouter";
import StockModal from "./components/StockModal";
import LandingReadme from "./components/LandingReadme";
import { DialogContent, DialogOverlay } from "./components/ui/primitives";
import {
  DEFAULT_STATE,
  isValidTH4State,
  normalizeState,
} from "./common/helpers/state-manager";
import type { NormalizedState } from "./common/helpers/state-manager";
import type { TH4State } from "./common/types/types";

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

// The help dialog sits above the stock modal's layer
const HelpOverlay = styled(DialogOverlay, {
  backgroundColor: "rgba(0,0,0,0.65)",
  zIndex: 200,
});

const HelpContent = styled(DialogContent, { zIndex: 201 });

/* ==================================================
 * State Persistence (opt-in)
 * ================================================== */

const STORAGE_KEY = "th4_app_state";
/** Stores only the user's consent preference — not financial data */
const STORAGE_CONSENT_KEY = "th4_localstorage_enabled";
/** Standalone keys written by older builds before persistence was opt-in */
const LEGACY_KEYS = ["th4_budget", "th4_scenarios"];

/** Removes every key this app may have written, current and legacy */
function purgeStoredData(): void {
  for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) localStorage.removeItem(key);
}

function loadConsent(): boolean {
  try {
    const enabled = localStorage.getItem(STORAGE_CONSENT_KEY) === "true";
    // Without opt-in nothing may remain in storage, including pre-consent legacy data
    if (!enabled) purgeStoredData();
    return enabled;
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
      purgeStoredData();
    }
  } catch {
    // ignore
  }
}

/**
 * Hydrates the persisted TH4State through the same guard and normaliser as
 * a file import, so stale or corrupt entries fall back to defaults.
 * `defaultPage` fills in for records that predate activePage.
 */
function loadPersistedState(defaultPage: string): NormalizedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Older builds persisted { stockApiUrl, stockHoldings } instead of { stock }
    const candidate =
      parsed["stock"] === undefined &&
      (parsed["stockApiUrl"] !== undefined ||
        parsed["stockHoldings"] !== undefined)
        ? {
            ...parsed,
            stock: {
              apiUrl: parsed["stockApiUrl"],
              holdings: parsed["stockHoldings"],
            },
          }
        : parsed;
    if (!isValidTH4State(candidate)) return null;
    return normalizeState({
      ...candidate,
      activePage: candidate.activePage ?? defaultPage,
    });
  } catch {
    return null;
  }
}

function savePersistedState(state: TH4State): void {
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

/**
 * `explicitPage` is a page the URL asked for (?p= or a page subdomain) and
 * takes priority over a remembered page; `defaultPage` is the hostname
 * fallback used when neither exists.
 */
function getRootOriginAndPage(): {
  rootOrigin: string | null;
  explicitPage: string | null;
  defaultPage: string;
} {
  const { protocol, hostname, port, search } = window.location;
  const parts = hostname.split(".");
  // An empty ?p= is not an explicit page — let the remembered page win
  const pageParam = new URLSearchParams(search).get("p") || null;

  // On localhost / bare IP there is no meaningful subdomain
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    !hostname.includes(".");

  if (isLocal) {
    return { rootOrigin: null, explicitPage: pageParam, defaultPage: hostname };
  }

  const knownPageSubdomains = ["f"];
  const subdomain = parts[0];

  if (knownPageSubdomains.includes(subdomain)) {
    const rootHost = parts.slice(1).join(".");
    const portSuffix = port ? `:${port}` : "";
    return {
      rootOrigin: `${protocol}//${rootHost}${portSuffix}`,
      explicitPage: subdomain,
      defaultPage: subdomain,
    };
  }

  return { rootOrigin: null, explicitPage: pageParam, defaultPage: subdomain };
}

const { rootOrigin, explicitPage, defaultPage } = getRootOriginAndPage();

// Redirect subdomain visits to the root origin so localStorage is unified
if (rootOrigin) {
  window.location.replace(`${rootOrigin}?p=${explicitPage ?? defaultPage}`);
}

// Clean up the ?p= query param after reading so the URL stays tidy
if (!rootOrigin) {
  const url = new URL(window.location.href);
  if (url.searchParams.has("p")) {
    url.searchParams.delete("p");
    window.history.replaceState(null, "", url.toString());
  }
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

  // Hydrate once, only when the user has opted in
  const [initial] = useState<NormalizedState>(
    () =>
      (localStorageEnabled && loadPersistedState(defaultPage)) || {
        ...DEFAULT_STATE,
        activePage: defaultPage,
      },
  );

  const [theme, setTheme] = useState(initial.theme);
  const [sliders, setSliders] = useState(initial.sliders);
  const [inputs, setInputs] = useState(initial.inputs);
  const [toggles, setToggles] = useState(initial.toggles);
  const [stockApiUrl, setStockApiUrl] = useState(initial.stock.apiUrl);
  const [stockHoldings, setStockHoldings] = useState(initial.stock.holdings);
  const [budgetItems, setBudgetItems] = useState(initial.budgetItems);
  const [scenarios, setScenarios] = useState(initial.scenarios);
  // An explicit ?p=/subdomain page wins over the remembered page
  const [activePage, setActivePage] = useState(
    explicitPage ?? initial.activePage,
  );
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const setLocalStorageEnabled = (enabled: boolean) => {
    saveConsent(enabled);
    setLocalStorageEnabledRaw(enabled);
  };

  const appState = useMemo<TH4State>(
    () => ({
      theme,
      sliders,
      inputs,
      toggles,
      stock: { apiUrl: stockApiUrl, holdings: stockHoldings },
      budgetItems,
      scenarios,
      activePage,
    }),
    [
      theme,
      sliders,
      inputs,
      toggles,
      stockApiUrl,
      stockHoldings,
      budgetItems,
      scenarios,
      activePage,
    ],
  );

  /** Apply theme class to document body */
  useEffect(() => {
    Object.values(themeClasses).forEach((cls) =>
      document.body.classList.remove(cls),
    );
    const cls = themeClasses[theme];
    if (cls) document.body.classList.add(cls);
  }, [theme]);

  /** Persist financial state when user has opted in; re-check the stored consent in case another tab revoked it */
  useEffect(() => {
    if (!localStorageEnabled || !loadConsent()) return;
    savePersistedState(appState);
  }, [localStorageEnabled, appState]);

  /** Stop persisting when consent is revoked (or storage cleared) from another tab */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if ((e.key === STORAGE_CONSENT_KEY || e.key === null) && !loadConsent())
        setLocalStorageEnabledRaw(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
    setStockApiUrl(state.stock.apiUrl);
    setStockHoldings(state.stock.holdings);
    setBudgetItems(state.budgetItems);
    setScenarios(state.scenarios);
    setActivePage(state.activePage);
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
        <StateIOPopover getState={() => appState} setState={setAppState} />
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
          <HelpContent size="lg" aria-describedby={undefined}>
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
