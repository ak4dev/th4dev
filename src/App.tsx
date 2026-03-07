// src/App.tsx
import { useState, useEffect } from "react";
import { styled, themeClasses, globalStyles } from "../stitches.config";
import { ThemeSelector } from "./components/ThemeSwitcher";
import StateIOPopover from "./components/sidebar/StateIOPopover";
import SubdomainRouter from "./components/SubdomainRouter";

/* ------------------------------------------------ */
/* Types */
/* ------------------------------------------------ */
export interface TH4State {
  theme: string;
  sliders: Record<string, number>;
  inputs: Record<string, string>;
  toggles: {
    advanced: boolean;
    rollover: boolean;
    showInflation: boolean;
  };
}

/* ------------------------------------------------ */
/* Layout */
/* ------------------------------------------------ */
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

/* ------------------------------------------------ */
/* Default State */
/* ------------------------------------------------ */
const defaultState: TH4State = {
  theme: "gruvbox",
  sliders: {
    investmentA: 10000,
    investmentB: 10000,
    projectedGainA: 10,
    projectedGainB: 10,
    yearsOfGrowthA: 30,
    yearsOfGrowthB: 30,
    monthlyContributionA: 0,
    monthlyContributionB: 0,
    monthlyWithdrawalA: 0,
    monthlyWithdrawalB: 0,
    withdrawalStartYearA: 0,
    withdrawalStartYearB: 0,
    yearlyInflationA: 2.5,
    yearlyInflationB: 2.5,
  },
  inputs: {
    currentAmountA: "10000",
    currentAmountB: "10000",
  },
  toggles: {
    advanced: false,
    rollover: false,
    showInflation: false,
  },
};

/* ------------------------------------------------ */
/* App Component */
/* ------------------------------------------------ */
export default function App() {
  const [theme, setTheme] = useState(defaultState.theme);
  const [sliders, setSliders] = useState(defaultState.sliders);
  const [inputs, setInputs] = useState(defaultState.inputs);
  const [toggles, setToggles] = useState(defaultState.toggles);

  /* ------------------------------------------------ */
  /* Mount */
  useEffect(() => {
    globalStyles(); // apply global styles
  }, []);

  /* ------------------------------------------------ */
  /* Apply Theme */
  useEffect(() => {
    // Remove all theme classes
    Object.values(themeClasses).forEach((cls) =>
      document.body.classList.remove(cls),
    );
    // Add current theme class
    const cls = themeClasses[theme];
    if (cls) document.body.classList.add(cls);
  }, [theme]);

  /* ------------------------------------------------ */
  /* Subdomain Detection (if needed for routing) */
  const hostname = window.location.hostname;
  const subdomain = hostname.split(".")[0]; // Extract subdomain from URL

  /* ------------------------------------------------ */
  /* Set App State Function */
  const setAppState = (state: TH4State) => {
    if (!state) return;
    if (state.theme) setTheme(state.theme);
    if (state.sliders) setSliders((prev) => ({ ...prev, ...state.sliders }));
    if (state.inputs) setInputs((prev) => ({ ...prev, ...state.inputs }));
    if (state.toggles) setToggles((prev) => ({ ...prev, ...state.toggles }));
  };

  /* ------------------------------------------------ */
  /* Render */
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
