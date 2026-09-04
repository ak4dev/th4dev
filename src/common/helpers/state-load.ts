/* ==================================================
 * State Load Paths
 *
 * Two things can replace the running plan: an imported
 * file and a saved scenario. They are NOT the same
 * replacement, and this is the one place that says how
 * they differ.
 *
 * They used to be two copies of the same code in two
 * components - App's file import and the calculator's own
 * scenario load - and they had already drifted apart. The
 * copies are gone; App applies whichever of these two
 * answers the path asks for.
 * ================================================== */

import { normalizeState, type NormalizedState } from "./state-manager";
import type { TH4State } from "../types/types";

/**
 * The state the session holds after loading a saved scenario.
 *
 * A snapshot carries the PLAN - theme, sliders, inputs, toggles, holdings and
 * the budget - and deliberately nothing else, so three things are carried
 * ACROSS the load rather than taken from the snapshot:
 *
 * - `scenarios`: the list the snapshot was loaded FROM. normalizeState would
 *   answer with an empty one, and applying that would delete every scenario
 *   the user has saved at the moment they opened one of them.
 * - `activePage`: loading a plan is not navigation. It would default to the
 *   calculator page, which is where the load happened anyway - until the day
 *   it is opened from somewhere else.
 * - `stock.apiUrl`: the endpoint is app configuration, not plan data, which
 *   is exactly why the snapshot does not store it. Reading it back off a
 *   normalized snapshot would replace the user's own endpoint with the
 *   default every time they opened a scenario.
 *
 * @param raw     - The snapshot, as stored
 * @param session - What the session currently holds
 * @returns The full state to apply
 */
export function scenarioLoadedState(
  raw: TH4State,
  session: NormalizedState,
): NormalizedState {
  const loaded = normalizeState(raw);
  return {
    ...loaded,
    stock: { ...loaded.stock, apiUrl: session.stock.apiUrl },
    scenarios: session.scenarios,
    activePage: session.activePage,
  };
}
