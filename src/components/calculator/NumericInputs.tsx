/* ==================================================
 * Calculator Input Controls
 *
 * The three controls every calculator panel is built
 * from - a money box, a slider with a number beside it,
 * and a labelled switch - and the styled elements they
 * are made of.
 *
 * All three are spinner-free text boxes (type="text"
 * with an inputMode) holding a draft through
 * useDraftField, and all three read their policy from
 * numeric-field.ts. None of them knows what a lane or a
 * plan is: they take a value and hand one back.
 * ================================================== */

import { useId } from "react";
import type { ReactNode } from "react";
import * as Switch from "@radix-ui/react-switch";
import { styled } from "../../../stitches.config";
import { compactModernInputStyles } from "../../common/constants/input-styles";
import { parseAmountInput } from "../../common/helpers/format";
import {
  AMOUNT_FIELD,
  sanitizeNumericText,
} from "../../common/helpers/numeric-field";
import { useDraftField } from "../../common/hooks/useDraftField";
import {
  SliderRoot,
  SliderTrack,
  SliderRange,
  SliderThumb,
} from "../ui/primitives";

/* ---------------- Styles ---------------- */

const Label = styled("label", {
  fontSize: "0.875rem",
  color: "$comment",
  fontWeight: 500,
});
const InputField = styled("input", {
  ...compactModernInputStyles,
  width: "24%",
  minWidth: "74px",
  maxWidth: "144px",
  variants: {
    align: {
      left: { textAlign: "left" },
      center: { textAlign: "center" },
      right: { textAlign: "right" },
    },
  },
  defaultVariants: {
    align: "right",
  },
});
const FullWidthInputField = styled(InputField, {
  display: "block",
  width: "100%",
  minWidth: 0,
  maxWidth: "none",
  alignSelf: "stretch",
});
/** One control: its number box on the left, its track filling the rest */
export const SliderControlRow = styled("div", {
  display: "flex",
  gap: "10px",
  alignItems: "flex-end",
});
export const SliderInputGroup = styled("div", {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  flexShrink: 0,
  minWidth: 0,
  variants: {
    size: {
      default: { width: "24%", minWidth: "78px" },
      narrow: { width: "19%", minWidth: "62px" },
    },
  },
  defaultVariants: { size: "default" },
});
export const SliderInlineLabel = styled("label", {
  fontSize: "0.7rem",
  color: "$comment",
  fontWeight: 500,
  whiteSpace: "nowrap",
});
/** The caption a control or a panel explains itself with */
export const HelperText = styled("p", {
  margin: 0,
  fontSize: "0.7rem",
  lineHeight: 1.4,
  color: "$comment",
});
export const SliderValueInput = styled("input", {
  ...compactModernInputStyles,
  width: "100%",
  minWidth: 0,
  maxWidth: "none",
  variants: {
    align: {
      left: { textAlign: "left" },
      right: { textAlign: "right" },
    },
  },
  defaultVariants: {
    align: "right",
  },
});
const SwitchRoot = styled(Switch.Root, {
  all: "unset",
  width: 42,
  height: 24,
  backgroundColor: "$comment",
  borderRadius: "9999px",
  position: "relative",
  cursor: "pointer",
  "&[data-state='checked']": { backgroundColor: "$purple" },
});
const SwitchThumb = styled(Switch.Thumb, {
  display: "block",
  width: 20,
  height: 20,
  backgroundColor: "$foreground",
  borderRadius: "9999px",
  transition: "transform 0.2s",
  transform: "translateX(2px)",
  "[data-state='checked'] &": { transform: "translateX(20px)" },
});
const SwitchRow = styled("div", {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "12px",
  alignItems: "center",
  minWidth: 0,
});

/** The row's first column: the switch's own label, plus any read-only detail */
const LabelCell = styled("span", {
  display: "flex",
  alignItems: "baseline",
  gap: "6px",
  minWidth: 0,
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "$comment",
});

/* ---------------- Controls ---------------- */

/** Longest amount the box accepts; 12 digits is a trillion dollars, and a longer one only overflows the model */
export const AMOUNT_MAX_LENGTH = 12;

export function CurrencyInput({
  value,
  onChange,
  name,
  placeholder,
  fullWidth = false,
  align = "right",
}: {
  value?: string;
  onChange: (v: string) => void;
  /** Accessible name; the box carries no visible label of its own */
  name: string;
  placeholder?: string;
  fullWidth?: boolean;
  align?: "left" | "center" | "right";
}) {
  // An amount that cannot be read as a number at all (a hand-edited import)
  // shows an empty box rather than "$NaN": the field says it has nothing,
  // which is true, instead of naming a value that does not exist.
  const amount = parseAmountInput(value ?? "");
  const field = useDraftField({
    display: Number.isFinite(amount) ? `$${amount.toLocaleString()}` : "",
    policy: AMOUNT_FIELD,
    // Amounts are held as whole dollars, so cents round rather than shifting
    // the number by a factor of a hundred
    commit: (v) => onChange(String(Math.round(v))),
    // The formatted display is unpickable as a draft, so editing starts from
    // the stored amount with its decoration removed
    seed: () => sanitizeNumericText(value ?? "", AMOUNT_FIELD.decimal),
  });

  const InputComponent = fullWidth ? FullWidthInputField : InputField;

  return (
    <InputComponent
      align={align}
      type="text"
      inputMode="numeric"
      aria-label={name}
      maxLength={AMOUNT_MAX_LENGTH}
      placeholder={placeholder}
      {...field}
    />
  );
}

export function InvestmentSlider({
  label,
  name = label,
  value,
  min,
  max,
  step = 1,
  onChange,
  inputAlign = "right",
  inputGroupSize = "default",
}: {
  label: string;
  /** Accessible name; distinguishes identically labelled A/B controls */
  name?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  inputAlign?: "left" | "right";
  inputGroupSize?: "default" | "narrow";
}) {
  const numericValue = Number.isFinite(value) ? value : 0;

  // A control whose range has collapsed (Contribution Stop Year and
  // Withdrawal Start Year both take their max from a Years slider that can
  // be dragged to 0) has nothing to offer, so it leaves the tab order
  // instead of sitting there dead. The track still needs a non-zero span:
  // Radix scales the thumb by 100/(max - min) and wrote `right:NaN%` into
  // the rendered style attribute when that divided by zero. Committing still
  // clamps to the REAL max, so typing into an inert control cannot smuggle
  // in a value the range forbids.
  const inert = max <= min;
  const sliderMax = Math.max(max, min + step);

  // Typing is free (decimals like "10.5" included) and the value is clamped
  // to the control's own range when it commits. An entry that reads as no
  // number at all leaves the slider where it was: a range control has no
  // empty position to move to, so there is nothing else it could mean.
  const field = useDraftField({
    display: String(numericValue),
    policy: { decimal: true, min, max, fallback: "revert" },
    commit: onChange,
  });

  return (
    <SliderControlRow>
      <SliderInputGroup size={inputGroupSize}>
        <SliderInlineLabel>{label}</SliderInlineLabel>
        <SliderValueInput
          align={inputAlign}
          type="text"
          inputMode="decimal"
          aria-label={name}
          disabled={inert}
          {...field}
        />
      </SliderInputGroup>
      <SliderRoot
        value={[numericValue]}
        min={min}
        max={sliderMax}
        step={step}
        disabled={inert}
        onValueChange={(val) => onChange(val[0])}
      >
        <SliderTrack>
          <SliderRange />
        </SliderTrack>
        <SliderThumb aria-label={`${name} slider`} />
      </SliderRoot>
    </SliderControlRow>
  );
}

/**
 * One labelled switch, label and control together.
 *
 * The visible text is a real `<label htmlFor>` on the switch — Radix renders
 * the switch as a `<button>`, which is a labelable element — so clicking the
 * words toggles the control and the accessible name is the name on screen
 * instead of a second copy of it that can drift out of step.
 */
export function ToggleSwitch({
  label,
  checked,
  onCheckedChange,
  suffix,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  /** Read-only detail beside the label, outside it so it is not part of the name */
  suffix?: ReactNode;
}) {
  const id = useId();
  return (
    <SwitchRow>
      <LabelCell>
        <Label htmlFor={id}>{label}:</Label>
        {suffix}
      </LabelCell>
      <SwitchRoot id={id} checked={checked} onCheckedChange={onCheckedChange}>
        <SwitchThumb />
      </SwitchRoot>
    </SwitchRow>
  );
}
