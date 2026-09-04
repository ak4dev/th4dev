/* ==================================================
 * Shared Number Formatters
 * ================================================== */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/**
 * Formats a whole-dollar amount, e.g. 1234.5 -> "$1,235".
 * Non-finite values (e.g. a FIRE number with a 0% SWR) render as "N/A".
 */
export function formatCurrency(n: number): string {
  if (!Number.isFinite(n)) return "N/A";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Formats a price with cents, e.g. 1234.5 -> "$1,234.50". */
export function formatPrice(n: number): string {
  return usdFormatter.format(n);
}

/** Formats a percentage with an explicit sign, e.g. 12.34 -> "+12.3%". */
export function formatSignedPercent(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/* ---------- Amount parsing ---------- */

/*
 * Lives beside the formatters, not in state-manager, because the growth engine
 * needs it too and must not depend on the persistence layer.
 */

/**
 * Everything a money field may legitimately hold; a currency symbol, a
 * thousands separator or a stray letter is decoration. A minus sign survives
 * so a negative amount stays negative and can be REJECTED by the caller:
 * stripping it would silently turn "-500" into a $500 plan.
 */
const NOT_NUMERIC = /[^0-9.-]/g;

/**
 * Reads a money string — typed, pasted or imported — as the number it means.
 *
 * Stripping the decimal point rather than keeping it is what turned a pasted
 * "$250,000.00" into 25,000,000: the digits either side of the point were
 * concatenated into one number a hundred times too large.  Keeping the point
 * and parsing with parseFloat reads the amount the user is looking at, and a
 * second point ("1.2.3") ends the number instead of corrupting it.
 *
 * Returns NaN when the text holds no number at all, so each caller decides
 * what an unreadable amount means — a blank box in one place, a $0 plan in
 * another — rather than every caller inventing its own zero. A negative
 * amount is returned as negative rather than silently made positive.
 */
export function parseAmountInput(text: string): number {
  return parseFloat(text.replace(NOT_NUMERIC, ""));
}
