import { describe, expect, it, vi } from "vitest";

import { adapter } from "../../../src/adapters/zhihu";
import type { AdapterContext, BrowserRuntime } from "../../../src/shared/types";

function createContext(overrides: Partial<BrowserRuntime> = {}): AdapterContext {
  const runtime = {
    open: vi.fn(async (url: string) => ({
      ok: true as const,
      url,
      title: "首页 - 知乎",
      signal: { settled: true as const, urlChanged: true, titleChanged: true }
    })),
    getUrl: vi.fn(async () => "https://www.zhihu.com/hot"),
    getTitle: vi.fn(async () => "首页 - 知乎"),
    snapshot: vi.fn(async () => ({
      url: "https://www.zhihu.com/hot",
      title: "首页 - 知乎",
      text: "甲".repeat(500),
      interactive: Array.from({ length: 10 }, (_, index) => ({
        ref: `@e${index + 1}`,
        tag: "a",
        text: `问题${index + 1}`,
        selector: `a:nth-of-type(${index + 1})`
      }))
    })),
    evalExpression: vi.fn(async () => ({
      ok: true as const,
      url: "https://www.zhihu.com/hot",
      title: "首页 - 知乎",
      value: {
        bodyText: "甲".repeat(500),
        preText: "",
        answerCount: 0,
        searchCount: 0,
        hotCount: 20,
        hasSignInForm: false
      }
    }))
  } satisfies Partial<BrowserRuntime>;

  return {
    runtime: { ...runtime, ...overrides } as BrowserRuntime,
    cache: {} as AdapterContext["cache"],
    logger: {} as AdapterContext["logger"],
    sessionStore: {} as AdapterContext["sessionStore"]
  };
}

describe("zhihu adapter", () => {
  it("truncates previewText for hot results", async () => {
    const context = createContext();

    const result = await adapter.execute("hot", {}, context);

    expect(result.success).toBe(true);
    const data = result.data as { previewText: string };
    expect(typeof data.previewText).toBe("string");
    expect(data.previewText).toHaveLength(240);
  });
});
