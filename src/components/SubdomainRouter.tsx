/* ==================================================
 * Subdomain Router Component
 * ================================================== */

import { type JSX } from "react";
import InvestmentCalculatorRadixModern from "./InvestmentCalculatorModern";
import LandingReadme from "./LandingReadme";
import type { TH4State } from "../common/types/types";
import type { PortfolioHolding } from "../common/types/portfolio-types";
import type { BudgetItem } from "../common/helpers/budget-manager";
import type { ScenarioSnapshot } from "../common/helpers/scenario-manager";

/* ==================================================
 * Types
 * ================================================== */

interface SubdomainRouterProps {
  activePage: string;
  onNavigate: (page: string) => void;
  theme: string;
  setTheme: (theme: string) => void;
  sliders: Record<string, number>;
  setSliders: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  inputs: Record<string, string>;
  setInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  toggles: TH4State["toggles"];
  setToggles: React.Dispatch<React.SetStateAction<TH4State["toggles"]>>;
  stockApiUrl: string;
  stockHoldings: PortfolioHolding[];
  setStockHoldings: React.Dispatch<React.SetStateAction<PortfolioHolding[]>>;
  budgetItems: BudgetItem[];
  setBudgetItems: React.Dispatch<React.SetStateAction<BudgetItem[]>>;
  scenarios: ScenarioSnapshot[];
  setScenarios: React.Dispatch<React.SetStateAction<ScenarioSnapshot[]>>;
  localStorageEnabled: boolean;
  onLocalStorageToggle: (enabled: boolean) => void;
}

type SharedProps = Omit<SubdomainRouterProps, "activePage" | "onNavigate">;

/* ==================================================
 * Page Component Mapping
 * ================================================== */

const pageToComponent: Record<string, (props: SharedProps) => JSX.Element> = {
  f: (props) => <InvestmentCalculatorRadixModern {...props} />,
};

/* ==================================================
 * Component
 * ================================================== */

const SubdomainRouter = ({
  activePage,
  onNavigate,
  theme,
  setTheme,
  sliders,
  setSliders,
  inputs,
  setInputs,
  toggles,
  setToggles,
  stockApiUrl,
  stockHoldings,
  setStockHoldings,
  budgetItems,
  setBudgetItems,
  scenarios,
  setScenarios,
  localStorageEnabled,
  onLocalStorageToggle,
}: SubdomainRouterProps) => {
  const factory = pageToComponent[activePage];
  const sharedProps: SharedProps = {
    theme,
    setTheme,
    sliders,
    setSliders,
    inputs,
    setInputs,
    toggles,
    setToggles,
    stockApiUrl,
    stockHoldings,
    setStockHoldings,
    budgetItems,
    setBudgetItems,
    scenarios,
    setScenarios,
    localStorageEnabled,
    onLocalStorageToggle,
  };

  return factory ? (
    factory(sharedProps)
  ) : (
    <LandingReadme
      onNavigate={onNavigate}
      localStorageEnabled={localStorageEnabled}
      onLocalStorageToggle={onLocalStorageToggle}
    />
  );
};

export default SubdomainRouter;
