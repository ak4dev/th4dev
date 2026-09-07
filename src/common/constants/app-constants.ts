/* ==================================================
 * Application Constants
 * ================================================== */

/* ---------- Investment Defaults ---------- */
export const DEFAULT_INITIAL_AMOUNT = 10000;
export const DEFAULT_PROJECTED_GAIN = 10;
export const DEFAULT_YEARS_OF_GROWTH = 30;
export const DEFAULT_MONTHLY_CONTRIBUTION = 0;
export const DEFAULT_MONTHLY_WITHDRAWAL = 0;
export const DEFAULT_WITHDRAWAL_START_YEAR = 0;
export const DEFAULT_INFLATION_RATE = 2.5;
/** Dynamic withdrawal: annual % of balance, and monthly guardrails */
export const DEFAULT_WITHDRAWAL_RATE = 4;
export const DEFAULT_WITHDRAWAL_FLOOR = 0;
/** No tax modelled until the user names a rate; 0 keeps both engines untouched */
export const DEFAULT_WITHDRAWAL_TAX = 0;

/* ---------- Investment Limits ---------- */
export const MAX_MONTHLY_CONTRIBUTION = 5000;
/** Default span of the withdrawal, floor and ceiling sliders; a lane widens it to fit its own plan */
export const MAX_MONTHLY_WITHDRAWAL = 10000;
/**
 * Sanity bound on every stored withdrawal figure — the point past which a
 * number is a typo rather than a plan, not the point past which the app
 * declines to model it.
 *
 * It is deliberately far above the slider span: SLIDER_LIMITS is applied by
 * normalizeState on every import, hydrate and scenario load, so anything it
 * rejects is a value the user saved and does not get back. A $3M portfolio
 * drawn at 4% needs $10,000/mo, which is exactly where the slider span
 * stops, so clamping stored guardrails to the span silently rewrote the
 * plans of the users this app exists to serve.
 */
export const MAX_MONTHLY_WITHDRAWAL_LIMIT = 1_000_000;
export const MAX_YEARS_OF_GROWTH = 100;
export const MAX_PROJECTED_GAIN = 30;
export const MAX_INFLATION_RATE = 10;
export const MAX_ANNUAL_FEE = 3;
/**
 * Default annual return volatility, in percentage points.
 *
 * It is NOT the standard deviation of a calendar-year return, and that is why
 * it is 18 rather than the 15-16 an equity index is usually quoted at. Both
 * engines apply an annual rate X as twelve months of X/12, so a year returns
 * (1 + X/1200)^12 - 1, whose spread is about 1.115x this figure. Measured
 * over 200,000 draws at DEFAULT_PROJECTED_GAIN:
 *
 *   sigma 12 -> 11.19% arithmetic / 10.40% geometric / 13.27% spread
 *   sigma 15 -> 11.59% / 10.36% / 16.67%
 *   sigma 18 -> 12.09% / 10.32% / 20.12%
 *   sigma 20 -> 12.47% / 10.28% / 22.46%
 *
 * US large-cap since 1926 is roughly 12.1% arithmetic, 10.3% geometric, 19.8%
 * spread. Only 18 reproduces all three columns at once; the old 12 produced a
 * market a third less variable than any broad index has ever been, which
 * flattered every withdrawal plan the app has ever drawn. Note what does NOT
 * move: the simulated geometric mean stays at 10.3% either way, so raising
 * this does not change the return the plan compounds - only the honesty of
 * the cone around it.
 *
 * Raising it is not free. Persistence in this app is opt-in, so a plan that
 * never granted localStorage consent, and any export written before the
 * volatility slider existed, has no stored value and adopts this one - see
 * normalizeState, which spreads DEFAULT_SLIDERS beneath the file's own.
 */
export const DEFAULT_VOLATILITY = 18;
export const MAX_VOLATILITY = 30;
export const MAX_WITHDRAWAL_RATE = 20;
/**
 * Ceiling on the effective withdrawal tax rate.
 *
 * A bound, not a judgement about anyone's bracket: grossing a withdrawal up
 * divides by (1 - t), which has a pole at 100%, so an unbounded rate turns a
 * balance into Infinity and then into a "$NaN" on screen. 60 sits above any
 * plausible blended federal-plus-state effective rate on a retirement draw
 * while keeping the multiplier finite (2.5x at the top of the range).
 */
export const MAX_WITHDRAWAL_TAX = 60;
/**
 * Default ceiling on a dynamic policy.
 *
 * It is the SLIDER SPAN, and that is a known compromise rather than a
 * considered figure: DEFAULT_SLIDERS applies it to every plan, so a portfolio
 * above $3,000,000 has its policy capped by a guardrail the user never chose.
 * A $5,000,000 pot on a 4% policy asks for $16,667/mo, gets $10,000, and grows
 * where the plan says it should be drawn down - $6.37M at five years against
 * the $5.82M the policy describes.
 *
 * Raising it to MAX_MONTHLY_WITHDRAWAL_LIMIT is NOT the fix and was tried:
 * `withdrawalMax` in lane-model must span every stored guardrail (so that
 * touching a control cannot rewrite one), so a default of $1,000,000 stretches
 * the withdrawal, floor and ceiling tracks of every plan to $1,000,000 and
 * leaves a real $2,000 withdrawal at 0.2% of the track. A ceiling that is
 * genuinely absent needs an optional value rather than a large one, which is a
 * change to what the control means and belongs in its own change.
 *
 * Until then the binding is DISCLOSED rather than hidden: buildLane reports
 * `ceilingBinds`, and the info panel says the ceiling is holding the policy
 * below the rate it was asked for.
 */
export const DEFAULT_WITHDRAWAL_CEILING = MAX_MONTHLY_WITHDRAWAL;
export const MAX_AGE = 120;
export const MAX_ANNUAL_EXPENSES = 1_000_000;

/**
 * Paths per simulation.
 *
 * 500 made the depletion figure reproducible without making it accurate: the
 * share printed to whole-percent resolution carries a sampling standard
 * deviation of about 2 points there, so a plan whose true ruin is 21% renders
 * anywhere from 16% to 27% depending only on the seed. A fixed seed freezes
 * that error, it does not remove it. 2,000 quarters the variance for a cost
 * measured at roughly 24ms on a combined run, which is a deferred render and
 * well inside the budget.
 */
export const MONTE_CARLO_SIM_COUNT = 2000;
/**
 * Seed for every Monte Carlo run the app performs. A fixed constant makes the
 * bands a pure function of the plan's inputs: the same saved plan draws the
 * same cone, the same "Worst 10%" and the same PDF figures on every load,
 * which a per-mount random seed did not (at 500 paths the P10 estimator moved
 * by a six-figure amount between reloads with no input change). It is a module
 * constant rather than stored state on purpose - nothing about a plan needs to
 * remember it.
 */
export const MONTE_CARLO_SEED = 1_337;

/* ---------- FIRE Defaults ---------- */
/** Owned here so DEFAULT_SLIDERS is the only place they are applied — a 0 the user typed is a real answer, not a missing one */
export const DEFAULT_FIRE_ANNUAL_EXPENSES = 40000;
export const DEFAULT_FIRE_SWR = 4;
export const DEFAULT_FIRE_CURRENT_AGE = 30;
export const DEFAULT_FIRE_RETIREMENT_AGE = 65;

/* ---------- Investment Minimums ---------- */
export const MIN_VALUE = 0;

/* ---------- UI Constants ---------- */
export const CHART_HEIGHT = 350;
export const TABLE_MAX_HEIGHT = 320;
export const SCROLLABLE_THEME_ITEMS = 4;
export const THEME_ITEM_HEIGHT = 44;

/* ---------- Number Formatting ---------- */
export const MONTHS_PER_YEAR = 12;
export const PERCENTAGE_DIVISOR = 100;

/* ---------- File Export ---------- */
export const FILE_EXPORT_PREFIX = "th4";
export const FILE_EXPORT_EXTENSION = "json";

/* ---------- Default Theme ---------- */
export const DEFAULT_THEME = "gruvbox";

/* ---------- Target Value ---------- */
export const DEFAULT_TARGET_VALUE = 0; // 0 = no target set

/* ---------- Slider & Input Key Vocabulary ---------- */

/**
 * The two investment lanes.  Every per-lane slider and input is one of these
 * suffixed onto a base name, so this array and the two below are the whole
 * key inventory: a key that cannot be built from them does not exist.
 */
export const LANE_IDS = ["A", "B"] as const;
export type LaneId = (typeof LANE_IDS)[number];

/**
 * Every per-lane slider, named once.  Adding one means adding its base name
 * here and its ceiling to LANE_SLIDER_MAX below — which the compiler then
 * insists on, because both maps are declared total over these keys.
 */
export const SLIDER_BASE_KEYS = [
  "projectedGain",
  "yearsOfGrowth",
  "monthlyContribution",
  "monthlyWithdrawal",
  "withdrawalStartYear",
  "contributionStopYear",
  "withdrawalRate",
  "withdrawalFloor",
  "withdrawalCeiling",
  "targetValue",
  "annualFee",
  "volatility",
  "withdrawalTax",
] as const;
export type SliderBaseKey = (typeof SLIDER_BASE_KEYS)[number];

/** Sliders that describe the whole plan rather than one lane */
export const GLOBAL_SLIDER_KEYS = [
  "yearlyInflation",
  "fireAnnualExpenses",
  "fireSWR",
  "fireCurrentAge",
  "fireRetirementAge",
] as const;
export type GlobalSliderKey = (typeof GLOBAL_SLIDER_KEYS)[number];

export type LaneSliderKey = `${SliderBaseKey}${LaneId}`;
/** Every slider key the app knows; a value keyed by anything else is a typo */
export type SliderKey = LaneSliderKey | GlobalSliderKey;

/**
 * The sliders DEFAULT_SLIDERS deliberately has no entry for.  An unset
 * contribution-stop year means "contribute for this lane's whole horizon",
 * which tracks the Years slider; a stored one means a real date.  Typing them
 * as optional is what keeps the hub's `?? years` fallback a live requirement
 * the compiler enforces rather than a line somebody can tidy away.
 */
export type OptionalSliderKey = `contributionStopYear${LaneId}`;

/** Every slider DEFAULT_SLIDERS must supply a value for */
export type DefaultedSliderKey = Exclude<SliderKey, OptionalSliderKey>;

/** Text inputs, keyed the same way */
export const INPUT_BASE_KEYS = ["currentAmount"] as const;
export type InputBaseKey = (typeof INPUT_BASE_KEYS)[number];
export type InputKey = `${InputBaseKey}${LaneId}`;

/**
 * The one place an A/B key is assembled.  The return type is the exact key,
 * so `laneKey("projectdGain", id)` fails to index the slider map at the call
 * site instead of reading `undefined` as a default several layers down.
 */
export const laneKey = <B extends string, I extends LaneId>(
  base: B,
  id: I,
): `${B}${I}` => `${base}${id}`;

/** Runtime twin of SliderKey: the allow-list an imported file is filtered through */
export const SLIDER_KEYS: readonly SliderKey[] = [
  ...SLIDER_BASE_KEYS.flatMap((base) =>
    LANE_IDS.map((id) => laneKey(base, id)),
  ),
  ...GLOBAL_SLIDER_KEYS,
];

/** Runtime twin of InputKey */
export const INPUT_KEYS: readonly InputKey[] = INPUT_BASE_KEYS.flatMap((base) =>
  LANE_IDS.map((id) => laneKey(base, id)),
);

/* ---------- Slider Ranges ---------- */

export interface SliderLimit {
  min: number;
  max: number;
}

/**
 * Ceiling of each per-lane slider; every one of them starts at MIN_VALUE.
 *
 * The withdrawal family is bounded by the sanity limit, not by the slider
 * span: SLIDER_LIMITS is what a saved plan is re-read through, so a guardrail
 * the span cannot show must still be a guardrail the user gets back.
 */
const LANE_SLIDER_MAX: Record<SliderBaseKey, number> = {
  projectedGain: MAX_PROJECTED_GAIN,
  yearsOfGrowth: MAX_YEARS_OF_GROWTH,
  monthlyContribution: MAX_MONTHLY_CONTRIBUTION,
  monthlyWithdrawal: MAX_MONTHLY_WITHDRAWAL_LIMIT,
  withdrawalStartYear: MAX_YEARS_OF_GROWTH,
  contributionStopYear: MAX_YEARS_OF_GROWTH,
  withdrawalRate: MAX_WITHDRAWAL_RATE,
  withdrawalFloor: MAX_MONTHLY_WITHDRAWAL_LIMIT,
  withdrawalCeiling: MAX_MONTHLY_WITHDRAWAL_LIMIT,
  targetValue: Number.MAX_SAFE_INTEGER,
  annualFee: MAX_ANNUAL_FEE,
  volatility: MAX_VOLATILITY,
  withdrawalTax: MAX_WITHDRAWAL_TAX,
};

/** Range of each whole-plan slider */
const GLOBAL_SLIDER_LIMITS: Record<GlobalSliderKey, SliderLimit> = {
  yearlyInflation: { min: MIN_VALUE, max: MAX_INFLATION_RATE },
  fireAnnualExpenses: { min: MIN_VALUE, max: MAX_ANNUAL_EXPENSES },
  fireSWR: { min: MIN_VALUE, max: PERCENTAGE_DIVISOR },
  fireCurrentAge: { min: MIN_VALUE, max: MAX_AGE },
  fireRetirementAge: { min: MIN_VALUE, max: MAX_AGE },
};

/**
 * Valid range for every slider; values outside it (e.g. from an imported
 * file) are clamped by normalizeState so the math pipeline stays bounded.
 *
 * Generated from the key vocabulary rather than written out lane by lane, and
 * declared total over SliderKey, so a slider can neither be added without a
 * range nor keep a range after its key is gone.
 */
export const SLIDER_LIMITS: Record<SliderKey, SliderLimit> = {
  ...(Object.fromEntries(
    SLIDER_BASE_KEYS.flatMap((base) =>
      LANE_IDS.map(
        (id) =>
          [
            laneKey(base, id),
            { min: MIN_VALUE, max: LANE_SLIDER_MAX[base] },
          ] as const,
      ),
    ),
  ) as Record<LaneSliderKey, SliderLimit>),
  ...GLOBAL_SLIDER_LIMITS,
};
