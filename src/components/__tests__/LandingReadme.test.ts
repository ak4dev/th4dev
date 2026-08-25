import { describe, it, expect, vi } from "vitest";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LandingReadme from "../LandingReadme";

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

function mount(localStorageEnabled: boolean) {
  const props = {
    onNavigate: vi.fn<(page: string) => void>(),
    localStorageEnabled,
    onLocalStorageToggle: vi.fn<(enabled: boolean) => void>(),
  };
  return { props, tree: LandingReadme(props) };
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
  it("lists every documented feature, including dynamic withdrawal", () => {
    const markup = html(false);
    for (const feature of [
      "Dual lanes (A/B)",
      "Partial years",
      "Rollover",
      "Target solver",
      "Dynamic Withdrawal",
      "Monte Carlo",
      "Portfolio capital preservation",
      "FIRE, Budget, Scenarios, PDF",
    ]) {
      expect(markup).toContain(feature);
    }
    expect(markup).toMatch(/percentage of the balance.*floor.*ceiling/);
  });

  it("documents the global keyboard shortcuts", () => {
    const markup = html(false);
    for (const key of ["Ctrl", "Shift", "F", "S", "H", "Enter"]) {
      expect(markup).toContain(`<kbd>${key}</kbd>`);
    }
  });

  it("navigates to the calculator page from the primary action", () => {
    const { props, tree } = mount(false);
    const button = findProps(tree, (p) => p.children === "Open calculator");
    expect(button).toBeDefined();
    (button?.onClick as () => void)();
    expect(props.onNavigate).toHaveBeenCalledWith("f");
  });

  it("renders the consent switch state and toggles it", () => {
    expect(html(false)).toContain('aria-checked="false"');
    expect(html(false)).toContain("Local storage: off (default)");
    expect(html(true)).toContain('aria-checked="true"');
    expect(html(true)).toContain("Local storage is ON");

    for (const enabled of [false, true]) {
      const { props, tree } = mount(enabled);
      const toggle = findProps(tree, (p) => p.role === "switch");
      expect(toggle?.["aria-checked"]).toBe(enabled);
      (toggle?.onClick as () => void)();
      expect(props.onLocalStorageToggle).toHaveBeenCalledWith(!enabled);
    }
  });
});
