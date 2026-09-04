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
import { DEFAULT_STATE, normalizeState } from "./common/helpers/state-manager";
import { scenarioLoadedState } from "./common/helpers/state-load";
import {
  STORAGE_CONSENT_KEY,
  createPersistScheduler,
  loadConsent,
  loadPersistedState,
  saveConsent,
  savePersistedState,
} from "./common/helpers/persistence";
import type { NormalizedState } from "./common/helpers/state-manager";
import type { PortfolioHolding } from "./common/types/portfolio-types";
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
 * Types
 * ================================================== */

/**
 * The one overlay showing, if any.  Both are modal Radix dialogs with their
 * own focus trap, and help paints above the stock modal, so two independent
 * booleans let a keyboard user end up typing into a dialog hidden underneath
 * the other one.  A single value makes "at most one" structural.
 */
type Overlay = "none" | "stock" | "help";

/**
 * The state a scenario snapshot carries: the running state minus the
 * configuration around it.  Written as a subset of NormalizedState so the
 * session state below can be spread out of it rather than listed twice.
 */
type PlanSnapshot = Pick<
  NormalizedState,
  "theme" | "sliders" | "inputs" | "toggles" | "budgetItems"
> & { stock: { holdings: PortfolioHolding[] } };

interface AppProps {
  /**
   * A page the URL asked for (?p= or a page subdomain).  It wins over the
   * remembered page.  Resolved in main.tsx, before render.
   */
  explicitPage: string | null;
  /** The hostname fallback used when neither the URL nor storage names a page */
  defaultPage: string;
}

/* ==================================================
 * Main Component
 * ================================================== */

/**
 * Main application component that manages investment calculator state
 * and provides theme switching and state persistence functionality
 */
export default function App({ explicitPage, defaultPage }: AppProps) {
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
  const [overlay, setOverlay] = useState<Overlay>("none");

  /**
   * Coalesces a burst of state changes into one write.  Created through a
   * lazy useState initialiser so it survives every re-render with its queue
   * intact; consent is re-read at write time, in case another tab revoked it.
   */
  const [persist] = useState(() =>
    createPersistScheduler<TH4State>({
      write: (state) => {
        savePersistedState(state);
      },
      isAllowed: loadConsent,
    }),
  );

  /** Opens `kind`, or closes it only if it is the overlay currently showing */
  const setOverlayOpen = (kind: Exclude<Overlay, "none">, open: boolean) => {
    setOverlay((current) =>
      open ? kind : current === kind ? "none" : current,
    );
  };

  const setLocalStorageEnabled = (enabled: boolean) => {
    // Drop anything queued before revoking, or one last write lands after the purge
    if (!enabled) persist.cancel();
    saveConsent(enabled);
    setLocalStorageEnabledRaw(enabled);
  };

  /**
   * The PLAN: what a scenario snapshot carries, and nothing around it.
   *
   * Holdings only, no endpoint: the stock API URL is app configuration rather
   * than plan data, and snapshotting it copied the user's key into every
   * scenario (and into every export that carried them).
   *
   * App builds this, not the calculator. The calculator used to assemble its
   * own copy of this shape beside its own copy of the scenario-load path,
   * and the two copies had already drifted from the ones here.
   */
  const planState = useMemo<PlanSnapshot>(
    () => ({
      theme,
      sliders,
      inputs,
      toggles,
      stock: { holdings: stockHoldings },
      budgetItems,
    }),
    [theme, sliders, inputs, toggles, stockHoldings, budgetItems],
  );

  /** The whole session: the plan, plus the configuration around it */
  const appState = useMemo<NormalizedState>(
    () => ({
      ...planState,
      stock: { apiUrl: stockApiUrl, holdings: stockHoldings },
      scenarios,
      activePage,
    }),
    [planState, stockApiUrl, stockHoldings, scenarios, activePage],
  );

  /** Apply theme class to document body */
  useEffect(() => {
    Object.values(themeClasses).forEach((cls) =>
      document.body.classList.remove(cls),
    );
    const cls = themeClasses[theme];
    if (cls) document.body.classList.add(cls);
  }, [theme]);

  /**
   * Persist financial state when the user has opted in.  Every slider tick and
   * keystroke lands here, so the write itself is deferred rather than run on
   * the frame that produced it.
   */
  useEffect(() => {
    if (!localStorageEnabled) return;
    persist.schedule(appState);
  }, [persist, localStorageEnabled, appState]);

  /** Never lose the queued write to a tab switch, a bfcache hide or a close */
  useEffect(() => {
    const flush = () => {
      persist.flush();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") persist.flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      persist.flush();
    };
  }, [persist]);

  /** Stop persisting when consent is revoked (or storage cleared) from another tab */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if ((e.key === STORAGE_CONSENT_KEY || e.key === null) && !loadConsent()) {
        persist.cancel();
        setLocalStorageEnabledRaw(false);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [persist]);

  /** Keyboard shortcuts */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault();
        setOverlay((p) => (p === "stock" ? "none" : "stock"));
      }
      if (e.ctrlKey && e.shiftKey && e.key === "H") {
        e.preventDefault();
        setOverlay((p) => (p === "help" ? "none" : "help"));
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
   * THE replace path: every state slice takes its value from `state`, so a
   * load can neither miss a slice nor invent one.  What each load MEANS is
   * decided before it gets here (see state-load.ts), which is what keeps the
   * two loads below from drifting apart the way App's copy and the
   * calculator's own copy of this path did.
   */
  const applyState = (state: NormalizedState): void => {
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

  /** An imported file replaces the whole session, saved scenarios included */
  const importState = (raw: TH4State): void => {
    applyState(normalizeState(raw));
  };

  /**
   * A saved scenario replaces the plan alone: the scenario list it was opened
   * from, the current page and the stock endpoint survive it.
   */
  const loadScenario = (raw: TH4State): void => {
    applyState(scenarioLoadedState(raw, appState));
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
          budgetItems={budgetItems}
          setBudgetItems={setBudgetItems}
          scenarios={scenarios}
          setScenarios={setScenarios}
          currentState={planState}
          onLoadScenario={loadScenario}
          localStorageEnabled={localStorageEnabled}
          onLocalStorageToggle={setLocalStorageEnabled}
        />
      </Content>

      <Sidebar>
        <ThemeSelector activeTheme={theme} onThemeChange={setTheme} />
        <StateIOPopover getState={() => appState} setState={importState} />
      </Sidebar>

      <StockModal
        open={overlay === "stock"}
        onOpenChange={(open) => {
          setOverlayOpen("stock", open);
        }}
        apiUrl={stockApiUrl}
        setApiUrl={setStockApiUrl}
        holdings={stockHoldings}
        setHoldings={setStockHoldings}
      />

      <Dialog.Root
        open={overlay === "help"}
        onOpenChange={(open) => {
          setOverlayOpen("help", open);
        }}
      >
        <Dialog.Portal>
          <HelpOverlay />
          <HelpContent size="lg" aria-describedby={undefined}>
            <Dialog.Title style={{ display: "none" }}>Help</Dialog.Title>
            <LandingReadme
              onNavigate={(page) => {
                setActivePage(page);
                setOverlay("none");
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
