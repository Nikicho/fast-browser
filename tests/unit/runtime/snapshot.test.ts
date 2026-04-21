import { describe, expect, it } from "vitest";

import { buildSnapshot } from "../../../src/runtime/snapshot";

describe("buildSnapshot", () => {
  it("assigns stable refs to interactive elements and keeps readable text", () => {
    const snapshot = buildSnapshot([
      {
        tag: "button",
        text: "Submit",
        selector: "button.primary",
        selectors: ["button.primary", 'button[aria-label="Submit form"]'],
        attributes: {
          "aria-label": "Submit form",
          role: "button"
        },
        interactive: true
      },
      {
        tag: "a",
        text: "Learn more",
        selector: "a.docs",
        selectors: ["a.docs", 'a[href="/docs"]'],
        attributes: {
          href: "/docs"
        },
        interactive: true
      },
      {
        tag: "div",
        text: "Plain content",
        selector: "div.content",
        interactive: false
      }
    ]);

    expect(snapshot.interactive).toEqual([
      {
        ref: "@e1",
        tag: "button",
        text: "Submit",
        selector: "button.primary",
        selectors: ["button.primary", 'button[aria-label="Submit form"]'],
        role: "button",
        ariaLabel: "Submit form"
      },
      {
        ref: "@e2",
        tag: "a",
        text: "Learn more",
        selector: "a.docs",
        selectors: ["a.docs", 'a[href="/docs"]'],
        href: "/docs"
      }
    ]);
    expect(snapshot.text).toContain("Submit");
    expect(snapshot.text).toContain("Plain content");
  });

  it("promotes clickable card-like containers into interactive refs", () => {
    const snapshot = buildSnapshot([
      {
        tag: "div",
        text: "发布图文笔记",
        selector: "div.publish-card",
        className: "publish-card",
        interactive: false
      },
      {
        tag: "div",
        text: "普通内容",
        selector: "div.content",
        className: "content",
        interactive: false
      }
    ]);

    expect(snapshot.interactive).toEqual([
      { ref: "@e1", tag: "div", text: "发布图文笔记", selector: "div.publish-card" }
    ]);
  });
});
