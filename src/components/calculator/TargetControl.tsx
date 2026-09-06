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
 * The goal is stored as entered. In advanced mode with fixed withdrawals
 * `onTarget` also solves the monthly withdrawal that reaches it (see
 * targetSolvesWithdrawal); in every other mode it is a marker alone. It never
 * moves the return, the contribution or any other slider.
 *
 * The slider spans the lane's own reachable range, so the thumb is pinned to
 * the end of the track for a goal typed above it; the box still shows the
 * goal itself.
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
