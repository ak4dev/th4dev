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
