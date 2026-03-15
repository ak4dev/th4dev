/* ==================================================
 * Shared Input Styles
 * ================================================== */

export const compactModernInputStyles = {
  all: "unset",
  boxSizing: "border-box" as const,
  display: "block",
  width: "100%",
  minWidth: 0,
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)",
  color: "$foreground",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 9,
  padding: "8px 10px",
  fontSize: "0.84rem",
  fontWeight: 500,
  lineHeight: 1.2,
  fontVariantNumeric: "tabular-nums",
  appearance: "none" as const,
  MozAppearance: "textfield" as const,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
  transition: "border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease",
  "&::placeholder": {
    color: "$comment",
    opacity: 0.8,
  },
  "&:hover": {
    borderColor: "rgba(255,255,255,0.3)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 100%)",
  },
  "&:focus": {
    borderColor: "$cyan",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 2px rgba(139,233,253,0.18)",
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
