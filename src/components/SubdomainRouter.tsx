/* ==================================================
 * Subdomain Router Component
 * ================================================== */

import { type JSX } from "react";
import InvestmentCalculatorRadixModern from "./InvestmentCalculatorModern";
import type { TH4State } from "../common/types/types";
import type { PortfolioHolding } from "../common/types/portfolio-types";

/* ==================================================
 * Types
 * ================================================== */

/**
 * Props for the SubdomainRouter component
 */
interface SubdomainRouterProps {
  /** The subdomain extracted from the URL */
  subdomain: string;
  /** State for all slider values */
  sliders: Record<string, number>;
  /** Function to update slider values */
  setSliders: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  /** State for all input field values */
  inputs: Record<string, string>;
  /** Function to update input values */
  setInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /** State for all toggle switches */
  toggles: TH4State["toggles"];
  /** Function to update toggle values */
  setToggles: React.Dispatch<React.SetStateAction<TH4State["toggles"]>>;
  /** Stock API URL template */
  stockApiUrl: string;
  /** Portfolio holdings */
  stockHoldings: PortfolioHolding[];
  /** Setter for portfolio holdings */
  setStockHoldings: React.Dispatch<React.SetStateAction<PortfolioHolding[]>>;
}

type SharedProps = Omit<SubdomainRouterProps, "subdomain">;

/* ==================================================
 * Subdomain Component Mapping
 * ================================================== */

/**
 * Maps subdomain keys to component factory functions.
 * Each factory receives the shared state props and returns a JSX element.
 * Add new subdomain-to-component mappings here.
 */
const subdomainToComponent: Record<
  string,
  (props: SharedProps) => JSX.Element
> = {
  f: (props) => <InvestmentCalculatorRadixModern {...props} />,
};

/* ==================================================
 * Component
 * ================================================== */

/**
 * Routes to different components based on the current subdomain
 */
const SubdomainRouter = ({
  subdomain,
  sliders,
  setSliders,
  inputs,
  setInputs,
  toggles,
  setToggles,
  stockApiUrl,
  stockHoldings,
  setStockHoldings,
}: SubdomainRouterProps) => {
  const factory = subdomainToComponent[subdomain];
  const sharedProps: SharedProps = {
    sliders,
    setSliders,
    inputs,
    setInputs,
    toggles,
    setToggles,
    stockApiUrl,
    stockHoldings,
    setStockHoldings,
  };

  return factory ? factory(sharedProps) : <div />;
};

export default SubdomainRouter;
