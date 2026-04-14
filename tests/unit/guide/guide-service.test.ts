import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createGuideService } from "../../../src/guide/guide-service";

describe("GuideService", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("returns enriched inspection data for search-like pages", async () => {
    const guide = createGuideService({
      inspectSite: async () => ({
        finalUrl: "https://example.com/search?q=agent&page=2",
        homepageTitle: "Example Search",
        suggestedEndpoints: ["https://example.com/api/search?q=agent&page=2"],
        resourceUrls: ["https://example.com/app.js"],
        interactiveSelectors: ['input[name="q"]', 'button[type="submit"]'],
        formSelectors: ["form:nth-of-type(1)"],
        notes: ["network-strategy-likely"]
      })
    });

    const inspection = await guide.inspect("https://example.com/search?q=agent&page=2");

    expect(inspection.pageKind).toBe("search");
    expect(inspection.suggestedCommandName).toBe("search");
    expect(inspection.suggestedArgs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "query", type: "string", required: true }),
        expect.objectContaining({ name: "page", type: "number", required: false })
      ])
    );
  });

  it("does not infer search args for logged-in dashboard pages with noisy background endpoints", async () => {
    const guide = createGuideService({
      inspectSite: async () => ({
        finalUrl: "https://creator.xiaohongshu.com/new/home",
        homepageTitle: "?????????",
        suggestedEndpoints: [
          "https://creator.xiaohongshu.com/new/api/sns/v5/creator/nps/showstatus",
          "https://creator.xiaohongshu.com/new/api/sns/v1/search/topic",
          "https://creator.xiaohongshu.com/new/api/sns/v1/search/user_info"
        ],
        resourceUrls: [
          "https://fe-static.xhscdn.com/formula-static/ugc/public/resource/js/project-publish-vue.7a62eb65.js"
        ],
        interactiveSelectors: [],
        formSelectors: [],
        notes: ["network-strategy-likely"]
      })
    });

    const inspection = await guide.inspect("https://creator.xiaohongshu.com/new/home");

    expect(inspection.pageKind).toBe("generic");
    expect(inspection.suggestedCommandName).toBe("page");
    expect(inspection.suggestedArgs).toEqual([]);
  });

  it("creates a scaffold plan with inferred args for detail pages", async () => {
    const guide = createGuideService({
      prompt: async () => ({
        platform: "bilibili",
        url: "https://www.bilibili.com/video/BV1xx411c7mD",
        capability: "获取视频详情",
        requiresLogin: false,
        strategy: "dom",
        commandName: "detail",
        cacheable: true,
        ttlSeconds: 300,
        runTest: false
      }),
      inspectSite: async () => ({
        finalUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
        homepageTitle: "Bilibili",
        suggestedEndpoints: [],
        resourceUrls: ["https://www.bilibili.com/assets/index.js"],
        interactiveSelectors: ["a:nth-of-type(1)", "button:nth-of-type(1)"],
        formSelectors: [],
        notes: ["dom-strategy-likely"]
      })
    });

    const plan = await guide.plan({ platform: "bilibili" });

    expect(plan.files).toContain("src/adapters/bilibili/manifest.json");
    expect(plan.strategy.source).toBe("dom");
    expect(plan.inspection.pageKind).toBe("detail");
    expect(plan.manifest.commands[0].args).toEqual([
      expect.objectContaining({ name: "slug", type: "string", required: true })
    ]);
    expect(plan.files).toContain("src/adapters/bilibili/flows/detail.flow.json");
    expect(JSON.parse(plan.sourceFiles["src/adapters/bilibili/flows/detail.flow.json"])).toEqual(
      expect.objectContaining({
        id: "detail",
        kind: "flow",
        steps: [
          {
            type: "builtin",
            command: "open",
            with: {
              url: "https://www.bilibili.com/video/BV1xx411c7mD"
            }
          },
          {
            type: "builtin",
            command: "waitForSelector",
            with: {
              selector: "a:nth-of-type(1)",
              state: "visible"
            }
          },
          {
            type: "site",
            command: "bilibili/detail",
            with: {
              slug: "${params.slug}"
            }
          }
        ],
        success: [
          { type: "urlIncludes", value: "/video/BV1xx411c7mD" },
          { type: "selectorVisible", value: "a:nth-of-type(1)" },
          { type: "titleNotEmpty" }
        ]
      })
    );
  });

  it("writes inferred command args into scaffolded command source", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-guide-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    const guide = createGuideService({
      adaptersDir,
      prompt: async () => ({
        platform: "demo",
        url: "https://example.com/search?q=agent&page=1",
        capability: "搜索示例站点",
        requiresLogin: false,
        strategy: "network",
        commandName: "search",
        cacheable: true,
        ttlSeconds: 60,
        runTest: false
      }),
      inspectSite: async () => ({
        finalUrl: "https://example.com/search?q=agent&page=1",
        homepageTitle: "Example Search",
        suggestedEndpoints: ["https://example.com/api/search?q=agent&page=1"],
        resourceUrls: ["https://example.com/app.js"],
        interactiveSelectors: ['input[name="q"]'],
        formSelectors: ["form:nth-of-type(1)"],
        notes: ["network-strategy-likely"]
      })
    });

    const result = await guide.scaffold({});
    const commandSource = result.sourceFiles["src/adapters/demo/commands/search.ts"];

    expect(result.inspection.suggestedArgs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "query", type: "string", required: true }),
        expect.objectContaining({ name: "page", type: "number", required: false })
      ])
    );
    expect(commandSource).toContain("Prefer stable direct routes and explicit success signals");
    expect(commandSource).toContain("trace current --json");
    expect(commandSource).toContain("params.query");
    expect(commandSource).toContain("params.page");
    expect(result.sourceFiles["src/adapters/demo/flows/search.flow.json"]).toContain('"command": "open"');
    expect(result.sourceFiles["src/adapters/demo/flows/search.flow.json"]).toContain('"command": "waitForSelector"');
    expect(result.sourceFiles["src/adapters/demo/flows/search.flow.json"]).toContain('"command": "demo/search"');
    expect(result.sourceFiles["src/adapters/demo/flows/search.flow.json"]).toContain('"type": "titleNotEmpty"');
    await expect(fs.readFile(path.join(root, "src", "adapters", "demo", "flows", "search.flow.json"), "utf8")).resolves.toContain('"id": "search"');
  });

  it("generates valid camelCase identifiers for kebab-case command names", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-guide-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    const guide = createGuideService({
      adaptersDir,
      prompt: async () => ({
        platform: "xiaohongshu-creator",
        url: "https://creator.xiaohongshu.com/new/home",
        capability: "Enter image post composer",
        requiresLogin: true,
        strategy: "dom",
        commandName: "enter-image-post-composer",
        cacheable: false,
        ttlSeconds: 60,
        runTest: false
      }),
      inspectSite: async () => ({
        finalUrl: "https://creator.xiaohongshu.com/new/home",
        homepageTitle: "?????????",
        suggestedEndpoints: [],
        resourceUrls: [],
        interactiveSelectors: [".publish-card"],
        formSelectors: [],
        notes: ["dom-strategy-likely"]
      })
    });

    const result = await guide.scaffold({});

    expect(result.sourceFiles["src/adapters/xiaohongshu-creator/index.ts"]).toContain('import { enterImagePostComposer }');
    expect(result.sourceFiles["src/adapters/xiaohongshu-creator/index.ts"]).toContain("const data = await enterImagePostComposer");
    expect(result.sourceFiles["src/adapters/xiaohongshu-creator/commands/enter-image-post-composer.ts"]).toContain(
      "export async function enterImagePostComposer"
    );
  });

  it("runs smoke tests when requested and rejects existing adapter directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-guide-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    const smokeRunner = vi.fn(async () => ({ ok: true, output: "smoke ok" }));
    const guide = createGuideService({
      adaptersDir,
      prompt: async () => ({
        platform: "demo",
        url: "https://example.com",
        capability: "Fetch example page",
        requiresLogin: false,
        strategy: "dom",
        commandName: "home",
        cacheable: true,
        ttlSeconds: 60,
        runTest: true
      }),
      inspectSite: async () => ({
        finalUrl: "https://example.com/",
        homepageTitle: "Example Domain",
        suggestedEndpoints: [],
        resourceUrls: [],
        interactiveSelectors: ["a:nth-of-type(1)"],
        formSelectors: [],
        notes: ["dom-strategy-likely"]
      }),
      runSmokeTest: smokeRunner
    });

    const result = await guide.scaffold({});

    expect(result.smokeTest).toEqual({ ok: true, output: "smoke ok" });
    expect(smokeRunner).toHaveBeenCalledWith("fast-browser site demo/home");

    await expect(guide.scaffold({})).rejects.toThrow(/already exists/i);
  });

  it("prefers dom strategy when generic dashboard pages only expose noisy background endpoints", async () => {
    const guide = createGuideService({
      prompt: async () => ({
        platform: "xiaohongshu-creator",
        url: "https://creator.xiaohongshu.com/new/home",
        capability: "Open creator home",
        requiresLogin: true,
        strategy: "auto",
        commandName: "home",
        cacheable: false,
        ttlSeconds: 60,
        runTest: false
      }),
      inspectSite: async () => ({
        finalUrl: "https://creator.xiaohongshu.com/new/home",
        homepageTitle: "Creator Home",
        suggestedEndpoints: [
          "https://creator.xiaohongshu.com/new/api/sns/v5/creator/nps/showstatus",
          "https://creator.xiaohongshu.com/new/api/sns/v1/search/topic"
        ],
        resourceUrls: [],
        interactiveSelectors: [".publish-card"],
        formSelectors: [],
        notes: ["network-strategy-likely"],
        pageKind: "generic",
        suggestedCommandName: "page",
        suggestedArgs: []
      })
    });

    const plan = await guide.plan({});

    expect(plan.strategy).toEqual({ source: "dom" });
  });

  it("rejects invalid guide answer values before planning", async () => {
    const guide = createGuideService({
      prompt: async () => ({
        platform: "bad platform",
        url: "https://example.com",
        capability: "Search demo",
        requiresLogin: false,
        strategy: "manual" as any,
        commandName: "bad command",
        cacheable: true,
        ttlSeconds: 0,
        runTest: false
      }),
      inspectSite: async () => ({
        finalUrl: "https://example.com",
        homepageTitle: "Example",
        suggestedEndpoints: [],
        resourceUrls: [],
        interactiveSelectors: [],
        formSelectors: [],
        notes: []
      })
    });

    await expect(guide.plan({})).rejects.toMatchObject({
      code: "FB_GUIDE_001",
      stage: "guide"
    });
  });
});
