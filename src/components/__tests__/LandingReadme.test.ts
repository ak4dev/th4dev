import { describe, it, expect, vi } from "vitest";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LandingReadme from "../LandingReadme";

/**
 * LandingReadme is a page of documentation prose wrapped around two controls.
 * The prose is deliberately NOT pinned here: asserting the wording would turn
 * every copy edit into a red suite while protecting nothing, and there is no
 * automatable check for "the landing copy is still true". What is pinned is
 * what the page does — the primary action opens the calculator, the consent
 * switch reflects and toggles the local-storage flag, and the storage notice
 * states the direction the flag is actually in — plus one labelled tripwire.
 *
 * Rendering follows the repo's no-DOM convention (see BudgetPanel.test.ts and
 * SubdomainRouter.test.ts): markup comes from react-dom/server, and the two
 * click handlers — which static markup cannot carry — are read off the element
 * tree the component returns. Getting that tree means calling the component
 * function directly, which is sound only while LandingReadme holds no hooks
 * and needs no context. It holds neither today, and on the day it holds
 * either, shallowRender() below fails with an explicit instruction instead of
 * React's bare "Invalid hook call".
 *
 * A jsdom environment and a real client render were considered for these two
 * assertions and rejected: they would make this the only file in the suite
 * needing a DOM, and the callbacks they would exercise are the same two
 * one-line closures the element tree already exposes.
 */

type Props = Record<string, unknown>;

/** Depth-first search of a React element tree for the first props matching `pred`. */
function findProps(
  node: ReactNode,
  pred: (props: Props) => boolean,
): Props | undefined {
  if (!isValidElement<Props>(node)) return undefined;
  if (pred(node.props)) return node.props;
  for (const child of Children.toArray(node.props.children as ReactNode)) {
    const hit = findProps(child, pred);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Hook-free shallow render: the element tree plus the spies wired into it.
 *
 * Calling the component as a plain function is what keeps the handlers
 * reachable without a DOM, and it is also why React's dispatcher is not
 * installed — so the first hook added to LandingReadme throws right here.
 * Translate that throw into the instruction whoever added the hook needs.
 */
function shallowRender(localStorageEnabled: boolean) {
  const props = {
    onNavigate: vi.fn<(page: string) => void>(),
    localStorageEnabled,
    onLocalStorageToggle: vi.fn<(enabled: boolean) => void>(),
  };
  try {
    return { props, tree: LandingReadme(props) };
  } catch (error) {
    throw new Error(
      "LandingReadme threw when called as a plain function (see cause). The " +
        "usual reason is a newly added hook or context, which needs a real " +
        "render: either give this file a DOM environment and render it for " +
        "real, or keep the page hook-free.",
      { cause: error },
    );
  }
}

function html(localStorageEnabled: boolean) {
  return renderToStaticMarkup(
    createElement(LandingReadme, {
      onNavigate: () => undefined,
      localStorageEnabled,
      onLocalStorageToggle: () => undefined,
    }),
  );
}

describe("LandingReadme", () => {
  it("navigates to the calculator page from the primary action", () => {
    const { props, tree } = shallowRender(false);
    const button = findProps(tree, (p) => p.children === "Open calculator");
    expect(button).toBeDefined();
    (button?.onClick as () => void)();
    expect(props.onNavigate).toHaveBeenCalledWith("f");
  });

  it("declares that this is a coding project, not a financial tool", () => {
    // Not a copy pin: this is the page's only disclosure, and the whole point
    // of it is that it cannot quietly disappear in a later edit. Match the
    // four claims rather than the sentences, so the wording stays free to
    // change. The first is the load-bearing one — a page headed "Investment
    // Growth Calculator" reads as a financial product until it says otherwise.
    const page = html(false);
    expect(page).toMatch(/coding project, not a financial tool/i);
    expect(page).toMatch(/built by ai/i);
    expect(page).toMatch(/not investment advice/i);
    expect(page).toMatch(/licensed/i);
  });

  it("puts the disclosure before the calculator, not after the page", () => {
    // It has to be read before the tool is opened. Anchor it to the call to
    // action rather than to a character offset, so the page can grow.
    const page = html(false);
    expect(page.indexOf("not investment advice")).toBeGreaterThan(
      page.indexOf("Open calculator"),
    );
    expect(page.indexOf("not investment advice")).toBeLessThan(
      page.indexOf("Features"),
    );
  });

  it("tells the user which way round storage actually is", () => {
    // Not a copy pin: the storage message is a SEPARATE ternary from the one
    // feeding aria-checked, so inverting it would tell someone "No data is
    // stored" while their inputs are being written to the browser, and every
    // other assertion here would stay green. Match the claim, not the wording.
    expect(html(true)).toMatch(/being saved to this browser/);
    expect(html(true)).not.toMatch(/No data is stored/);
    expect(html(false)).toMatch(/No data is stored/);
    expect(html(false)).not.toMatch(/being saved to this browser/);
  });

  it("renders the consent switch state and toggles it", () => {
    expect(html(false)).toContain('aria-checked="false"');
    expect(html(true)).toContain('aria-checked="true"');

    for (const enabled of [false, true]) {
      const { props, tree } = shallowRender(enabled);
      const toggle = findProps(tree, (p) => p.role === "switch");
      expect(toggle?.["aria-checked"]).toBe(enabled);
      (toggle?.onClick as () => void)();
      expect(props.onLocalStorageToggle).toHaveBeenCalledWith(!enabled);
    }
  });

  it("still names the dynamic withdrawal capability (tripwire, not coverage)", () => {
    // The single deliberate tripwire in this file: the landing page is the
    // only place the shipped capability set is advertised, so one named
    // capability is checked to catch a page that has drifted out of sync with
    // the app. It is a tripwire, not coverage of the copy — no other wording
    // is pinned, and this line should be edited or deleted along with the
    // capability if it is ever renamed or removed.
    expect(html(false)).toMatch(/Dynamic Withdrawal/);
  });
});
