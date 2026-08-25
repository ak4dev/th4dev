/* ==================================================
 * Shared Styled Primitives
 *
 * Panel chrome, dialog scaffolding and buttons that
 * are reused across feature panels and modals.
 * ================================================== */

import * as Dialog from "@radix-ui/react-dialog";
import { styled, keyframes } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";

/* ---------- Panel chrome ---------- */

export const PanelContainer = styled("div", {
  backgroundColor: "$currentLine",
  borderRadius: "12px",
  padding: "20px",
  marginTop: "24px",
  boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
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
});

export const ErrorText = styled("p", {
  color: "$red",
  fontSize: "0.75rem",
  margin: 0,
});
