import { describe, expect, it } from "vitest";

import { formatOutput } from "../../../src/cli/parser";

describe("formatOutput", () => {
  it("renders JSON by default for structured payloads", () => {
    const text = formatOutput(
      {
        url: "https://example.com",
        title: "Example Domain",
        text: "Example body",
        interactive: [{ ref: "@e1", tag: "a", text: "More information", selector: "a:nth-of-type(1)" }]
      },
      false
    );

    expect(text).toContain('"title": "Example Domain"');
    expect(text).toContain('"ref": "@e1"');
  });

  it("renders JSON when explicitly requested", () => {
    const text = formatOutput({ ok: true, value: 1 }, true);

    expect(text).toBe('{\n  "ok": true,\n  "value": 1\n}');
  });

  it("escapes non-ascii characters for json output", () => {
    const text = formatOutput({ title: "首页 - 知乎", notice: "测试" }, true);

    expect(text).toContain('\\u9996\\u9875');
    expect(text).toContain('\\u6d4b\\u8bd5');
    expect(text).not.toContain('首页');
    expect(text).not.toContain('测试');
  });
});
