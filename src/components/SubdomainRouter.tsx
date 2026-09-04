/* ==================================================
 * Subdomain Router Component
 * ================================================== */

import { Suspense, lazy, useEffect } from "react";
import type { ComponentProps } from "react";
import { styled } from "../../stitches.config";
import LandingReadme from "./LandingReadme";

/* ==================================================
 * Lazy calculator
 * ================================================== */

/**
 * The calculator pulls in the charting stack, the projection maths and every
 * tool panel.  The landing page is the default route on th4.dev, so that
 * whole subtree is fetched on demand instead of riding the entry chunk.
 */
const importCalculator = () => import("./InvestmentCalculatorModern");

/**
 * React.lazy caches a rejected import for the life of the page: one dropped
 * connection and every later render re-throws, landing the visitor on the
 * global error boundary, which is written for corrupt saved state and offers
 * to purge their plan. Retrying once re-arms the loader, so a network blip
 * costs a moment rather than the wrong recovery story.
 */
const InvestmentCalculatorModern = lazy(() =>
  importCalculator().catch(() => importCalculator()),
);

/**
 * Read off the module rather than off the `lazy()` wrapper: the wrapper's
 * props go through `ComponentPropsWithRef`, and this stays exactly the props
 * the component itself declares.  The `import()` is in type position only, so
 * it emits nothing.
 */
type CalculatorProps = ComponentProps<
  typeof import("./InvestmentCalculatorModern").default
>;

/* ==================================================
 * Styled Components
 * ================================================== */

/** Mirrors the calculator's own outer chrome so the swap-in does not jump */
const CalculatorFallback = styled("div", {
  backgroundColor: "$background",
  color: "$foreground",
  fontFamily: "$body",
  minHeight: "100vh",
  padding: "24px",
  borderRadius: "16px",
  border: "2px solid $cyan",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const FallbackMessage = styled("p", {
  margin: 0,
  color: "$comment",
  fontSize: "0.9rem",
});

/* ==================================================
 * Types
 * ================================================== */

type SubdomainRouterProps = CalculatorProps & {
  activePage: string;
  onNavigate: (page: string) => void;
  localStorageEnabled: boolean;
  onLocalStorageToggle: (enabled: boolean) => void;
};

/* ==================================================
 * Main Component
 * ================================================== */

/** Renders the calculator on the `f` page and the landing page everywhere else */
export default function SubdomainRouter({
  activePage,
  onNavigate,
  localStorageEnabled,
  onLocalStorageToggle,
  ...calculatorProps
}: SubdomainRouterProps) {
  const showCalculator = activePage === "f";

  /**
   * Warm the calculator chunk while the visitor is reading the landing page,
   * so clicking through does not wait on a cold fetch.  Deferred to idle
   * because the fetched chunk is parsed and evaluated the moment it lands,
   * and the landing page's own interactivity comes first.
   */
  useEffect(() => {
    if (showCalculator) return;
    const warm = () => {
      // A failed warm-up is harmless: the Suspense boundary below fetches
      // again when the visitor actually opens the calculator.
      void importCalculator().catch(() => undefined);
    };
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(warm, { timeout: 2000 });
      return () => {
        cancelIdleCallback(handle);
      };
    }
    const handle = window.setTimeout(warm, 500);
    return () => {
      window.clearTimeout(handle);
    };
  }, [showCalculator]);

  return showCalculator ? (
    <Suspense
      fallback={
        <CalculatorFallback>
          <FallbackMessage role="status">
            Loading the calculator…
          </FallbackMessage>
        </CalculatorFallback>
      }
    >
      <InvestmentCalculatorModern {...calculatorProps} />
    </Suspense>
  ) : (
    <LandingReadme
      onNavigate={onNavigate}
      localStorageEnabled={localStorageEnabled}
      onLocalStorageToggle={onLocalStorageToggle}
    />
  );
}
