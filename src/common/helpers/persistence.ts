/* ==================================================
 * State Persistence (opt-in)
 *
 * Nothing here touches storage unless it is handed one.  The store is a
 * defaulted parameter rather than a module-scope binding so every function
 * is testable against a fake, and so a browser that blocks site data (or a
 * non-browser runtime that has no localStorage at all) degrades to "no
 * storage" instead of throwing on import.
 * ================================================== */

import { isValidTH4State, normalizeState } from "./state-manager";
import type { NormalizedState } from "./state-manager";
import type { TH4State } from "../types/types";

/* ==================================================
 * Keys
 * ================================================== */

export const STORAGE_KEY = "th4_app_state";
/** Stores only the user's consent preference — not financial data */
export const STORAGE_CONSENT_KEY = "th4_localstorage_enabled";
/** Standalone keys written by older builds before persistence was opt-in */
export const LEGACY_KEYS = ["th4_budget", "th4_scenarios"];

/* ==================================================
 * Store access
 * ================================================== */

/** The slice of the Storage API this module uses */
export type Storeish = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * The live localStorage, or null when there isn't one.  Reading the property
 * itself throws in a sandboxed frame and in browsers configured to block site
 * data, so the access is inside the try, not just the calls that follow it.
 */
export function storeOrNull(): Storeish | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/* ==================================================
 * Consent
 * ================================================== */

/** Removes every key this app may have written, current and legacy */
export function purgeStoredData(store: Storeish | null = storeOrNull()): void {
  if (!store) return;
  try {
    for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) store.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Reads the consent flag — and, when consent is absent, purges.  The purge is
 * the point as much as the answer is: it is what guarantees that a visitor who
 * never opted in (or who revoked from another tab) leaves nothing behind,
 * including data written by builds that predate the opt-in.
 */
export function loadConsent(store: Storeish | null = storeOrNull()): boolean {
  if (!store) return false;
  try {
    const enabled = store.getItem(STORAGE_CONSENT_KEY) === "true";
    // Without opt-in nothing may remain in storage, including pre-consent legacy data
    if (!enabled) purgeStoredData(store);
    return enabled;
  } catch {
    return false;
  }
}

export function saveConsent(
  enabled: boolean,
  store: Storeish | null = storeOrNull(),
): void {
  if (!store) return;
  try {
    if (enabled) {
      store.setItem(STORAGE_CONSENT_KEY, "true");
    } else {
      store.removeItem(STORAGE_CONSENT_KEY);
      purgeStoredData(store);
    }
  } catch {
    // ignore
  }
}

/* ==================================================
 * State
 * ================================================== */

/**
 * Hydrates the persisted TH4State through the same guard and normaliser as
 * a file import, so stale or corrupt entries fall back to defaults.
 * `defaultPage` fills in for records that predate activePage.
 *
 * Old shapes (including the pre-nesting { stockApiUrl, stockHoldings }) are
 * migrated inside normalizeState, so this path and a file import of the same
 * JSON behave identically.
 */
export function loadPersistedState(
  defaultPage: string,
  store: Storeish | null = storeOrNull(),
): NormalizedState | null {
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!isValidTH4State(parsed)) return null;
    return normalizeState({
      ...parsed,
      activePage: parsed.activePage ?? defaultPage,
    });
  } catch {
    return null;
  }
}

export function savePersistedState(
  state: TH4State,
  store: Storeish | null = storeOrNull(),
): void {
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/* ==================================================
 * Write scheduling
 * ================================================== */

export interface PersistScheduler<T> {
  /** Queues `value`, replacing anything already queued, and (re)arms the timer */
  schedule(value: T): void;
  /** Writes the queued value now, if there is one and it is still allowed */
  flush(): void;
  /** Drops the queued value without writing it */
  cancel(): void;
}

export interface PersistSchedulerOptions<T> {
  write: (value: T) => void;
  /**
   * Re-checked at write time, not at schedule time: consent can be withdrawn
   * (here or in another tab) during the coalescing window.
   */
  isAllowed: () => boolean;
  /** Coalescing window in milliseconds */
  delay?: number;
}

/**
 * Coalesces a burst of state changes into a single write.
 *
 * Serialising the whole state costs real time — up to twenty scenario
 * snapshots, each a full TH4State — and a slider drag or a keystroke run
 * produces one change per frame.  Without this the app JSON-stringifies and
 * writes to disk on the same main thread that is running the simulation.
 *
 * `cancel()` is not an optimisation: without it, revoking consent still lets
 * one already-queued write land after the purge.
 */
export function createPersistScheduler<T>({
  write,
  isAllowed,
  delay = 300,
}: PersistSchedulerOptions<T>): PersistScheduler<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Boxed so that a legitimately undefined/null value is still "queued" */
  let queued: { value: T } | null = null;

  const disarm = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const commit = (): void => {
    disarm();
    if (!queued) return;
    const { value } = queued;
    queued = null;
    if (!isAllowed()) return;
    write(value);
  };

  return {
    schedule(value: T): void {
      queued = { value };
      // Trailing debounce: a continuous drag writes once, when it settles
      disarm();
      timer = setTimeout(commit, delay);
    },
    flush: commit,
    cancel(): void {
      disarm();
      queued = null;
    },
  };
}
