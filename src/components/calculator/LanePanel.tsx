/* ==================================================
 * Lane Panel
 *
 * One investment lane's controls: its opening amount,
 * the sliders the current mode offers, and its target.
 *
 * Every bound comes from the LANE, not from the stored
 * slider: `lane.plan` is what is actually being
 * simulated, so a year stranded past a shortened horizon
 * is shown corrected rather than as the value nobody is
 * using.
 * ================================================== */

import {
  MAX_ANNUAL_FEE,
  MAX_MONTHLY_CONTRIBUTION,
  MAX_PROJECTED_GAIN,
  MAX_WITHDRAWAL_RATE,
  MAX_YEARS_OF_GROWTH,
  MIN_VALUE,
  laneKey,
} from "../../common/constants/app-constants";
import type {
  InputKey,
  SliderBaseKey,
  SliderKey,
} from "../../common/constants/app-constants";
import {
  isTool,
  type Lane,
  type LaneContext,
} from "../../common/helpers/lane-model";
import { PanelContainer } from "../ui/primitives";
import { CurrencyInput, HelperText, InvestmentSlider } from "./NumericInputs";
import TargetControl from "./TargetControl";

interface LanePanelProps extends LaneContext {
  lane: Lane;
  updateSlider: (key: SliderKey, val: number) => void;
  updateInput: (key: InputKey, val: string) => void;
  onTarget: (target: number) => void;
}

export default function LanePanel({
  lane,
  sliders,
  inputs,
  toggles,
  updateSlider,
  updateInput,
  onTarget,
}: LanePanelProps) {
  const { id } = lane;
  // The horizon the lane is actually simulated over, which is what every
  // dependent control has to be bounded by
  const years = lane.plan.yearsOfGrowth;
  const dynamic = lane.plan.dynamicWithdrawal;

  // `base` is one of the declared slider names, so a typo here cannot reach
  // the state map. The `?? MIN_VALUE` covers contributionStopYear, the one
  // key with no default; every call that shows it passes `value` explicitly.
  const slider = (
    base: SliderBaseKey,
    label: string,
    max: number,
    step = 1,
    value = sliders[laneKey(base, id)] ?? MIN_VALUE,
  ) => (
    <InvestmentSlider
      label={label}
      name={`Investment ${id} ${label}`}
      value={value}
      min={MIN_VALUE}
      max={max}
      step={step}
      onChange={(v) => updateSlider(laneKey(base, id), v)}
    />
  );

  return (
    <PanelContainer surface="column">
      <CurrencyInput
        name={`Investment ${id} Current Amount`}
        value={inputs[laneKey("currentAmount", id)]}
        onChange={(v) => updateInput(laneKey("currentAmount", id), v)}
        fullWidth
        align="center"
      />
      {slider("projectedGain", "Return (%)", MAX_PROJECTED_GAIN)}
      {slider("yearsOfGrowth", "Years", MAX_YEARS_OF_GROWTH, 0.5)}
      {toggles.advanced && (
        <>
          {slider(
            "monthlyContribution",
            "Monthly Contribution",
            MAX_MONTHLY_CONTRIBUTION,
          )}
          {/* Shown as the plan uses it, not as it was last stored: a year
              stranded past the horizon by a Years reduction is corrected on
              screen instead of being silently ignored */}
          {slider(
            "contributionStopYear",
            "Contribution Stop Year",
            years,
            0.5,
            lane.plan.contributionStopYear ?? years,
          )}
          {dynamic ? (
            <>
              {slider(
                "withdrawalRate",
                "Withdrawal Rate (%)",
                MAX_WITHDRAWAL_RATE,
                0.1,
                dynamic.ratePct,
              )}
              {slider(
                "withdrawalFloor",
                "Withdrawal Floor",
                lane.withdrawalMax,
                1,
                dynamic.floor,
              )}
              {slider(
                "withdrawalCeiling",
                "Withdrawal Ceiling",
                lane.withdrawalMax,
                1,
                dynamic.ceiling,
              )}
              <HelperText>
                Floor and ceiling are in today's dollars: both are indexed to
                inflation each year, so the ceiling never forces a real spending
                cut.
              </HelperText>
            </>
          ) : (
            slider(
              "monthlyWithdrawal",
              "Monthly Withdrawal",
              lane.withdrawalMax,
            )
          )}
          {slider(
            "withdrawalStartYear",
            "Withdrawal Start Year",
            years,
            0.5,
            lane.plan.withdrawalStartYear,
          )}
          {isTool(toggles, "fees") &&
            slider(
              "annualFee",
              "Annual Fee (%)",
              MAX_ANNUAL_FEE,
              0.01,
              sliders[laneKey("annualFee", id)] || 0,
            )}
        </>
      )}
      {/* Goal for the ending balance; drives whichever inputs the mode offers */}
      <TargetControl lane={lane} onTarget={onTarget} />
    </PanelContainer>
  );
}
