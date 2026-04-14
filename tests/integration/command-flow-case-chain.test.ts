import "tsx/cjs";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MemoryLruTtlCache } from "../../src/cache/memory-lru-ttl-cache";
import { createCaseService } from "../../src/case/case-service";
import { AdapterManager } from "../../src/core/adapter-manager";
import { AdapterRegistry } from "../../src/core/adapter-registry";
import { createFlowService } from "../../src/flow/flow-service";
import { createGuideService } from "../../src/guide/guide-service";
import { BrowserRuntimeFacade } from "../../src/runtime/browser-runtime";
import { FileSessionStore } from "../../src/runtime/session-store";
import { createLogger } from "../../src/shared/logger";

describe("custom adapter command -> flow -> case chain", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("runs a scaffolded custom adapter through site, flow, and case services", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-chain-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");

    const guide = createGuideService({
      adaptersDir,
      inspectSite: async () => ({
        finalUrl: "https://example.com/search",
        homepageTitle: "Example Search",
        suggestedEndpoints: [],
        resourceUrls: [],
        interactiveSelectors: [".result"],
        formSelectors: ["form.search"],
        notes: [],
        pageKind: "search",
        suggestedCommandName: "search",
        suggestedArgs: [{ name: "query", type: "string", required: true, description: "Search query." }]
      }),
      runSmokeTest: async () => ({ ok: true, output: "smoke ok" })
    });

    await guide.scaffold({
      platform: "demo",
      url: "https://example.com/search",
      capability: "Search example site",
      requiresLogin: false,
      strategy: "dom",
      commandName: "search",
      cacheable: false,
      ttlSeconds: 60,
      runTest: false
    });

    await fs.mkdir(path.join(adaptersDir, "demo", "cases"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "cases", "search-smoke.case.json"),
      JSON.stringify({
        id: "search-smoke",
        kind: "case",
        goal: "Verify scaffolded search flow runs",
        uses: [{ flow: "search", with: { query: "fast-browser" } }],
        assertions: [{ type: "titleNotEmpty" }]
      }, null, 2),
      "utf8"
    );

    const runtime = new BrowserRuntimeFacade({
      fetcher: async (url) =>
        new Response(`<html><head><title>Example Search</title></head><body><main class="result">Results for ${url}</main></body></html>`, {
          status: 200,
          headers: { "content-type": "text/html" }
        })
    });
    const registry = new AdapterRegistry(runtime, adaptersDir);
    const adapters = await registry.discover();
    const manager = new AdapterManager({
      adapters,
      cache: new MemoryLruTtlCache({ maxEntries: 100, defaultTtlMs: 10_000 }),
      runtime,
      logger: createLogger("silent"),
      sessionStore: new FileSessionStore(path.join(root, ".fast-browser", "sessions", "store.json"))
    });

    const builtinHandlers = {
      open: async (url: string) => ({ ok: true as const, url }),
      wait: async (options: { ms?: number; text?: string; urlIncludes?: string; fn?: string }) => ({ ok: true as const, url: "https://example.com/search", value: options }),
      waitForSelector: async (selector: string) => ({ ok: true as const, url: "https://example.com/search", selector }),
      getUrl: async () => "https://example.com/search",
      getTitle: async () => "Example Search",
      getSnapshotText: async () => "Results ready",
      getSelectorCount: async () => 1,
      getElementText: async () => "Results ready",
      getStorageValue: async () => null,
      getNetworkEntries: async () => []
    };

    const flowService = createFlowService({
      adaptersDir,
      executeSite: async (target, params) => {
        const [adapterId, commandName] = target.split("/");
        return manager.execute({ adapterId, commandName, params, output: "json", useCache: false });
      },
      builtinHandlers
    });

    const caseService = createCaseService({
      adaptersDir,
      runFlow: (target, params) => flowService.runFlow(target, params),
      builtinHandlers
    });

    await expect(manager.execute({
      adapterId: "demo",
      commandName: "search",
      params: { query: "fast-browser" },
      output: "json",
      useCache: false
    })).resolves.toMatchObject({
      success: true,
      data: {
        htmlLength: expect.any(Number),
        input: { query: "fast-browser" }
      }
    });

    await expect(flowService.runFlow("demo/search", { query: "fast-browser" })).resolves.toMatchObject({
      ok: true,
      site: "demo",
      flowId: "search",
      steps: expect.arrayContaining([
        expect.objectContaining({ type: "site", command: "demo/search" })
      ])
    });

    await expect(caseService.runCase("demo/search-smoke", { query: "fast-browser" })).resolves.toMatchObject({
      ok: true,
      site: "demo",
      caseId: "search-smoke",
      uses: expect.arrayContaining([
        expect.objectContaining({ flow: "search" })
      ])
    });
  });
});


