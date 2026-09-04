/* ==================================================
 * Persistence Tests
 *
 * These are the privacy guarantees the landing page makes — "nothing is
 * stored unless you opt in" — so they are exercised against a Map-backed
 * store rather than the real localStorage: every branch, including the
 * purge that runs when consent is absent, has to be observable.
 * ================================================== */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  LEGACY_KEYS,
  STORAGE_CONSENT_KEY,
  STORAGE_KEY,
  createPersistScheduler,
  loadConsent,
  loadPersistedState,
  purgeStoredData,
  saveConsent,
  savePersistedState,
  storeOrNull,
} from "../persistence";
import type { Storeish } from "../persistence";
import { DEFAULT_STATE } from "../state-manager";

/* ==================================================
 * Fakes
 * ================================================== */

interface FakeStore extends Storeish {
  map: Map<string, string>;
}

const fakeStore = (initial: Record<string, string> = {}): FakeStore => {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
};

/** A browser with site data blocked: the methods themselves throw */
const throwingStore = (): Storeish => ({
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
});

/** The minimum shape isValidTH4State accepts */
const validState = {
  theme: "dracula",
  sliders: { projectedGainA: 7 },
  inputs: { currentAmountA: "1000" },
  toggles: {
    advanced: true,
    rollover: false,
    showInflation: false,
    portfolio: false,
  },
  budgetItems: [],
  scenarios: [],
};

/** A store holding financial data under every key this app has ever written */
const populatedStore = (consent: boolean) =>
  fakeStore({
    ...(consent ? { [STORAGE_CONSENT_KEY]: "true" } : {}),
    [STORAGE_KEY]: JSON.stringify(validState),
    [LEGACY_KEYS[0]]: "[]",
    [LEGACY_KEYS[1]]: "[]",
    unrelated_key: "not ours",
  });

afterEach(() => {
  vi.useRealTimers();
});

/* ==================================================
 * Tests
 * ================================================== */

describe("storeOrNull", () => {
  it("returns null in a runtime with no localStorage", () => {
    // The suite runs under environment "node", which has none
    expect(storeOrNull()).toBeNull();
  });

  it("returns null when merely reading localStorage throws", () => {
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("site data blocked");
      },
    });
    try {
      expect(storeOrNull()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});

describe("purgeStoredData", () => {
  it("removes the state key and both legacy keys", () => {
    const store = populatedStore(true);
    purgeStoredData(store);
    expect(store.map.has(STORAGE_KEY)).toBe(false);
    for (const key of LEGACY_KEYS) expect(store.map.has(key)).toBe(false);
  });

  it("leaves the consent preference and anything this app did not write", () => {
    const store = populatedStore(true);
    purgeStoredData(store);
    expect(store.map.get(STORAGE_CONSENT_KEY)).toBe("true");
    expect(store.map.get("unrelated_key")).toBe("not ours");
  });

  it("does nothing, and does not throw, with no usable store", () => {
    expect(() => {
      purgeStoredData(null);
    }).not.toThrow();
    expect(() => {
      purgeStoredData(throwingStore());
    }).not.toThrow();
  });
});

describe("loadConsent", () => {
  it("reports opt-in and leaves the stored data alone", () => {
    const store = populatedStore(true);
    expect(loadConsent(store)).toBe(true);
    expect(store.map.has(STORAGE_KEY)).toBe(true);
  });

  it("purges the state key and both legacy keys when consent is absent", () => {
    // The side effect is the guarantee: a visitor who never opted in must
    // leave nothing behind, including data written before opt-in existed.
    const store = populatedStore(false);
    expect(loadConsent(store)).toBe(false);
    expect(store.map.has(STORAGE_KEY)).toBe(false);
    for (const key of LEGACY_KEYS) expect(store.map.has(key)).toBe(false);
  });

  it('treats any value other than the literal "true" as no consent', () => {
    for (const value of ["1", "yes", "TRUE", "false", ""]) {
      const store = populatedStore(false);
      store.map.set(STORAGE_CONSENT_KEY, value);
      expect(loadConsent(store)).toBe(false);
      expect(store.map.has(STORAGE_KEY)).toBe(false);
    }
  });

  it("degrades to no consent when there is no store, or reading throws", () => {
    expect(loadConsent(null)).toBe(false);
    expect(loadConsent(throwingStore())).toBe(false);
  });
});

describe("saveConsent", () => {
  it("records opt-in without touching the stored data", () => {
    const store = populatedStore(false);
    saveConsent(true, store);
    expect(store.map.get(STORAGE_CONSENT_KEY)).toBe("true");
    expect(store.map.has(STORAGE_KEY)).toBe(true);
  });

  it("opting in makes a later save land", () => {
    const store = fakeStore();
    saveConsent(true, store);
    expect(loadConsent(store)).toBe(true);
    savePersistedState({ ...DEFAULT_STATE, theme: "dracula" }, store);
    expect(store.map.has(STORAGE_KEY)).toBe(true);
  });

  it("revoking removes the preference and purges the data with it", () => {
    const store = populatedStore(true);
    saveConsent(false, store);
    expect(store.map.has(STORAGE_CONSENT_KEY)).toBe(false);
    expect(store.map.has(STORAGE_KEY)).toBe(false);
    for (const key of LEGACY_KEYS) expect(store.map.has(key)).toBe(false);
  });

  it("does not throw with no usable store", () => {
    expect(() => {
      saveConsent(true, null);
    }).not.toThrow();
    expect(() => {
      saveConsent(false, throwingStore());
    }).not.toThrow();
  });
});

describe("loadPersistedState", () => {
  it("returns null when nothing has been stored", () => {
    expect(loadPersistedState("f", fakeStore())).toBeNull();
  });

  it("returns null for a malformed blob rather than throwing", () => {
    const store = fakeStore({ [STORAGE_KEY]: "{not json" });
    expect(loadPersistedState("f", store)).toBeNull();
  });

  it("returns null for well-formed JSON of the wrong shape", () => {
    const store = fakeStore({ [STORAGE_KEY]: JSON.stringify({ theme: 3 }) });
    expect(loadPersistedState("f", store)).toBeNull();
  });

  it("normalises what it loads, filling in every missing field", () => {
    const store = fakeStore({ [STORAGE_KEY]: JSON.stringify(validState) });
    const loaded = loadPersistedState("f", store);
    expect(loaded).not.toBeNull();
    expect(loaded?.theme).toBe("dracula");
    expect(loaded?.sliders["projectedGainA"]).toBe(7);
    expect(loaded?.toggles).toMatchObject({ advanced: true, rollover: false });
    expect(loaded?.stock.apiUrl).toBe(DEFAULT_STATE.stock.apiUrl);
  });

  it("falls back to the routed default page for records that predate activePage", () => {
    const store = fakeStore({ [STORAGE_KEY]: JSON.stringify(validState) });
    expect(loadPersistedState("landing", store)?.activePage).toBe("landing");
  });

  it("lets a remembered page beat the default", () => {
    const store = fakeStore({
      [STORAGE_KEY]: JSON.stringify({ ...validState, activePage: "f" }),
    });
    expect(loadPersistedState("landing", store)?.activePage).toBe("f");
  });

  it("migrates the pre-nesting { stockApiUrl, stockHoldings } shape", () => {
    const store = fakeStore({
      [STORAGE_KEY]: JSON.stringify({
        ...validState,
        stockApiUrl: "https://example.test/quotes",
        stockHoldings: [{ symbol: "vas", allocationPct: 100 }],
      }),
    });
    const loaded = loadPersistedState("f", store);
    expect(loaded?.stock.apiUrl).toBe("https://example.test/quotes");
    expect(loaded?.stock.holdings).toHaveLength(1);
    expect(loaded?.stock.holdings[0]?.symbol).toBe("VAS");
  });

  it("degrades to null when there is no store, or reading throws", () => {
    expect(loadPersistedState("f", null)).toBeNull();
    expect(loadPersistedState("f", throwingStore())).toBeNull();
  });
});

describe("savePersistedState", () => {
  it("round-trips through the store", () => {
    const store = fakeStore();
    savePersistedState({ ...DEFAULT_STATE, activePage: "f" }, store);
    expect(loadPersistedState("f", store)?.activePage).toBe("f");
  });

  it("does not throw when the store is missing or full", () => {
    expect(() => {
      savePersistedState(DEFAULT_STATE, null);
    }).not.toThrow();
    expect(() => {
      savePersistedState(DEFAULT_STATE, throwingStore());
    }).not.toThrow();
  });
});

describe("createPersistScheduler", () => {
  const setup = (allowed = true, delay?: number) => {
    vi.useFakeTimers();
    const write = vi.fn();
    const isAllowed = vi.fn(() => allowed);
    const scheduler = createPersistScheduler<string>(
      delay === undefined ? { write, isAllowed } : { write, isAllowed, delay },
    );
    return { write, isAllowed, scheduler };
  };

  it("coalesces a burst into exactly one write, keeping the last value", () => {
    const { write, scheduler } = setup();
    for (const value of ["a", "b", "c", "d"]) scheduler.schedule(value);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("d");
  });

  it("restarts the window on every schedule, so a drag writes once at the end", () => {
    const { write, scheduler } = setup();
    scheduler.schedule("a");
    vi.advanceTimersByTime(200);
    scheduler.schedule("b");
    vi.advanceTimersByTime(200);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("b");
  });

  it("writes again for the next burst", () => {
    const { write, scheduler } = setup();
    scheduler.schedule("a");
    vi.advanceTimersByTime(300);
    scheduler.schedule("b");
    vi.advanceTimersByTime(300);
    expect(write.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("honours a custom delay", () => {
    const { write, scheduler } = setup(true, 1000);
    scheduler.schedule("a");
    vi.advanceTimersByTime(999);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flush() writes the queued value immediately, and only once", () => {
    const { write, scheduler } = setup();
    scheduler.schedule("a");
    scheduler.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("a");
    // The pending timer must not fire a second write on top of the flush
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flush() with nothing queued writes nothing", () => {
    const { write, scheduler } = setup();
    scheduler.flush();
    scheduler.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("cancel() means the queued write never lands", () => {
    // This is the consent-revocation path: without it, a debounce leaks one
    // more write past the purge that revoking just performed.
    const { write, scheduler } = setup();
    scheduler.schedule("secret");
    scheduler.cancel();
    vi.advanceTimersByTime(10_000);
    scheduler.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("drops the write when consent has gone by the time the timer fires", () => {
    let allowed = true;
    vi.useFakeTimers();
    const write = vi.fn();
    const scheduler = createPersistScheduler<string>({
      write,
      isAllowed: () => allowed,
    });
    scheduler.schedule("a");
    allowed = false;
    vi.advanceTimersByTime(300);
    expect(write).not.toHaveBeenCalled();
  });

  it("consults consent at write time, not at schedule time", () => {
    let allowed = false;
    vi.useFakeTimers();
    const write = vi.fn();
    const scheduler = createPersistScheduler<string>({
      write,
      isAllowed: () => allowed,
    });
    scheduler.schedule("a");
    allowed = true;
    vi.advanceTimersByTime(300);
    expect(write).toHaveBeenCalledWith("a");
  });

  it("does not re-check consent when there is nothing queued", () => {
    const { isAllowed, scheduler } = setup();
    scheduler.flush();
    expect(isAllowed).not.toHaveBeenCalled();
  });
});
