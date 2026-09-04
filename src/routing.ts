/* ==================================================
 * Origin normalisation and page routing
 *
 * If the app is loaded on a subdomain (e.g. f.local.dev), redirect to the
 * root domain with a ?p= query param so all localStorage lives under one
 * origin.  On localhost / bare IP addresses no redirect is performed.
 *
 * The decision is a pure function of the location (`resolveRouting`); the
 * navigation side effects live behind `bootstrapRouting`, which main.tsx
 * calls once before render.  Keeping them apart is what makes importing a
 * module safe: the old module-scope version redirected on import.
 * ================================================== */

/** The parts of `window.location` routing reads — enough to test without a DOM */
export interface RoutingLocation {
  protocol: string;
  hostname: string;
  port: string;
  search: string;
}

export interface Routing {
  /**
   * The origin this visit belongs on, when the current one is a page
   * subdomain; `null` means "stay here".
   */
  rootOrigin: string | null;
  /**
   * A page the URL asked for (?p= or a page subdomain).  It takes priority
   * over a remembered page.
   */
  explicitPage: string | null;
  /** The hostname fallback used when neither the URL nor storage names a page */
  defaultPage: string;
}

/** Page names that are also served from their own subdomain */
const KNOWN_PAGE_SUBDOMAINS = ["f"];

/**
 * Decides where this visit belongs and which page it asked for, from a
 * location alone.  Pure: it neither reads nor writes the browser.
 */
export function resolveRouting(loc: RoutingLocation): Routing {
  const { protocol, hostname, port, search } = loc;
  const parts = hostname.split(".");
  // An empty ?p= is not an explicit page — let the remembered page win
  const pageParam = new URLSearchParams(search).get("p") || null;

  // On localhost / bare IP there is no meaningful subdomain
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    !hostname.includes(".");

  if (isLocal) {
    return { rootOrigin: null, explicitPage: pageParam, defaultPage: hostname };
  }

  const subdomain = parts[0];

  if (KNOWN_PAGE_SUBDOMAINS.includes(subdomain)) {
    const rootHost = parts.slice(1).join(".");
    const portSuffix = port ? `:${port}` : "";
    return {
      rootOrigin: `${protocol}//${rootHost}${portSuffix}`,
      explicitPage: subdomain,
      defaultPage: subdomain,
    };
  }

  return { rootOrigin: null, explicitPage: pageParam, defaultPage: subdomain };
}

export interface BootstrapResult extends Routing {
  /** True when a navigation to `rootOrigin` was requested */
  redirected: boolean;
}

/**
 * Resolves the routing for the live location and performs its side effects:
 * a redirect off a page subdomain, or tidying the ?p= param out of the URL.
 *
 * The resolve happens first, so `explicitPage` is captured before ?p= is
 * deleted — reversing that drops the page the visitor asked for.
 */
export function bootstrapRouting(): BootstrapResult {
  const routing = resolveRouting(window.location);

  // Redirect subdomain visits to the root origin so localStorage is unified
  if (routing.rootOrigin) {
    const page = routing.explicitPage ?? routing.defaultPage;
    window.location.replace(`${routing.rootOrigin}?p=${page}`);
    return { ...routing, redirected: true };
  }

  // Clean up the ?p= query param after reading so the URL stays tidy
  const url = new URL(window.location.href);
  if (url.searchParams.has("p")) {
    url.searchParams.delete("p");
    window.history.replaceState(null, "", url.toString());
  }
  return { ...routing, redirected: false };
}
