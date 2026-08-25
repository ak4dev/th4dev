/* ==================================================
 * Shared Input Styles
 * ================================================== */

/** Theme foreground at `pct`% opacity, so fields stay visible on light and dark themes */
const tint = (pct: number) =>
  `color-mix(in srgb, var(--colors-foreground) ${pct}%, transparent)`;

const fieldGradient = (top: number, bottom: number) =>
  `linear-gradient(180deg, ${tint(top)} 0%, ${tint(bottom)} 100%)`;

const INNER_HIGHLIGHT = `inset 0 1px 0 ${tint(8)}`;

export const compactModernInputStyles = {
  all: "unset",
  boxSizing: "border-box" as const,
  display: "block",
  width: "100%",
  minWidth: 0,
  background: fieldGradient(7, 3),
  color: "$foreground",
  border: `1px solid ${tint(18)}`,
  borderRadius: 9,
  padding: "8px 10px",
  fontSize: "0.84rem",
  fontWeight: 500,
  lineHeight: 1.2,
  fontVariantNumeric: "tabular-nums",
  appearance: "none" as const,
  MozAppearance: "textfield" as const,
  boxShadow: INNER_HIGHLIGHT,
  transition:
    "border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease",
  "&::placeholder": {
    color: "$comment",
    opacity: 0.8,
  },
  "&:hover": {
    borderColor: tint(30),
    background: fieldGradient(9, 4),
  },
  "&:focus": {
    borderColor: "$cyan",
    background: fieldGradient(10, 5),
    boxShadow: `${INNER_HIGHLIGHT}, 0 0 0 2px color-mix(in srgb, var(--colors-cyan) 18%, transparent)`,
  },
  "&::-webkit-outer-spin-button, &::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
  "&[type=number]": {
    MozAppearance: "textfield",
    appearance: "none",
  },
};
