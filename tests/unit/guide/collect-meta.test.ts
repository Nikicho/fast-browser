import { beforeEach, describe, expect, it, vi } from "vitest";

const promptMock = vi.fn();

vi.mock("inquirer", () => ({
  default: {
    prompt: promptMock
  }
}));

describe("collectMeta", () => {
  beforeEach(() => {
    promptMock.mockReset();
    promptMock.mockResolvedValue({});
  });

  it("uses readable Chinese prompt labels", async () => {
    const { collectMeta } = await import("../../../src/guide/steps/collect-meta");

    await collectMeta({ platform: "demo" });

    const [questions] = promptMock.mock.calls[0] ?? [];
    expect(Array.isArray(questions)).toBe(true);
    expect(questions.map((item: { message: string }) => item.message)).toEqual([
      "平台标识",
      "站点 URL",
      "你要实现的能力",
      "该能力是否需要登录态?",
      "优先尝试哪种方式?",
      "命令名",
      "是否缓存结果?",
      "TTL 秒数",
      "是否立即运行测试?"
    ]);
  });
});
