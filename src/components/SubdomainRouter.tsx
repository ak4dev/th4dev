// src/components/SubdomainRouter.tsx
import { type JSX } from "react";
import InvestmentCalculatorRadixModern from "./InvestmentCalculatorModern";
import React from "react";

/* ------------------------------------------------ */
/* Subdomain Component Mapping */
/* ------------------------------------------------ */
const subdomainToComponent: { [key: string]: JSX.Element } = {
  f: <InvestmentCalculatorRadixModern />,
  // Add more subdomain-to-component mappings here
};

/* ------------------------------------------------ */
/* SubdomainRouter Component */
/* ------------------------------------------------ */
interface SubdomainRouterProps {
  subdomain: string;
  sliders: Record<string, number>;
  setSliders: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  inputs: Record<string, string>;
  setInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  toggles: { advanced: boolean; rollover: boolean; showInflation: boolean };
  setToggles: React.Dispatch<React.SetStateAction<any>>;
}

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
