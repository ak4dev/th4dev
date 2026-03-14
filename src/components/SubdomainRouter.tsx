/* ==================================================
 * Subdomain Router Component
 * ================================================== */

import { type JSX } from "react";
import InvestmentCalculatorRadixModern from "./InvestmentCalculatorModern";
import React from "react";
import type { TH4State } from "../App";

/* ==================================================
 * Subdomain Component Mapping
 * ================================================== */

const subdomainToComponent: { [key: string]: JSX.Element } = {
  f: <InvestmentCalculatorRadixModern />,
  // Add more subdomain-to-component mappings here
};

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
}

/* ==================================================
 * Component
 * ================================================== */

/**
 * Routes to different components based on subdomain
 * Clones the component and passes down props
 */
const SubdomainRouter = ({
  subdomain,
  sliders,
  setSliders,
  inputs,
  setInputs,
  toggles,
  setToggles,
}: SubdomainRouterProps) => {
  const currentComponent = subdomainToComponent[subdomain] || <div></div>;

  // Clone the component and pass down props correctly
  return React.cloneElement(currentComponent, {
    sliders,
    setSliders,
    inputs,
    setInputs,
    toggles,
    setToggles,
  });
};

export default SubdomainRouter;
