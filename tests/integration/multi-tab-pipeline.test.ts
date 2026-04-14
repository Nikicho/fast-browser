import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryLruTtlCache } from "../../src/cache/memory-lru-ttl-cache";
import { createCaseService } from "../../src/case/case-service";
import { AdapterManager } from "../../src/core/adapter-manager";
import { createFlowService } from "../../src/flow/flow-service";
import { BrowserRuntimeFacade } from "../../src/runtime/browser-runtime";
import { BrowserStateStore, BrowserSessionStateStore } from "../../src/runtime/browser-state";
import { createLogger } from "../../src/shared/logger";
import type { Adapter, BrowserRuntime, SessionStore } from "../../src/shared/types";

function createMockPage(id: string, url: string, title: string) {
  return {
    url: vi.fn(() => url),
    title: vi.fn(async () => title),
    target: () => ({ _targetId: id }),
    bringToFront: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => ({
      url,
      title,
      elements: [
        {
          tag: "a",
          text: title,
          selector: `a[data-tab="${id}"]`,
          selectors: [`a[data-tab="${id}"]`],
          interactive: true,
          className: "tab-link"
        }
      ]
    })),
    evaluateOnNewDocument: vi.fn(async () => undefined)
  };
}

describe("multi-tab pipeline", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("keeps low-level commands, site, flow, and case bound to the active tab", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-multitab-"));
    tempDirs.push(root);
    const stateFilePath = path.join(root, "browser-state.json");
    const adaptersDir = path.join(root, "src", "adapters");
    const sessionId = "multi-tab-session";

    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.mkdir(path.join(adaptersDir, "demo", "cases"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "manifest.json"),
      JSON.stringify({
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "Demo",
        commands: [
          {
            name: "current-tab",
            description: "Return the current active tab metadata.",
            args: [],
            example: "fast-browser site demo/current-tab"
          }
        ]
      }, null, 2),
      "utf8"
    );
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "current-tab.flow.json"),
      JSON.stringify({
        id: "current-tab",
        kind: "flow",
        goal: "Read current tab",
        steps: [
          { type: "site", command: "demo/current-tab", with: {} }
        ],
        success: [
          { type: "urlIncludes", value: "/two" }
        ]
      }, null, 2),
      "utf8"
    );
    await fs.writeFile(
      path.join(adaptersDir, "demo", "cases", "current-tab.case.json"),
      JSON.stringify({
        id: "current-tab",
        kind: "case",
        goal: "Verify current tab",
        uses: [
          { flow: "current-tab", with: {} }
        ],
        assertions: [
          { type: "urlIncludes", value: "/two" },
          { type: "titleNotEmpty" }
        ]
      }, null, 2),
      "utf8"
    );

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false,
      launchedAt: 1
    });
    await new BrowserSessionStateStore(path.join(root, `browser-session-${sessionId}.json`)).save({
      pageTargetId: "tab-1",
      pageUrl: "https://example.com/one",
      pageTitle: "One"
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId }) as any;
    const page1 = createMockPage("tab-1", "https://example.com/one", "One");
    const page2 = createMockPage("tab-2", "https://example.com/two", "Two");
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined),
      pages: vi.fn(async () => [page1, page2]),
      newPage: vi.fn(async () => createMockPage("tab-3", "about:blank", ""))
    };

    runtime.tryConnect = vi.fn(async () => browser);
    runtime.installInstrumentation = vi.fn(async () => undefined);

    const adapter: Adapter = {
      manifest: {
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "Demo",
        commands: [
          {
            name: "current-tab",
            description: "Return current tab info.",
            args: [],
            example: "fast-browser site demo/current-tab"
          }
        ]
      },
      execute: vi.fn(async (_commandName, _params, context) => {
        const url = await context.runtime.getUrl();
        const title = await context.runtime.getTitle();
        return {
          success: true,
          data: { url, title },
          meta: { adapterId: "demo", commandName: "current-tab", cached: false, timingMs: 1 }
        };
      })
    };

    const manager = new AdapterManager({
      adapters: [adapter],
      cache: new MemoryLruTtlCache({ maxEntries: 100, defaultTtlMs: 10_000 }),
      runtime: runtime as BrowserRuntime,
      logger: createLogger("silent"),
      sessionStore: {} as SessionStore
    });

    const builtinHandlers = {
      open: (url: string) => runtime.open(url),
      wait: (options: { ms?: number; text?: string; urlIncludes?: string; fn?: string }) => runtime.wait(options),
      waitForSelector: (selector: string, options: { timeoutMs?: number; state?: "attached" | "visible" | "hidden" }) => runtime.waitForSelector(selector, options),
      getUrl: () => runtime.getUrl(),
      getTitle: () => runtime.getTitle(),
      getSnapshotText: async () => (await runtime.snapshot({ interactiveOnly: false, maxItems: 20 })).text,
      getSelectorCount: async () => 1,
      getElementText: async () => "Two",
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

    await runtime.tabSwitch("2");

    await expect(runtime.getUrl()).resolves.toBe("https://example.com/two");
    await expect(runtime.snapshot()).resolves.toMatchObject({ url: "https://example.com/two", title: "Two" });

    const siteResult = await manager.execute({
      adapterId: "demo",
      commandName: "current-tab",
      params: {},
      output: "json",
      useCache: false
    });
    expect(siteResult).toMatchObject({
      success: true,
      data: { url: "https://example.com/two", title: "Two" }
    });

    const flowResult = await flowService.runFlow("demo/current-tab");
    expect(flowResult).toMatchObject({
      ok: true,
      assertions: [expect.objectContaining({ type: "urlIncludes", ok: true, actual: "https://example.com/two" })]
    });
    expect(flowResult.steps[0]).toMatchObject({
      command: "demo/current-tab",
      data: { url: "https://example.com/two", title: "Two" }
    });

    const caseResult = await caseService.runCase("demo/current-tab");
    expect(caseResult).toMatchObject({
      ok: true,
      assertions: [
        expect.objectContaining({ type: "urlIncludes", ok: true, actual: "https://example.com/two" }),
        expect.objectContaining({ type: "titleNotEmpty", ok: true, actual: "Two" })
      ]
    });

    const savedSession = await new BrowserSessionStateStore(path.join(root, `browser-session-${sessionId}.json`)).load();
    expect(savedSession).toMatchObject({
      pageTargetId: "tab-2",
      pageUrl: "https://example.com/two",
      pageTitle: "Two"
    });
  });
});
