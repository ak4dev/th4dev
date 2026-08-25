/* ==================================================
 * Landing / Help Page
 *
 * Rendered as the root landing page and inside the
 * Ctrl+Shift+H help overlay.
 * ================================================== */

import { Fragment } from "react";
import { styled } from "../../stitches.config";
import { ActionButton } from "./ui/primitives";

/* ==================================================
 * Content
 * ================================================== */

const FEATURES: ReadonlyArray<readonly [string, string]> = [
  [
    "Dual lanes (A/B)",
    "monthly compound growth with contributions, withdrawals, fees, and inflation adjustment. Enable Advanced to unlock contributions, withdrawals, Investment B, and the tool toggles.",
  ],
  [
    "Partial years",
    "horizon, contribution stop year, and withdrawal start year accept fractional values such as 10.5, resolved to whole months.",
  ],
  ["Rollover", "roll Investment A's ending balance into B at A's finish year."],
  [
    "Target solver",
    "enter a target ending balance and the app solves for the monthly withdrawal that lands on it.",
  ],
  [
    "Dynamic Withdrawal",
    "withdraw a percentage of the balance, re-evaluated each withdrawal year and clamped between a floor and a ceiling; the same policy is applied in Monte Carlo.",
  ],
  [
    "Monte Carlo",
    "P10–P90 percentile bands from randomized annual returns, in combined, individual, or rollover modes.",
  ],
  [
    "Portfolio capital preservation",
    "required share prices per holding to keep pace with the projection, with live quotes via a configurable stock API.",
  ],
  [
    "FIRE, Budget, Scenarios, PDF",
    "FIRE number and years to FIRE, a monthly budget by category that feeds FIRE, named snapshots for side-by-side comparison, and a downloadable PDF report.",
  ],
];

const SHORTCUTS: ReadonlyArray<readonly [readonly string[], string]> = [
  [["Ctrl", "Shift", "F"], "Open the calculator from any page"],
  [["Ctrl", "Shift", "S"], "Open or close the stock data modal"],
  [["Ctrl", "Shift", "H"], "Toggle this help overlay"],
  [["Enter"], "Submit the ticker list in the stock modal symbol field"],
];

/* ==================================================
 * Styled Components
 * ================================================== */

const Page = styled("main", {
  width: "min(760px, 100%)",
  margin: "24px auto",
  padding: "28px 24px 32px",
  display: "grid",
  gap: "24px",
  borderRadius: "12px",
  border: "1px solid $currentLine",
  backgroundColor: "$background",
  color: "$foreground",
});

const Heading = styled("h2", {
  margin: 0,
  fontSize: "0.95rem",
  fontWeight: 600,
  color: "$cyan",
  variants: { level: { page: { fontSize: "1.6rem", color: "$foreground" } } },
});

const Text = styled("p", {
  margin: 0,
  color: "$comment",
  fontSize: "0.92rem",
  lineHeight: 1.65,
});

const Section = styled("section", { display: "grid", gap: "10px" });

const FeatureList = styled("ul", {
  margin: 0,
  padding: "0 0 0 1.2rem",
  display: "grid",
  gap: "8px",
  color: "$comment",
  fontSize: "0.9rem",
  lineHeight: 1.6,
  "& strong": { color: "$foreground" },
});

const ShortcutList = styled("dl", {
  margin: 0,
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gap: "8px 16px",
  alignItems: "center",
  color: "$comment",
  fontSize: "0.88rem",
  "& dd": { margin: 0 },
  "& kbd": {
    padding: "2px 8px",
    borderRadius: "6px",
    backgroundColor: "$currentLine",
    color: "$foreground",
    fontFamily: "inherit",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
});

const StorageBar = styled("div", {
  display: "flex",
  alignItems: "flex-start",
  gap: "14px",
  padding: "14px 16px",
  borderRadius: "10px",
  border: "1px solid $orange",
  "& strong": {
    display: "block",
    marginBottom: "4px",
    fontSize: "0.85rem",
    color: "$orange",
  },
  "& p": { fontSize: "0.78rem", lineHeight: 1.5 },
});

const ToggleSwitch = styled("button", {
  all: "unset",
  cursor: "pointer",
  flexShrink: 0,
  width: "40px",
  height: "22px",
  borderRadius: "999px",
  position: "relative",
  transition: "background-color 0.2s",
  "&::after": {
    content: '""',
    position: "absolute",
    top: "3px",
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    backgroundColor: "$background",
    transition: "left 0.2s",
  },
  variants: {
    on: {
      true: { backgroundColor: "$orange", "&::after": { left: "21px" } },
      false: { backgroundColor: "$comment", "&::after": { left: "3px" } },
    },
  },
});

/* ==================================================
 * Component
 * ================================================== */

interface LandingReadmeProps {
  onNavigate: (page: string) => void;
  localStorageEnabled: boolean;
  onLocalStorageToggle: (enabled: boolean) => void;
}

export default function LandingReadme({
  onNavigate,
  localStorageEnabled,
  onLocalStorageToggle,
}: LandingReadmeProps) {
  return (
    <Page>
      <Section>
        <Heading as="h1" level="page">
          Investment Growth Calculator
        </Heading>
        <Text>
          A client-side investment planning tool: project two investment lanes
          over decades, compare them, and stress-test the plan. Everything runs
          in your browser with no backend and no accounts, and nothing is stored
          unless you opt in below. Much of this project is AI generated and may
          contain errors; verify independently before relying on it for
          decisions.
        </Text>
        <div>
          <ActionButton onClick={() => onNavigate("f")}>
            Open calculator
          </ActionButton>
        </div>
      </Section>

      <Section>
        <Heading>Features</Heading>
        <FeatureList>
          {FEATURES.map(([name, text]) => (
            <li key={name}>
              <strong>{name}</strong> — {text}
            </li>
          ))}
        </FeatureList>
      </Section>

      <Section>
        <Heading>Keyboard shortcuts</Heading>
        <ShortcutList>
          {SHORTCUTS.map(([keys, text]) => (
            <Fragment key={text}>
              <dt>
                {keys.map((key, i) => (
                  <Fragment key={key}>
                    {i > 0 && " + "}
                    <kbd>{key}</kbd>
                  </Fragment>
                ))}
              </dt>
              <dd>{text}</dd>
            </Fragment>
          ))}
        </ShortcutList>
      </Section>

      <Section>
        <Heading>Storage and privacy</Heading>
        <StorageBar>
          <div>
            <strong>
              {localStorageEnabled
                ? "Local storage is ON"
                : "Local storage: off (default)"}
            </strong>
            <Text>
              {localStorageEnabled
                ? "All tool state (inputs, portfolio, theme) is being saved to this browser. Disable to stop storing data and clear what has been saved."
                : "No data is stored in this browser. All session data is lost on page reload. Enable to persist your data locally — data stays on your machine only and is never transmitted."}
            </Text>
          </div>
          <ToggleSwitch
            on={localStorageEnabled}
            role="switch"
            aria-checked={localStorageEnabled}
            aria-label="Local storage"
            onClick={() => onLocalStorageToggle(!localStorageEnabled)}
          />
        </StorageBar>
        <Text>
          Export and Import in the sidebar save and restore the full state as a
          JSON file, encrypted by default, without storing anything in the
          browser.
        </Text>
      </Section>
    </Page>
  );
}
