/* ==================================================
 * Numeric Field Policy
 *
 * One answer to the three questions every number box in
 * the app asks: which characters may it hold, what an
 * entry that reads as no number at all means, and what
 * happens to a value outside the field's range.
 *
 * Six boxes used to answer them separately and disagreed
 * on all three, which is why the same decimal-point bug
 * had to be fixed by hand in three places. The policy
 * lives here, as plain functions, so it can be tested
 * without a DOM; only the draft state lives in the
 * components.
 * ================================================== */

import { parseAmountInput } from "./format";

/* ---------- Keystroke filter ---------- */

/** Everything a field that accepts a fraction may NOT hold */
const NOT_DECIMAL = /[^0-9.]/g;

/** Everything a whole-number field may NOT hold */
const NOT_DIGIT = /[^0-9]/g;

/**
 * The text a number box keeps while it is being typed into.
 *
 * This runs on every keystroke, so it refuses characters rather than
 * reinterpreting them: what the box shows after the strip is exactly what
 * `parseFieldValue` will read on commit, and the user can see it happen.
 *
 * The decimal point survives in `decimal` mode. Dropping it is what turned a
 * pasted "$250,000.00" into $25,000,000 - the digits either side of the point
 * were concatenated into one number a hundred times too large.
 *
 * A leading minus does NOT survive. parseAmountInput deliberately keeps one
 * so a negative amount can be REJECTED rather than silently made positive;
 * here the character never reaches the field in the first place, which is the
 * same rejection made visible one keystroke earlier. No field in the app
 * accepts a negative entry.
 */
export function sanitizeNumericText(raw: string, decimal = false): string {
  return raw.replace(decimal ? NOT_DECIMAL : NOT_DIGIT, "");
}

/* ---------- Commit ---------- */

/** How one field reads, bounds and defaults the text it holds */
export interface NumericFieldPolicy {
  /** Whether the field accepts a fraction; a whole-number field truncates one */
  decimal?: boolean;
  /** Lower bound, applied by clamping. Omitted means unbounded below. */
  min?: number;
  /** Upper bound, applied by clamping. Omitted means unbounded above. */
  max?: number;
  /**
   * What an entry holding no readable number means to THIS field: a number to
   * put in its place, or "revert" to leave the field's stored value alone.
   *
   * There is no right answer for every field, which is why it is a parameter
   * rather than a default. A cleared amount box is an empty pot ($0); a
   * cleared slider box has no empty position on the track to move to, so it
   * keeps the value it had.
   */
  fallback: number | "revert";
}

/**
 * Reads a field's text as the number it means, then bounds it.
 *
 * Out of range is CLAMPED, not rejected: a "150" typed into a percentage that
 * stops at 100 is a legible instruction to go to the top. Illegible is a
 * different case, and only the caller's `fallback` says what it means.
 *
 * A field whose fallback is a number always yields one, so this overload
 * spares those callers a "revert" branch that can never be taken.
 */
export function parseFieldValue(
  raw: string,
  policy: NumericFieldPolicy & { fallback: number },
): number;
export function parseFieldValue(
  raw: string,
  policy: NumericFieldPolicy,
): number | "revert";
export function parseFieldValue(
  raw: string,
  { decimal = false, min, max, fallback }: NumericFieldPolicy,
): number | "revert" {
  const parsed = parseAmountInput(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const value = decimal ? parsed : Math.trunc(parsed);
  return Math.min(
    max ?? Number.POSITIVE_INFINITY,
    Math.max(min ?? Number.NEGATIVE_INFINITY, value),
  );
}

/* ---------- Keyboard ---------- */

/** What a key pressed inside a number box does to the draft it holds */
export type NumericFieldKeyAction = "commit" | "revert" | "ignore";

/**
 * Enter commits the draft, Escape discards it, everything else is typing.
 *
 * Escape is the only key that throws a draft away, and it does so because the
 * user asked: every other key either keeps the draft or writes it through, so
 * nothing typed is lost by accident. Kept here rather than in each box so
 * that stays true of all of them.
 */
export function numericFieldKeyAction(key: string): NumericFieldKeyAction {
  if (key === "Enter") return "commit";
  if (key === "Escape") return "revert";
  return "ignore";
}

/* ---------- Shared policies ---------- */

/**
 * A dollar amount: cents are typed, and a box the user cleared holds nothing,
 * which is $0 rather than a refusal to change.
 *
 * Shared by the hub's Current Amount and Target Value boxes and by both of
 * the Budget panel's amount fields. Bounds belong to the control, not to the
 * money, so this carries none.
 */
export const AMOUNT_FIELD = {
  decimal: true,
  fallback: 0,
} satisfies NumericFieldPolicy;

/**
 * The policy the number box beside a slider track reads.
 *
 * A slider is two controls over one value - a track and a box - and they read
 * the same bound until a control says otherwise. The withdrawal family is
 * where they have to disagree: its track spans what THIS plan could plausibly
 * draw, which for a small opening balance is $10,000/mo, while the plan itself
 * may legitimately hold far more. Sharing the bound meant a $25,000 withdrawal
 * could be imported, and pushed in from the Budget panel, but never typed -
 * the box silently rewrote it to the end of the track.
 *
 * So `entryMax` is what may be TYPED and `max` is what the track SHOWS. It
 * only ever widens, because a bound below the track would leave the thumb able
 * to reach a figure the box then refused. It must also be no wider than what
 * SLIDER_LIMITS will store, or the box accepts a number the state layer
 * silently clamps and the user watches their entry change by itself.
 *
 * An inert control - one whose range has collapsed, which Contribution Stop
 * Year and Withdrawal Start Year both do when Years is dragged to 0 - ignores
 * `entryMax` entirely. Committing there still clamps to the REAL max, so
 * typing into one cannot smuggle in a value its range forbids; that invariant
 * belongs to the range rather than to the `disabled` attribute suppressing the
 * events.
 */
export function sliderField({
  min,
  max,
  entryMax,
}: {
  min: number;
  /** End of the track, and the default end of the box */
  max: number;
  /** Widest figure the box accepts, where the control allows one past the track */
  entryMax?: number;
}): NumericFieldPolicy {
  return {
    decimal: true,
    min,
    max: max <= min ? max : Math.max(max, entryMax ?? max),
    // A range control has no empty position to move to, so an entry that reads
    // as no number at all leaves the value where it was
    fallback: "revert",
  };
}
