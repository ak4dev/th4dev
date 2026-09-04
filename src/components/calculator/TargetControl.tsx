/* ==================================================
 * Target Value Control
 * ================================================== */

import { AMOUNT_FIELD } from "../../common/helpers/numeric-field";
import { useDraftField } from "../../common/hooks/useDraftField";
import type { Lane } from "../../common/helpers/lane-model";
import {
  AMOUNT_MAX_LENGTH,
  SliderControlRow,
  SliderInlineLabel,
  SliderInputGroup,
  SliderValueInput,
} from "./NumericInputs";
import {
  SliderRoot,
  SliderTrack,
  SliderRange,
  SliderThumb,
} from "../ui/primitives";

/**
 * Goal for one lane's ending balance, in the units that lane is displayed in.
 *
 * Setting it does not just store a number: `onTarget` runs the solver, which
 * moves whichever inputs the current mode offers (see targetLevers) and
 * stores the balance the solved plan actually reaches.
 */
export default function TargetControl({
  lane,
  onTarget,
}: {
  lane: Lane;
  onTarget: (target: number) => void;
}) {
  const name = `Investment ${lane.id} Target Value`;

  const field = useDraftField({
    display: lane.displayTarget ? String(lane.displayTarget) : "",
    // The same policy the Current Amount box reads: whole dollars, and a
    // pasted "$250,000.00" is a quarter of a million, not twenty-five
    // million. A cleared box is a cleared goal, which solveTarget reads as 0.
    policy: AMOUNT_FIELD,
    commit: (v) => onTarget(Math.round(v)),
  });

  return (
    <SliderControlRow>
      <SliderInputGroup>
        <SliderInlineLabel>Target Value</SliderInlineLabel>
        <SliderValueInput
          type="text"
          inputMode="numeric"
          aria-label={name}
          maxLength={AMOUNT_MAX_LENGTH}
          {...field}
        />
      </SliderInputGroup>
      <SliderRoot
        value={[Math.min(lane.displayTarget, lane.maxTarget)]}
        min={0}
        max={lane.maxTarget}
        step={lane.targetStep}
        onValueChange={(val) => onTarget(val[0])}
      >
        <SliderTrack>
          <SliderRange />
        </SliderTrack>
        <SliderThumb aria-label={`${name} slider`} />
      </SliderRoot>
    </SliderControlRow>
  );
}
