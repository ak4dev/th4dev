/* ==================================================
 * Main Application Component
 * ================================================== */

import { useState, useEffect } from "react";
import { styled, themeClasses } from "../stitches.config";
import { ThemeSelector } from "./components/ThemeSwitcher";
import StateIOPopover from "./components/sidebar/StateIOPopover";
import SubdomainRouter from "./components/SubdomainRouter";
import {
  DEFAULT_THEME,
  DEFAULT_INITIAL_AMOUNT,
  DEFAULT_PROJECTED_GAIN,
  DEFAULT_YEARS_OF_GROWTH,
  DEFAULT_MONTHLY_CONTRIBUTION,
  DEFAULT_MONTHLY_WITHDRAWAL,
  DEFAULT_WITHDRAWAL_START_YEAR,
  DEFAULT_INFLATION_RATE,
} from "./common/constants/app-constants";
import type { TH4State } from "./common/types/types";

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
});

/* ==================================================
 * Default State
 * ================================================== */

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
  },
  inputs: {
    currentAmountA: String(DEFAULT_INITIAL_AMOUNT),
    currentAmountB: String(DEFAULT_INITIAL_AMOUNT),
  },
  toggles: {
    advanced: false,
    rollover: false,
    showInflation: false,
  },
};

/* ==================================================
 * Main Component
 * ================================================== */

/**
 * Main application component that manages investment calculator state
 * and provides theme switching and state persistence functionality
 */
export default function App() {
  const [theme, setTheme] = useState(defaultState.theme);
  const [sliders, setSliders] = useState(defaultState.sliders);
  const [inputs, setInputs] = useState(defaultState.inputs);
  const [toggles, setToggles] = useState(defaultState.toggles);

  /**
   * Apply theme changes to document body
   */
  useEffect(() => {
    // Remove all existing theme classes
    Object.values(themeClasses).forEach((cls) =>
      document.body.classList.remove(cls),
    );

    // Apply current theme class
    const cls = themeClasses[theme];
    if (cls) {
      document.body.classList.add(cls);
    }
  }, [theme]);

  /**
   * Extract subdomain from current hostname for routing
   */
  const hostname = window.location.hostname;
  const subdomain = hostname.split(".")[0];

  /**
   * Update application state from imported data
   */
  const setAppState = (state: TH4State): void => {
    if (!state) return;

    if (state.theme) {
      setTheme(state.theme);
    }
    if (state.sliders) {
      setSliders((prev) => ({ ...prev, ...state.sliders }));
    }
    if (state.inputs) {
      setInputs((prev) => ({ ...prev, ...state.inputs }));
    }
    if (state.toggles) {
      setToggles((prev) => ({ ...prev, ...state.toggles }));
    }
  };

  return (
    <Container>
      <Content>
        <SubdomainRouter
          subdomain={subdomain}
          sliders={sliders}
          setSliders={setSliders}
          inputs={inputs}
          setInputs={setInputs}
          toggles={toggles}
          setToggles={setToggles}
        />
      </Content>

      <Sidebar>
        <ThemeSelector onThemeChange={setTheme} />
        <StateIOPopover
          getState={() => ({ theme, sliders, inputs, toggles })}
          setState={setAppState}
        />
      </Sidebar>
    </Container>
  );
}
