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
 *
 * The withdrawal family is the one place a control has
 * two bounds rather than one. Its track is the lane's
 * span, as above; its BOX reaches the sanity limit, so a
 * plan that draws more than a lane of this size normally
 * would can still be typed. See withdrawalSlider.
 * ================================================== */

import {
  MAX_ANNUAL_FEE,
  MAX_WITHDRAWAL_TAX,
  MAX_MONTHLY_CONTRIBUTION,
  MAX_MONTHLY_WITHDRAWAL_LIMIT,
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
    entryMax?: number,
  ) => (
    <InvestmentSlider
      label={label}
      name={`Investment ${id} ${label}`}
      value={value}
      min={MIN_VALUE}
      max={max}
      step={step}
      entryMax={entryMax}
      onChange={(v) => updateSlider(laneKey(base, id), v)}
    />
  );

  /**
   * The three withdrawal controls, which are the only ones whose box outruns
   * their track.
   *
   * The track is `lane.withdrawalMax` - the most this plan could plausibly
   * draw - because a $2,000 withdrawal on a track that ran to the sanity limit
   * would sit at 0.2% of it and every drag would be a demand for a different
   * plan. But that span bottoms out at $10,000/mo, and a plan may hold far
   * more: SLIDER_LIMITS stores these three keys up to
   * MAX_MONTHLY_WITHDRAWAL_LIMIT, the Budget panel already writes figures
   * above the span through "Set Withdrawal", and an imported plan keeps them.
   * Only the box refused, which made a $25,000 withdrawal something a user
   * could own but not type.
   *
   * So the box takes the sanity limit and the track re-spans around whatever
   * is entered: buildLane's withdrawalMax reads all three stored figures, so
   * typing $25,000 widens the track to $25,000 in the same commit, and
   * dragging back down to $5,000 relaxes it to $10,000 again.
   */
  const withdrawalSlider = (
    base: SliderBaseKey,
    label: string,
    value = sliders[laneKey(base, id)] ?? MIN_VALUE,
  ) =>
    slider(
      base,
      label,
      lane.withdrawalMax,
      1,
      value,
      MAX_MONTHLY_WITHDRAWAL_LIMIT,
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
              {withdrawalSlider(
                "withdrawalFloor",
                "Withdrawal Floor",
                dynamic.floor,
              )}
              {withdrawalSlider(
                "withdrawalCeiling",
                "Withdrawal Ceiling",
                dynamic.ceiling,
              )}
              <HelperText>
                Floor and ceiling are in today's dollars: both are indexed to
                inflation each year, so the ceiling never forces a real spending
                cut. Each track spans what this plan could plausibly draw — type
                a larger figure into either box and the tracks grow to fit it.
              </HelperText>
            </>
          ) : (
            <>
              {withdrawalSlider("monthlyWithdrawal", "Monthly Withdrawal")}
              <HelperText>
                The track spans what this plan could plausibly draw — type a
                larger figure into the box and it grows to fit it.
              </HelperText>
            </>
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
          {isTool(toggles, "taxes") && (
            <>
              {slider(
                "withdrawalTax",
                "Withdrawal Tax (%)",
                MAX_WITHDRAWAL_TAX,
                1,
                sliders[laneKey("withdrawalTax", id)] || 0,
              )}
              <HelperText>
                One flat effective rate on every dollar drawn — not brackets,
                cost basis or account type. With it on, the withdrawal figures
                above are what you get to SPEND, and the plan sells{" "}
                {`spending ÷ (1 − rate)`} to deliver it. A percentage-of-balance
                rate stays a draw on the balance; its floor and ceiling are
                spending, so they are grossed up like the fixed figure.
              </HelperText>
            </>
          )}
        </>
      )}
      {/* Goal for the ending balance; in advanced fixed-withdrawal mode it also
          solves the monthly withdrawal (see targetSolvesWithdrawal) */}
      <TargetControl lane={lane} onTarget={onTarget} />
    </PanelContainer>
  );
}
