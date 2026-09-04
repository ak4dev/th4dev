/* ==================================================
 * Routing Tests
 *
 * resolveRouting is the whole routing decision as a pure function, so these
 * run with no DOM and no navigation. bootstrapRouting, the impure half, is
 * exercised against a stubbed window so its ordering invariant is pinned:
 * the page must be read out of ?p= BEFORE the param is deleted.
 * ================================================== */

import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveRouting, bootstrapRouting } from "../routing";
import type { RoutingLocation } from "../routing";

/** A location with https and no port unless the case says otherwise */
const loc = (over: Partial<RoutingLocation>): RoutingLocation => ({
  protocol: "https:",
  hostname: "local.dev",
  port: "",
  search: "",
  ...over,
});

describe("resolveRouting", () => {
  it("sends a page subdomain to the root origin so one origin owns storage", () => {
    const r = resolveRouting(loc({ hostname: "f.local.dev" }));
    expect(r.rootOrigin).toBe("https://local.dev");
    expect(r.explicitPage).toBe("f");
    expect(r.defaultPage).toBe("f");
  });

  it("keeps the port in the root origin, or a dev redirect leaves the dev server", () => {
    const r = resolveRouting(loc({ hostname: "f.local.dev", port: "5173" }));
    expect(r.rootOrigin).toBe("https://local.dev:5173");
  });

  it("keeps the protocol of the current visit", () => {
    const r = resolveRouting(
      loc({ protocol: "http:", hostname: "f.local.dev" }),
    );
    expect(r.rootOrigin).toBe("http://local.dev");
  });

  it("redirects a deeper page subdomain to the whole remaining host", () => {
    const r = resolveRouting(loc({ hostname: "f.staging.local.dev" }));
    expect(r.rootOrigin).toBe("https://staging.local.dev");
    expect(r.explicitPage).toBe("f");
  });

  it("reads ?p= on the apex as the page the URL asked for", () => {
    const r = resolveRouting(loc({ search: "?p=f" }));
    expect(r.rootOrigin).toBeNull();
    expect(r.explicitPage).toBe("f");
  });

  it("asks for no page on the apex with no query, leaving the landing default", () => {
    const r = resolveRouting(loc({ search: "" }));
    expect(r.rootOrigin).toBeNull();
    expect(r.explicitPage).toBeNull();
    // Anything that is not "f" renders the landing page
    expect(r.defaultPage).toBe("local");
    expect(r.defaultPage).not.toBe("f");
  });

  it("treats an empty ?p= as no request, so a remembered page still wins", () => {
    const r = resolveRouting(loc({ search: "?p=" }));
    expect(r.explicitPage).toBeNull();
  });

  it("never redirects away from localhost, and still honours its ?p=", () => {
    const r = resolveRouting(loc({ hostname: "localhost", search: "?p=f" }));
    expect(r.rootOrigin).toBeNull();
    expect(r.explicitPage).toBe("f");
    expect(r.defaultPage).toBe("localhost");
  });

  it.each(["127.0.0.1", "192.168.1.42", "[::1]", "th4dev"])(
    "treats %s as local, with no subdomain to split off",
    (hostname) => {
      const r = resolveRouting(loc({ hostname }));
      expect(r.rootOrigin).toBeNull();
      expect(r.defaultPage).toBe(hostname);
    },
  );

  it("leaves an unknown subdomain where it is and uses it as the default page", () => {
    const r = resolveRouting(loc({ hostname: "www.local.dev" }));
    expect(r.rootOrigin).toBeNull();
    expect(r.explicitPage).toBeNull();
    expect(r.defaultPage).toBe("www");
  });

  it("is pure — the same location resolves the same way twice", () => {
    const l = loc({ hostname: "f.local.dev", search: "?p=x" });
    expect(resolveRouting(l)).toEqual(resolveRouting(l));
  });

  it("lets the page subdomain win over a conflicting ?p=", () => {
    // The redirect carries ?p=f, so a stale ?p= must not survive the hop
    const r = resolveRouting(loc({ hostname: "f.local.dev", search: "?p=x" }));
    expect(r.explicitPage).toBe("f");
  });
});

/* ---------- bootstrapRouting ---------- */

/** A stubbed window: routing only touches location and history.replaceState. */
function stubWindow(over: Partial<RoutingLocation> & { href?: string }) {
  const location = {
    protocol: "https:",
    hostname: "local.dev",
    port: "",
    search: "",
    ...over,
    href:
      over.href ??
      `https://${over.hostname ?? "local.dev"}/${over.search ?? ""}`,
    replace: vi.fn<(url: string) => void>(),
  };
  const history = {
    replaceState: vi.fn<(state: null, unused: string, url: string) => void>(),
  };
  // Deliberately not annotated: the inferred type keeps the vi.fn() mocks'
  // `.mock` handles, which a hand-written window-shaped interface erases.
  const fake = { location, history };
  vi.stubGlobal("window", fake);
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bootstrapRouting", () => {
  it("reads ?p= before deleting it, so the requested page survives", () => {
    // The invariant this function exists to hold: deleting the param first
    // would hand the app a null page and drop the visitor's request.
    const w = stubWindow({ search: "?p=f", href: "https://local.dev/?p=f" });
    const result = bootstrapRouting();

    expect(result.explicitPage).toBe("f");
    expect(result.redirected).toBe(false);
    const written = w.history.replaceState.mock.calls[0][2];
    expect(written).not.toContain("p=f");
  });

  it("leaves the URL alone when there is no ?p= to tidy", () => {
    const w = stubWindow({ href: "https://local.dev/" });
    const result = bootstrapRouting();

    expect(result.explicitPage).toBeNull();
    expect(w.history.replaceState).not.toHaveBeenCalled();
  });

  it("redirects a page subdomain to the root origin carrying its page", () => {
    const w = stubWindow({
      hostname: "f.local.dev",
      href: "https://f.local.dev/",
    });
    const result = bootstrapRouting();

    expect(result.redirected).toBe(true);
    expect(w.location.replace).toHaveBeenCalledWith("https://local.dev?p=f");
    // The redirect replaces the URL wholesale; no history tidying is needed
    expect(w.history.replaceState).not.toHaveBeenCalled();
  });

  it("keeps the dev port on the redirect so it does not leave the dev server", () => {
    const w = stubWindow({
      hostname: "f.local.dev",
      port: "5173",
      href: "https://f.local.dev:5173/",
    });
    bootstrapRouting();

    expect(w.location.replace).toHaveBeenCalledWith(
      "https://local.dev:5173?p=f",
    );
  });
});
