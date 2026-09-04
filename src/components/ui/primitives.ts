/* ==================================================
 * Shared Styled Primitives
 *
 * Panel chrome, dialog scaffolding and buttons that
 * are reused across feature panels and modals.
 * ================================================== */

import * as Dialog from "@radix-ui/react-dialog";
import * as Slider from "@radix-ui/react-slider";
import { styled, keyframes } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";

/* ---------- Panel chrome ---------- */

/**
 * Every panel surface in the app: the same colour, corner and padding, in the
 * three arrangements the layout actually asks for.
 *
 * The differences are variants rather than three copies because they are
 * deliberate. Collapsing them into one shared panel would restyle three
 * surfaces at once - a lost box shadow or a stray top margin ships green,
 * since nothing in the suite asserts a style.
 */
export const PanelContainer = styled("div", {
  backgroundColor: "$currentLine",
  borderRadius: "12px",
  padding: "20px",
  variants: {
    surface: {
      /** Free-standing panel down the page: spaced from what precedes it, lifted off the page */
      section: {
        marginTop: "24px",
        boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
      },
      /** A cell of the calculator grid: the grid supplies the spacing, the panel stacks its own rows */
      column: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
      },
      /** Full-width section that stacks its own rows and sits flat, its charts carrying the depth */
      stack: {
        marginTop: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      },
    },
  },
  defaultVariants: { surface: "section" },
});

export const PanelTitle = styled("h4", {
  margin: 0,
  marginBottom: "16px",
  fontSize: "0.95rem",
  fontWeight: 600,
  color: "$cyan",
  display: "flex",
  alignItems: "center",
  gap: "8px",
});

export const CountLabel = styled("span", {
  fontSize: "0.72rem",
  color: "$comment",
  fontWeight: 400,
});

export const Separator = styled("hr", {
  border: "none",
  borderTop: "1px solid $comment",
  opacity: 0.2,
  margin: "14px 0",
});

export const EmptyMessage = styled("p", {
  fontSize: "0.82rem",
  color: "$comment",
  textAlign: "center",
  padding: "20px 0",
  margin: 0,
});

export const PanelButton = styled("button", {
  borderRadius: "6px",
  border: "none",
  padding: "8px 14px",
  fontSize: "0.8rem",
  fontWeight: 600,
  cursor: "pointer",
  transition: "opacity 0.15s",
  "&:hover": { opacity: 0.85 },
  "&:disabled": { opacity: 0.4, cursor: "not-allowed" },
  color: "$background",
  variants: {
    color: {
      cyan: { backgroundColor: "$cyan" },
      green: { backgroundColor: "$green" },
      red: { backgroundColor: "$red" },
      muted: { backgroundColor: "$comment" },
    },
    size: {
      sm: { padding: "4px 10px", fontSize: "0.72rem" },
      md: { padding: "8px 14px", fontSize: "0.8rem" },
    },
  },
  defaultVariants: { color: "cyan", size: "md" },
});

/* ---------- Range slider ---------- */

/*
 * The Radix slider parts, at the two sizes the app draws them: `md` in the
 * calculator's control rows and `sm` in the budget list, where a slider sits
 * inside a table row and has to stay out of the way of the text beside it.
 *
 * Every number here is the one the two copies already used. A size is a
 * variant rather than a second set of components so that a theme change lands
 * on both, and so the sizes stay two deliberate choices rather than drifting
 * into two accidents.
 */

export const SliderRoot = styled(Slider.Root, {
  position: "relative",
  display: "flex",
  alignItems: "center",
  flex: 1,
  minWidth: 0,
  variants: {
    size: {
      // Bottom-aligned with the labelled input beside it, which is taller
      md: { height: "24px", alignSelf: "flex-end", marginBottom: "4px" },
      sm: { height: "20px" },
    },
  },
  defaultVariants: { size: "md" },
});

export const SliderTrack = styled(Slider.Track, {
  backgroundColor: "$cyan",
  position: "relative",
  flexGrow: 1,
  borderRadius: "9999px",
  variants: {
    size: {
      md: { height: "6px" },
      sm: { height: "4px" },
    },
  },
  defaultVariants: { size: "md" },
});

export const SliderRange = styled(Slider.Range, {
  position: "absolute",
  backgroundColor: "$green",
  height: "100%",
  borderRadius: "9999px",
});

export const SliderThumb = styled(Slider.Thumb, {
  borderRadius: "50%",
  backgroundColor: "$green",
  variants: {
    size: {
      md: { width: 20, height: 20, boxShadow: "0 3px 8px rgba(0,0,0,0.3)" },
      sm: { width: 14, height: 14, boxShadow: "0 2px 6px rgba(0,0,0,0.3)" },
    },
  },
  defaultVariants: { size: "md" },
});

/* ---------- Chart chrome ---------- */

/*
 * Recharts takes its tooltip chrome as inline style objects rather than
 * classes, so this is the one piece of the theme that cannot be a styled
 * component: it reads the same tokens through their CSS variables. Both
 * charts share it, because a tooltip that matches the panel in one chart and
 * not the other is a bug nobody would think to look for.
 */

export const CHART_TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "var(--colors-currentLine)",
  border: "1px solid var(--colors-foreground)",
  color: "var(--colors-foreground)",
  borderRadius: 6,
  fontSize: 12,
} as const;

export const CHART_TOOLTIP_ITEM_STYLE = {
  color: "var(--colors-foreground)",
} as const;

/* ---------- Dialog scaffolding ---------- */

export const overlayShow = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

export const contentShow = keyframes({
  from: { opacity: 0, transform: "translate(-50%, -52%) scale(0.96)" },
  to: { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
});

export const DialogOverlay = styled(Dialog.Overlay, {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  animation: `${String(overlayShow)} 150ms ease`,
  zIndex: 100,
});

export const DialogContent = styled(Dialog.Content, {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(560px, 90vw)",
  backgroundColor: "$background",
  border: "1px solid $currentLine",
  borderRadius: 8,
  padding: "1.5rem",
  animation: `${String(contentShow)} 150ms ease`,
  zIndex: 101,
  "&:focus": { outline: "none" },
  variants: {
    size: {
      sm: { width: "min(380px, 90vw)" },
      // Scrolling shell for content that brings its own chrome. Width hugs
      // that content: any excess is transparent but still inside the content
      // box, so clicks there would not dismiss the dialog.
      lg: {
        width: "fit-content",
        maxWidth: "95vw",
        maxHeight: "90vh",
        overflowY: "auto",
        backgroundColor: "transparent",
        border: "none",
        padding: 0,
      },
    },
  },
});

export const DialogTitle = styled(Dialog.Title, {
  margin: 0,
  marginBottom: "1.25rem",
  fontSize: "1rem",
  fontWeight: 600,
  color: "$foreground",
});

export const DialogCloseButton = styled(Dialog.Close, {
  all: "unset",
  position: "absolute",
  top: "0.75rem",
  right: "0.75rem",
  cursor: "pointer",
  color: "$comment",
  display: "flex",
  "&:hover": { color: "$foreground" },
});

export const DialogLabel = styled("label", {
  display: "block",
  fontSize: "0.75rem",
  color: "$comment",
  marginBottom: "0.25rem",
  userSelect: "none",
});

export const DialogInput = styled("input", {
  ...compactModernInputStyles,
  borderRadius: 7,
  padding: "0.5rem 0.7rem",
  marginBottom: "1rem",
});

/* ---------- Buttons & text ---------- */

export const ActionButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  backgroundColor: "$purple",
  color: "$background",
  padding: "0.5rem 1rem",
  borderRadius: 5,
  fontSize: "0.875rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
  "&:hover": { opacity: 0.85 },
  "&:disabled": { opacity: 0.4, cursor: "not-allowed" },
  variants: {
    size: {
      sm: { padding: "6px 14px", fontSize: "0.8rem" },
    },
  },
});

export const SecondaryButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  backgroundColor: "$currentLine",
  color: "$foreground",
  padding: "0.5rem 0.75rem",
  borderRadius: 5,
  fontSize: "0.875rem",
  whiteSpace: "nowrap",
  "&:hover": { opacity: 0.85 },
});

export const IconButton = styled("button", {
  all: "unset",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  color: "$comment",
  "&:hover": { color: "$red" },
  // `all: unset` sets outline-style to `none` as an author declaration, which
  // beats the user agent's :focus-visible ring, so a keyboard user gets no
  // indication of where they are. Restore one explicitly for every icon
  // button rather than per call site.
  "&:focus-visible": {
    outline: "2px solid $colors$cyan",
    outlineOffset: 2,
    borderRadius: 2,
  },
});

export const ErrorText = styled("p", {
  color: "$red",
  fontSize: "0.75rem",
  margin: 0,
});
