import { describe, expect, it, vi } from "vitest";

import { createBilibiliAdapter } from "../../../src/adapters/bilibili";
import type { AdapterContext, BrowserRuntime } from "../../../src/shared/types";

function createContext(overrides: Partial<BrowserRuntime> = {}): AdapterContext {
  const runtime = {
    open: vi.fn(async (url: string) => ({ ok: true as const, url, title: "Bilibili", signal: { settled: true as const, urlChanged: true, titleChanged: true } })),
    waitForSelector: vi.fn(async () => ({ ok: true as const, url: "https://www.bilibili.com", title: "Bilibili" })),
    reload: vi.fn(async () => ({ ok: true as const, url: "https://www.bilibili.com", title: "Bilibili", signal: { settled: true as const, urlChanged: false, titleChanged: false } })),
    collect: vi.fn(async () => ({ ok: true as const, selector: 'a[href*="/video/BV"]', items: [{ text: "Video 1", href: "https://www.bilibili.com/video/BV1xx411c7mD" }], rounds: 1, url: "https://www.bilibili.com", title: "Bilibili" })),
    getUrl: vi.fn(async () => "https://www.bilibili.com"),
    getTitle: vi.fn(async () => "Bilibili"),
    snapshot: vi.fn(async () => ({ url: "https://www.bilibili.com", title: "Bilibili", text: "video page body", interactive: [] })),
    evalExpression: vi.fn(async () => ({ ok: true as const, url: "https://www.bilibili.com", title: "Bilibili", value: { title: "Video title", author: "Author" } }))
  } satisfies Partial<BrowserRuntime>;

  return {
    runtime: { ...runtime, ...overrides } as BrowserRuntime,
    cache: {} as AdapterContext["cache"],
    logger: {} as AdapterContext["logger"],
    sessionStore: {} as AdapterContext["sessionStore"]
  };
}

describe("bilibili adapter", () => {
  it("executes search with the expected route", async () => {
    const adapter = createBilibiliAdapter();
    const context = createContext();

    const result = await adapter.execute("search", { query: "tavern ai", page: 2 }, context);

    expect(result.success).toBe(true);
    expect(context.runtime.open).toHaveBeenCalledWith("https://search.bilibili.com/all?keyword=tavern%20ai&page=2");
    expect(result.data).toMatchObject({ query: "tavern ai", page: 2, items: [{ text: "Video 1" }] });
  });

  it("reloads once when the first search render is an empty hydration shell", async () => {
    const adapter = createBilibiliAdapter();
    const context = createContext();
    vi.mocked(context.runtime.collect)
      .mockResolvedValueOnce({
        ok: true,
        selector: 'a[href*="/video/BV"]',
        items: [{ text: "高级弹幕", href: "https://www.bilibili.com/video/BV1footer" }],
        rounds: 1,
        url: "https://search.bilibili.com/all?keyword=tavern%20ai",
        title: "酒馆AI-哔哩哔哩_bilibili"
      })
      .mockResolvedValueOnce({
        ok: true,
        selector: 'a[href*="/video/BV"]',
        items: [{ text: "从夯到拉锐评ai在 illy tavern 的表现", href: "https://www.bilibili.com/video/BV1real" }],
        rounds: 1,
        url: "https://search.bilibili.com/all?keyword=tavern%20ai",
        title: "酒馆AI-哔哩哔哩_bilibili"
      });
    vi.mocked(context.runtime.snapshot)
      .mockResolvedValueOnce({
        url: "https://search.bilibili.com/all?keyword=tavern%20ai",
        title: "酒馆AI-哔哩哔哩_bilibili",
        text: "首页 综合排序 最多点击 最多收藏 高级弹幕",
        interactive: []
      })
      .mockResolvedValueOnce({
        url: "https://search.bilibili.com/all?keyword=tavern%20ai",
        title: "酒馆AI-哔哩哔哩_bilibili",
        text: "首页 综合排序 最多点击 从夯到拉锐评ai在 illy tavern 的表现",
        interactive: []
      });
    vi.mocked(context.runtime.getUrl)
      .mockResolvedValueOnce("https://search.bilibili.com/all?keyword=tavern%20ai")
      .mockResolvedValueOnce("https://search.bilibili.com/all?keyword=tavern%20ai");
    vi.mocked(context.runtime.getTitle)
      .mockResolvedValueOnce("酒馆AI-哔哩哔哩_bilibili")
      .mockResolvedValueOnce("酒馆AI-哔哩哔哩_bilibili");

    const result = await adapter.execute("search", { query: "tavern ai" }, context);

    expect(result.success).toBe(true);
    expect(context.runtime.reload).toHaveBeenCalledTimes(1);
    expect(context.runtime.waitForSelector).toHaveBeenCalledTimes(2);
    expect(result.data).toMatchObject({
      items: [{ text: "从夯到拉锐评ai在 illy tavern 的表现" }]
    });
  });

  it("executes popular with the expected route", async () => {
    const adapter = createBilibiliAdapter();
    const context = createContext();

    const result = await adapter.execute("popular", { page: 3 }, context);

    expect(result.success).toBe(true);
    expect(context.runtime.open).toHaveBeenCalledWith("https://www.bilibili.com/v/popular/history?page=3");
    expect(result.data).toMatchObject({ page: 3, items: [{ text: "Video 1" }] });
    expect((result.data as { previewText: string }).previewText.length).toBeLessThanOrEqual(240);
  });

  it("executes video and extracts title and author", async () => {
    const adapter = createBilibiliAdapter();
    const context = createContext();

    const result = await adapter.execute("video", { bvid: "BV1xx411c7mD" }, context);

    expect(result.success).toBe(true);
    expect(context.runtime.open).toHaveBeenCalledWith("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(result.data).toMatchObject({ bvid: "BV1xx411c7mD", videoTitle: "Video title", author: "Author" });
  });

  it("executes favorites and uses the logged-in bilibili user id", async () => {
    const adapter = createBilibiliAdapter();
    const context = createContext({
      cookies: vi.fn(async () => ([
        { name: "DedeUserID", value: "16867061" }
      ])),
      snapshot: vi.fn(async () => ({
        url: "https://space.bilibili.com/16867061/favlist?fid=53712861&ftype=create",
        title: "超值套餐的个人空间-超值套餐个人主页-哔哩哔哩视频",
        text: "收藏 播放全部 批量操作 从失败到领悟，聊下一人公司(OPC)的复利循环 小天foto · 收藏于03-31",
        interactive: [
          { ref: "@e36", tag: "a", text: "3.0万\n154\n13:16", selector: "a[href*=\"/video/BV1favorite\"]" },
          { ref: "@e37", tag: "a", text: "从失败到领悟，聊下一人公司(OPC)的复利循环", selector: "a[href*=\"/video/BV1favorite\"]" },
          { ref: "@e38", tag: "a", text: "小天foto · 收藏于03-31", selector: "a[href*=\"/video/BV1favorite\"]" }
        ]
      })),
      getUrl: vi.fn(async () => "https://space.bilibili.com/16867061/favlist?fid=53712861&ftype=create"),
      getTitle: vi.fn(async () => "超值套餐的个人空间-超值套餐个人主页-哔哩哔哩视频")
    });

    const result = await adapter.execute("favorites", {}, context);

    expect(result.success).toBe(true);
    expect(context.runtime.open).toHaveBeenCalledWith("https://space.bilibili.com/16867061/favlist");
    expect(result.data).toMatchObject({
      ownerMid: "16867061",
      loginRequired: false,
      items: [
        {
          title: "从失败到领悟，聊下一人公司(OPC)的复利循环"
        }
      ]
    });
  });
});
