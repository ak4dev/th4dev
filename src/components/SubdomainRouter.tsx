/* ==================================================
 * Subdomain Router Component
 * ================================================== */

import type { ComponentProps } from "react";
import InvestmentCalculatorRadixModern from "./InvestmentCalculatorModern";
import LandingReadme from "./LandingReadme";

type SubdomainRouterProps = ComponentProps<
  typeof InvestmentCalculatorRadixModern
> & {
  activePage: string;
  onNavigate: (page: string) => void;
  localStorageEnabled: boolean;
  onLocalStorageToggle: (enabled: boolean) => void;
};

/** Renders the calculator on the `f` page and the landing page everywhere else */
export default function SubdomainRouter({
  activePage,
  onNavigate,
  localStorageEnabled,
  onLocalStorageToggle,
  ...calculatorProps
}: SubdomainRouterProps) {
  return activePage === "f" ? (
    <InvestmentCalculatorRadixModern {...calculatorProps} />
  ) : (
    <LandingReadme
      onNavigate={onNavigate}
      localStorageEnabled={localStorageEnabled}
      onLocalStorageToggle={onLocalStorageToggle}
    />
  );
}
