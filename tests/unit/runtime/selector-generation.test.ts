import { describe, expect, it } from "vitest";

import { selectPreferredSelector } from "../../../src/runtime/snapshot";

describe("selectPreferredSelector", () => {
  it("prefers a unique semantic selector before the structural fallback", () => {
    const selector = selectPreferredSelector(
      {
        tag: "button",
        attributes: {
          "data-testid": "publish-image",
          "aria-label": "发布图文"
        },
        className: "creator-tab is-active",
        fallbackSelector: "div:nth-of-type(3) > button:nth-of-type(2)"
      },
      (candidate) => candidate === 'button[data-testid="publish-image"]'
    );

    expect(selector).toBe('button[data-testid="publish-image"]');
  });

  it("uses stable class selectors when stronger semantic anchors are missing", () => {
    const selector = selectPreferredSelector(
      {
        tag: "div",
        attributes: {},
        className: "creator-tab is-active css-19gw05y",
        fallbackSelector: "div:nth-of-type(4) > div:nth-of-type(2)"
      },
      (candidate) => candidate === "div.creator-tab.is-active"
    );

    expect(selector).toBe("div.creator-tab.is-active");
  });

  it("falls back to the structural selector when no semantic candidate is unique", () => {
    const selector = selectPreferredSelector(
      {
        tag: "div",
        attributes: {
          role: "button"
        },
        className: "",
        fallbackSelector: "div:nth-of-type(7) > div:nth-of-type(1)"
      },
      () => false
    );

    expect(selector).toBe("div:nth-of-type(7) > div:nth-of-type(1)");
  });
});