import { useMemo } from "react";

/**
 * Returns a value whose identity only changes when its JSON form does.
 *
 * A React hook, so it lives with the hooks rather than beside the pure
 * Monte Carlo wiring it was written for: everything downstream of an
 * expensive memo depends on the input's identity standing still, and only a
 * component can hold that identity across renders.
 */
export function useJsonMemo<T>(value: T): T {
  const json = JSON.stringify(value);
  return useMemo(() => JSON.parse(json) as T, [json]);
}
