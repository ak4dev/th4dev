import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import Hub from "../InvestmentCalculatorModern";
import {
  DEFAULT_STATE,
  DEFAULT_TOGGLES,
  normalizeState,
} from "../../common/helpers/state-manager";
import type { InputValues, TogglesState } from "../../common/types/types";
import {
  BASIC_MODE_PLAN,
  CLAMPED_TARGET_PLAN,
  DYNAMIC_POLICY_PLAN,
  FIXED_WITHDRAWAL_PLAN,
  PLAN_FIXTURES,
  ROLLOVER_PLAN,
  type PlanFixture,
} from "./fixtures/plan-fixtures";

/**
 * Radix's Switch is swapped for a plain <button> that records the handler it
 * was handed, so a test can flip a toggle the way a user does: this suite runs
 * in the default node environment with no DOM and no testing-library, so there
 * is nothing to click. Everything else renders for real.
 *
 * The registry goes through vi.hoisted because vi.mock is hoisted above the
 * imports, and React is imported inside the factory for the same reason.
 */
const switches = vi.hoisted(
  () => [] as { id: string; onCheckedChange: (v: boolean) => void }[],
);

vi.mock("@radix-ui/react-switch", async () => {
  const { createElement: h } = await import("react");
  type RootProps = {
    id: string;
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    children?: unknown;
  } & Record<string, unknown>;
  return {
    Root: ({ id, checked, onCheckedChange, children, ...rest }: RootProps) => {
      switches.push({ id, onCheckedChange });
      return h(
        "button",
        {
          ...rest,
          id,
          type: "button",
          "data-state": checked ? "checked" : "unchecked",
        },
        children as never,
      );
    },
    Thumb: ({ children, ...rest }: Record<string, unknown>) =>
      h("span", rest, children as never),
  };
});

/**
 * The Radix Slider is kept EXACTLY as it renders — the real Root is still
 * what produces the markup — and only its onValueChange is recorded on the
 * way past, keyed by the accessible name its thumb carries. Replacing it
 * outright would have thrown away the rendered slider this suite also reads,
 * so the mock wraps rather than substitutes.
 *
 * This is what lets a test move a control the way a user drags it: there is
 * no DOM here to dispatch a pointer event into.
 */
const sliderControls = vi.hoisted(
  () => [] as { name: string; onValueChange: (value: number[]) => void }[],
);

vi.mock("@radix-ui/react-slider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@radix-ui/react-slider")>();
  const { createElement: h, Children, isValidElement } = await import("react");
  type RootProps = {
    children?: import("react").ReactNode;
    onValueChange?: (value: number[]) => void;
  } & Record<string, unknown>;
  /** The aria-label of the Thumb this Root wraps; the control's own name */
  const thumbName = (children: RootProps["children"]): string | undefined => {
    for (const child of Children.toArray(children)) {
      if (!isValidElement<Record<string, unknown>>(child)) continue;
      const label = child.props["aria-label"];
      if (typeof label === "string") return label;
    }
    return undefined;
  };
  return {
    ...actual,
    Root: (props: RootProps) => {
      const name = thumbName(props.children);
      if (name !== undefined && props.onValueChange) {
        sliderControls.push({ name, onValueChange: props.onValueChange });
      }
      return h(actual.Root, props as never);
    },
  };
});

interface Overrides {
  toggles?: Partial<TogglesState>;
  sliders?: Record<string, number>;
  inputs?: Partial<InputValues>;
  setSliders?: (update: unknown) => void;
  setToggles?: (update: (prev: TogglesState) => TogglesState) => void;
}

/**
 * Renders the hub and resets the control registries to this render's
 * switches and sliders.
 */
const render = ({
  toggles = {},
  sliders = {},
  inputs = {},
  setSliders = () => {},
  setToggles = () => {},
}: Overrides = {}) => {
  switches.length = 0;
  sliderControls.length = 0;
  return renderToStaticMarkup(
    createElement(Hub, {
      theme: "gruvbox",
      setTheme: () => {},
      sliders: { ...DEFAULT_STATE.sliders, ...sliders },
      setSliders,
      inputs: { ...DEFAULT_STATE.inputs, ...inputs },
      setInputs: () => {},
      toggles: { ...DEFAULT_TOGGLES, ...toggles },
      setToggles,
      stockApiUrl: "",
      stockHoldings: [],
      setStockHoldings: () => {},
      budgetItems: [],
      setBudgetItems: () => {},
      scenarios: [],
      setScenarios: () => {},
    } as never),
  );
};

/**
 * Activates the switch that the visible `label` text is bound to, which is
 * also what a click on that text does in a browser.
 */
const flipSwitchLabelled = (html: string, label: string, value: boolean) => {
  const tag = new RegExp(`<label[^>]*>${label}:</label>`).exec(html)?.[0] ?? "";
  const id = /for="([^"]+)"/.exec(tag)?.[1] ?? "";
  const control = switches.find((s) => s.id === id);
  expect(control, `no switch is bound to the "${label}" label`).toBeDefined();
  control?.onCheckedChange(value);
};

/** The `value` attribute of the input carrying `name` as its accessible name */
const inputValue = (html: string, name: string): string | undefined => {
  const tag = new RegExp(`<input[^>]*aria-label="${name}"[^>]*>`).exec(
    html,
  )?.[0];
  return tag === undefined ? undefined : /value="([^"]*)"/.exec(tag)?.[1];
};

/**
 * The Target Value control was once nested inside the advanced-mode block and
 * silently disappeared from basic mode. It is a core feature in every mode, so
 * its presence is pinned here.
 */
describe("Target Value control is present in every mode", () => {
  for (const [name, t] of [
    ["basic", {}],
    ["advanced (fixed withdrawals)", { advanced: true }],
    [
      "advanced + dynamic withdrawal",
      { advanced: true, dynamicWithdrawal: true },
    ],
  ] as const) {
    it(name, () => {
      const html = render({ toggles: t });
      expect(html).toContain("Target Value");
      expect(html).toMatch(/aria-label="Investment A Target Value"/);
    });
  }
});

describe("Inflated is a display toggle and nothing more", () => {
  it("moves no slider when it is flipped", () => {
    const setSliders = vi.fn<(update: unknown) => void>();
    const setToggles =
      vi.fn<(update: (prev: TogglesState) => TogglesState) => void>();
    // A goal the plan misses, which is exactly when the old handler re-solved
    // the lane and wrote the solved withdrawal back over the user's slider.
    const sliders = { targetValueA: 500_000, projectedGainA: 12 };

    const html = render({
      toggles: { advanced: true },
      sliders,
      setSliders,
      setToggles,
    });
    flipSwitchLabelled(html, "Inflated", true);

    expect(setSliders).not.toHaveBeenCalled();
    expect(setToggles).toHaveBeenCalledTimes(1);
  });

  it("writes only the toggle it names", () => {
    const setToggles =
      vi.fn<(update: (prev: TogglesState) => TogglesState) => void>();
    const before: TogglesState = { ...DEFAULT_TOGGLES, advanced: true };

    const html = render({ toggles: { advanced: true }, setToggles });
    flipSwitchLabelled(html, "Inflated", true);

    const update = setToggles.mock.calls[0]?.[0];
    expect(update?.(before)).toEqual({ ...before, showInflation: true });
  });
});

describe("rollover only lands when it fits inside lane B", () => {
  const longA = { yearsOfGrowthA: 30, yearsOfGrowthB: 10 };

  it("says so, and does not extend B, when A outlives B", () => {
    const html = render({
      toggles: { advanced: true, rollover: true },
      sliders: longA,
    });
    expect(html).toContain("cannot land");
    expect(html).toContain("Rollover Date");
    expect(html).toContain("Not applied");
    // B's Years control still describes B's plan
    expect(inputValue(html, "Investment B Years")).toBe("10");
  });

  it("leaves B's ending balance exactly where rollover-off leaves it", () => {
    const on = render({
      toggles: { advanced: true, rollover: true },
      sliders: longA,
    });
    const off = render({ toggles: { advanced: true }, sliders: longA });
    const totals = (html: string) => [
      ...html.matchAll(/data-state="closed"[^>]*>(\$[\d,]+)</g),
    ];
    expect(totals(on)).toHaveLength(2);
    expect(totals(on)[1]?.[1]).toBe(totals(off)[1]?.[1]);
  });

  it("applies the roll when A finishes within B's horizon", () => {
    const html = render({
      toggles: { advanced: true, rollover: true },
      sliders: { yearsOfGrowthA: 10, yearsOfGrowthB: 30 },
    });
    expect(html).not.toContain("cannot land");
    expect(html).not.toContain("Not applied");
  });
});

describe("dependent year controls are clamped to the horizon", () => {
  it("shows the stop and start years the plan actually uses", () => {
    const html = render({
      toggles: { advanced: true },
      sliders: {
        yearsOfGrowthA: 10,
        contributionStopYearA: 30,
        withdrawalStartYearA: 25,
      },
    });
    expect(inputValue(html, "Investment A Contribution Stop Year")).toBe("10");
    expect(inputValue(html, "Investment A Withdrawal Start Year")).toBe("10");
  });
});

describe("tools are advanced-mode only", () => {
  const allOn = {
    portfolio: true,
    fire: true,
    scenarios: true,
    budget: true,
    monteCarlo: true,
    fees: true,
  };

  it("renders no tool panel in basic mode even with every tool toggled on", () => {
    const html = render({ toggles: { advanced: false, ...allOn } });
    for (const panel of [
      "Portfolio Capital Preservation",
      "FIRE Calculator",
      "Scenario Snapshots",
      "Monthly Budget",
      "Volatility",
      "Fees Paid",
    ]) {
      expect(html).not.toContain(panel);
    }
  });

  it("resolves the Monte Carlo mode to off in basic mode", () => {
    // No simulation ran, so the percentile rows the bands feed are absent
    const html = render({ toggles: { advanced: false, monteCarlo: true } });
    expect(html).not.toContain("Median Outcome");
    expect(html).not.toContain("Percentile");
  });

  it("renders the panels once Advanced is on", () => {
    const html = render({ toggles: { advanced: true, ...allOn } });
    expect(html).toContain("FIRE Calculator");
    expect(html).toContain("Scenario Snapshots");
    expect(html).toContain("Monthly Budget");
    expect(html).toContain("Volatility A");
  });
});

describe("the info panel labels what it measures", () => {
  it("names the percentile, not the decile, on the Monte Carlo rows", () => {
    const html = render({ toggles: { advanced: true, monteCarlo: true } });
    expect(html).toContain("90th Percentile");
    expect(html).toContain("10th Percentile");
    expect(html).toContain("1 in 10 end above");
    expect(html).toContain("1 in 10 end below");
    expect(html).not.toContain("Best 10%");
    expect(html).not.toContain("Worst 10%");
  });

  it("does not call a gross-growth heuristic a safe withdrawal", () => {
    const html = render({ toggles: { advanced: true } });
    expect(html).not.toContain("Safe Withdrawal");
    expect(html).toContain("Growth covers draw from");
  });
});

describe("the totals box is the popover trigger", () => {
  it("puts no div inside a button", () => {
    const html = render({ toggles: { advanced: true } });
    expect(html).not.toMatch(/<button[^>]*>\s*<div/);
  });
});

/* ==================================================
 * Golden plans
 *
 * Everything above pins a RULE. This section pins the
 * NUMBERS: five whole plans (fixtures/plan-fixtures.ts)
 * rendered end to end, with every figure the Info panel
 * prints compared against an exact expected value.
 *
 * It exists because all of the hub's engine-to-UI wiring
 * - buildLane, buildLanes, targetLevers, the Monte Carlo
 * orchestration, laneRows and mcRows - is private to
 * InvestmentCalculatorModern.tsx and can only be reached
 * through rendered output. A refactor that moves those
 * parts into their own modules is a large mechanical
 * change, and the failure it can hide is not a crash: it
 * is one displayed number quietly becoming a different
 * number. So the assertions are exact values, never
 * snapshots. A snapshot goes green on any `-u` run, which
 * is precisely the failure mode this suite exists to
 * prevent.
 *
 * Two shapes in the panel are clock-dependent, and only
 * those two are rewritten before comparison (see
 * `relative`): a full date becomes its whole-month offset
 * from today, and a leading calendar year becomes its
 * offset in years. The OFFSET is the assertion - the
 * arithmetic that produced the date is pinned, the day
 * the suite happens to run is not.
 * ================================================== */

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Undoes the five entities renderToStaticMarkup escapes */
const decodeEntities = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

/** The value column of the Info-panel row whose label column reads `label` */
const infoValue = (html: string, label: string): string | undefined => {
  const match = new RegExp(
    `<span>${escapeRegExp(label)}:</span><span>([^<]*)</span>`,
  ).exec(html);
  return match === null ? undefined : decodeEntities(match[1]);
};

/** Every Info-panel row label, in the order the panel prints them */
const infoLabels = (html: string): string[] =>
  [...html.matchAll(/<span>([^<]*):<\/span><span>/g)].map((m) =>
    decodeEntities(m[1]),
  );

/** The ending balance in each lane's totals box, in render order */
const endingBalances = (html: string): string[] =>
  [...html.matchAll(/data-state="closed"[^>]*>(\$[\d,]+)</g)].map((m) => m[1]);

/**
 * Months between two dates by calendar month, computed here rather than
 * imported so the expected offset is arrived at independently of the
 * date-fns call the panel itself makes.
 */
const monthsBetween = (later: Date, earlier: Date) =>
  (later.getFullYear() - earlier.getFullYear()) * 12 +
  (later.getMonth() - earlier.getMonth());

/** The shape `Date.prototype.toDateString()` produces, e.g. "Wed Sep 03 2036" */
const DATE_STRING = /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4}$/;

/** Rewrites the two clock-dependent value shapes as offsets from today */
const relative = (value: string, today: Date): string => {
  if (DATE_STRING.test(value))
    return `+${monthsBetween(new Date(value), today)} mo`;
  const year = /^(\d{4})\b/.exec(value);
  return year === null
    ? value
    : `+${Number(year[1]) - today.getFullYear()} yr${value.slice(4)}`;
};

/** Every Info-panel row as a label -> value table, dates made relative */
const infoTable = (html: string): Record<string, string> => {
  const today = new Date();
  return Object.fromEntries(
    infoLabels(html).map((label) => [
      label,
      relative(infoValue(html, label) ?? "(row not found)", today),
    ]),
  );
};

/** Renders one whole plan the way App does: normalizeState, then the hub */
const renderPlan = (fixture: PlanFixture, overrides: Overrides = {}) => {
  const state = normalizeState(fixture.state);
  return render({
    sliders: state.sliders,
    inputs: state.inputs,
    toggles: state.toggles,
    ...overrides,
  });
};

/** Drags the control whose thumb carries `name`, as a pointer drag would */
const dragSliderNamed = (name: string, value: number) => {
  const control = sliderControls.find((c) => c.name === `${name} slider`);
  expect(control, `no slider is labelled "${name}"`).toBeDefined();
  control?.onValueChange([value]);
};

/** One plan and every figure it must produce */
interface GoldenPlan {
  fixture: PlanFixture;
  /** The ending balance box of each rendered lane, in order */
  totals: string[];
  /** What each lane's Target Value box shows; undefined = lane not rendered */
  targets: [string | undefined, string | undefined];
  /** Every Info-panel row, in order, with its exact value */
  info: Record<string, string>;
}

const GOLDEN_PLANS: GoldenPlan[] = [
  {
    fixture: BASIC_MODE_PLAN,
    // $100,000 compounding at 8% for 20 years and nothing else. The stored
    // $1,000 contribution, $500 withdrawal and 1% fee would each move this
    // figure; basic mode resolves all three to nothing, so none of them do.
    totals: ["$492,680"],
    targets: ["", undefined],
    info: {
      "(A) Target Reached": "N/A",
      // Rollover is stored ON, but a tool is advanced-only, so it is not
      // "Not applied" (which means the roll was tried and did not fit) - it
      // is not part of this plan at all
      "Rollover Date": "N/A",
      "Rollover Amount": "N/A",
      "Inflation Rate": "2.5%",
    },
  },
  {
    fixture: FIXED_WITHDRAWAL_PLAN,
    totals: ["$1,070,067", "$0"],
    targets: ["500000", ""],
    info: {
      "(A) Withdrawal Start": "+120 mo",
      "(A) Contributions End": "+120 mo",
      "(A) Runs Out": "Not within horizon",
      "(A) Target Reached": "+9 yr (yr 9)",
      // Gross growth first covers the first year's $24,000 draw in year 4
      "(A) Growth covers draw from": "+4 yr ($2,050/mo gross, nominal)",
      "(A) Fees Paid": "$95,962",
      "(B) Withdrawal Start": "+0 mo",
      // B stores no stop year, so contributions run to its whole horizon
      "(B) Contributions End": "+240 mo",
      // $80,000 drawn at $1,500/mo does not last five years
      "(B) Runs Out": "+59 mo",
      "(B) Target Reached": "N/A",
      "(B) Growth covers draw from": "Not within horizon",
      "(B) Fees Paid": "$509",
      "Rollover Date": "N/A",
      "Rollover Amount": "N/A",
      "Inflation Rate": "2.5%",
      // Individual mode, so each lane gets its own bands off one shared
      // random stream. The fixed seed is what makes these exact.
      "(A) Median Outcome": "$1,088,372",
      "(A) 90th Percentile": "$3,220,310 (1 in 10 end above)",
      "(A) 10th Percentile": "$122,347 (1 in 10 end below)",
      "(A) Chance of Running Out": "5%",
      "(B) Median Outcome": "$0",
      "(B) 90th Percentile": "$0 (1 in 10 end above)",
      "(B) 10th Percentile": "$0 (1 in 10 end below)",
      "(B) Chance of Running Out": "100%",
    },
  },
  {
    fixture: DYNAMIC_POLICY_PLAN,
    // Today's dollars: $600,000 growing at 6% while 5% a year is drawn ends
    // near $770,000 nominal, which 25 years of 3% inflation deflates to this
    totals: ["$367,704", "$192,787"],
    targets: ["", ""],
    info: {
      "(A) Withdrawal Start": "+0 mo",
      "(A) Contributions End": "+300 mo",
      "(A) Runs Out": "Not within horizon",
      // 5% of $600,000 is $2,500/mo on day one, and the top of the range is
      // above the stored $3,000 ceiling because the guardrails are indexed
      "(A) Withdrawal":
        "$2,500–$3,176/mo nominal (5% of balance, guardrails indexed)",
      "(A) Target Reached": "N/A",
      // Nominal, not the displayed real track: 6% of the year-1 NOMINAL
      // balance is $3,030/mo. Reading `y` here would report a deflated
      // balance against a nominal draw and answer a later year.
      "(A) Growth covers draw from": "+1 yr ($3,030/mo gross, nominal)",
      "(B) Withdrawal Start": "+60 mo",
      "(B) Contributions End": "+300 mo",
      "(B) Runs Out": "Not within horizon",
      "(B) Withdrawal":
        "$899–$1,319/mo nominal (4% of balance, guardrails indexed)",
      "(B) Target Reached": "N/A",
      "(B) Growth covers draw from": "+1 yr ($1,061/mo gross, nominal)",
      "Rollover Date": "N/A",
      "Rollover Amount": "N/A",
      "Inflation Rate": "3%",
      "(A+B) Median Outcome": "$601,335",
      "(A+B) 90th Percentile": "$1,160,214 (1 in 10 end above)",
      "(A+B) 10th Percentile": "$312,949 (1 in 10 end below)",
      "(A+B) Chance of Running Out": "0%",
    },
  },
  {
    fixture: ROLLOVER_PLAN,
    // B's $2,325,482 is $60,000 of its own plus $250/mo for 30 years plus
    // A's whole $517,111 compounding at 6% for the remaining 20. Drop the
    // injection and B ends near $613,000.
    totals: ["$517,111", "$2,325,482"],
    targets: ["", ""],
    info: {
      "(A) Withdrawal Start": "N/A",
      "(A) Contributions End": "+120 mo",
      "(A) Runs Out": "N/A",
      "(A) Target Reached": "N/A",
      "(A) Growth covers draw from": "N/A",
      "(B) Withdrawal Start": "N/A",
      "(B) Contributions End": "+360 mo",
      "(B) Runs Out": "N/A",
      "(B) Target Reached": "N/A",
      "(B) Growth covers draw from": "N/A",
      // A finishes inside B's horizon, so the roll lands: the date is A's
      // finish and the amount is A's own ending balance
      "Rollover Date": "+120 mo",
      "Rollover Amount": "$517,111",
      "Inflation Rate": "2.5%",
      // Rollover mode outranks the Monte Carlo mode switch, and its bands
      // describe the whole portfolio rather than either lane
      "(Portfolio) Median Outcome": "$2,398,740",
      "(Portfolio) 90th Percentile": "$5,212,440 (1 in 10 end above)",
      "(Portfolio) 10th Percentile": "$1,158,697 (1 in 10 end below)",
      // No "Chance of Running Out": nothing here ever withdraws
    },
  },
  {
    fixture: CLAMPED_TARGET_PLAN,
    totals: ["$31,667", "$67,816"],
    // The stored goal is $100,000,000; the control shows the most the lane's
    // levers can reach, which is maxAchievable() for this plan
    targets: ["85984731", ""],
    info: {
      "(A) Withdrawal Start": "+120 mo",
      // No stop year is stored, so contributions run to the whole horizon
      "(A) Contributions End": "+240 mo",
      "(A) Runs Out": "Not within horizon",
      "(A) Target Reached": "> 20 yrs",
      "(A) Growth covers draw from": "Not within horizon",
      "(B) Withdrawal Start": "N/A",
      "(B) Contributions End": "+240 mo",
      "(B) Runs Out": "N/A",
      "(B) Target Reached": "N/A",
      "(B) Growth covers draw from": "N/A",
      "Rollover Date": "N/A",
      "Rollover Amount": "N/A",
      "Inflation Rate": "2.5%",
    },
  },
];

describe("golden plans render exact figures", () => {
  it("covers every fixture the plan file exports", () => {
    // A fixture with no golden numbers beside it is a plan nobody is
    // checking, which is the one thing this suite cannot afford
    expect(GOLDEN_PLANS.map((g) => g.fixture)).toEqual([...PLAN_FIXTURES]);
  });

  for (const { fixture, totals, targets, info } of GOLDEN_PLANS) {
    describe(fixture.name, () => {
      // One render per plan: these are pure functions of the fixture, and a
      // Monte Carlo plan pays for five hundred simulations each time
      const html = renderPlan(fixture);
      // Every failure here says which wiring rule the fixture was holding
      // still, so the number that moved comes with the reason it mattered
      const why = fixture.pins;

      it("ends each lane on the balance the plan reaches", () => {
        expect(endingBalances(html), why).toEqual(totals);
      });

      it("shows each lane's target as the control stores it", () => {
        expect(
          [
            inputValue(html, "Investment A Target Value"),
            inputValue(html, "Investment B Target Value"),
          ],
          why,
        ).toEqual(targets);
      });

      it("prints every info row with the value it measured", () => {
        expect(infoTable(html), why).toEqual(info);
      });

      it("prints those rows, and only those, in this order", () => {
        expect(infoLabels(html)).toEqual(Object.keys(info));
      });
    });
  }
});

describe("basic mode runs none of the tools its plan has switched on", () => {
  // Every tool toggle in this fixture is stored ON, so what is missing below
  // is missing because isTool gated it, not because nobody asked for it
  const html = renderPlan(BASIC_MODE_PLAN);

  it("draws no lane B", () => {
    expect(inputValue(html, "Investment B Current Amount")).toBeUndefined();
    expect(endingBalances(html)).toHaveLength(1);
  });

  it("draws no tool panel", () => {
    for (const panel of [
      "Portfolio Capital Preservation",
      "FIRE Calculator",
      "Scenario Snapshots",
      "Monthly Budget",
      "Volatility A",
    ]) {
      expect(html).not.toContain(panel);
    }
  });

  it("runs no simulation", () => {
    expect(html).not.toContain("Median Outcome");
  });
});

describe("a small but real chance of running out is not rounded to zero", () => {
  /*
   * The same plan as FIXED_WITHDRAWAL_PLAN with lane A drawing $1,000/mo
   * instead of $2,000: a handful of the 500 paths still fail, so the honest
   * answer is a fraction of a percent rather than the "0%" that reads as
   * impossible. At $2,000 the same row reads "5%", so the branch is
   * exercised from both sides.
   */
  const state = normalizeState(FIXED_WITHDRAWAL_PLAN.state);
  const html = renderPlan(FIXED_WITHDRAWAL_PLAN, {
    sliders: { ...state.sliders, monthlyWithdrawalA: 1000 },
  });

  it("says <1% rather than 0%", () => {
    expect(infoValue(html, "(A) Chance of Running Out")).toBe("<1%");
  });

  it("still reports the plan's own ending balance", () => {
    expect(endingBalances(html)[0]).toBe("$1,562,970");
  });
});

describe("solving for an unreachable target", () => {
  /*
   * The "(capped)" annotation and the "(A) Target Solved By" row are painted
   * from state the SOLVE writes, and renderToStaticMarkup renders once: a
   * setState after it returns is a no-op on the server, so neither row can
   * be observed here. What CAN be observed is the whole of what the solve
   * decided, which is the part a refactor would break - the lever cascade
   * the mode offers, the lane the solved values are spread onto, and the
   * balance stored as the reachable goal.
   */
  const setSliders = vi.fn<(update: unknown) => void>();
  const before = normalizeState(CLAMPED_TARGET_PLAN.state).sliders as Record<
    string,
    number
  >;
  renderPlan(CLAMPED_TARGET_PLAN, { setSliders });
  dragSliderNamed("Investment A Target Value", 100_000_000);

  const update = setSliders.mock.calls[0]?.[0] as (
    prev: Record<string, number>,
  ) => Record<string, number>;
  const after = update(before);
  const changed = Object.fromEntries(
    Object.entries(after).filter(([key, value]) => before[key] !== value),
  );

  it("writes the solved levers and the reachable goal in one update", () => {
    expect(setSliders).toHaveBeenCalledTimes(1);
    expect(changed).toEqual({
      // Advanced mode with fixed withdrawals offers all three levers for a
      // shortfall, in cascade order, and every one of them ends at its bound
      monthlyWithdrawalA: 0,
      monthlyContributionA: 5000,
      projectedGainA: 30,
      // Not the $100,000,000 that was asked for: the goal that is stored is
      // the balance the clamped plan actually reaches
      targetValueA: 85_984_731,
    });
  });

  it("stores exactly the ceiling the Target Value control already showed", () => {
    expect(String(after["targetValueA"])).toBe(
      inputValue(renderPlan(CLAMPED_TARGET_PLAN), "Investment A Target Value"),
    );
  });

  it("moves lane B's sliders not at all", () => {
    expect(Object.keys(changed).filter((key) => key.endsWith("B"))).toEqual([]);
  });
});
