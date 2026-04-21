import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createFlowService } from "../../../src/flow/flow-service";

describe("FlowService", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("saves and lists flow definitions under the adapter flow directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "manifest.json"),
      JSON.stringify({
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "Demo",
        commands: [{ name: "search", description: "Search", args: [], example: "demo" }]
      }, null, 2),
      "utf8"
    );
    const sourcePath = path.join(root, "search-open.flow.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "search-open",
        kind: "flow",
        goal: "Search and open",
        steps: [{ type: "site", command: "demo/search", with: { query: "${params.query}" } }]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(flowService.saveFlow("demo", sourcePath)).resolves.toEqual(expect.objectContaining({ ok: true, site: "demo", flowId: "search-open" }));
    await expect(flowService.listFlows("demo")).resolves.toEqual([
      expect.objectContaining({ site: "demo", flowId: "search-open" })
    ]);
  });

  it("writes saved flow files as UTF-8 BOM for Windows-readable JSON", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "manifest.json"),
      JSON.stringify({
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "Demo",
        commands: [{ name: "search", description: "Search", args: [], example: "demo" }]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {} as any
    });

    const result = await flowService.saveFlow("demo", {
      id: "search-open",
      kind: "flow",
      goal: "Search and open",
        steps: [{ type: "site", command: "demo/search", with: { query: "人工智能" } }]
    });

    const raw = await fs.readFile(result.path, "utf8");
    expect(raw.charCodeAt(0)).toBe(0xfeff);
    expect(raw).toContain("人工智能");
  });

  it("accepts UTF-8 BOM when saving a flow from file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "manifest.json"),
      JSON.stringify({
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "Demo",
        commands: []
      }, null, 2),
      "utf8"
    );
    const sourcePath = path.join(root, "bom-flow.flow.json");
    await fs.writeFile(
      sourcePath,
      `\uFEFF${JSON.stringify({
        id: "bom-flow",
        kind: "flow",
        goal: "Load with BOM",
        steps: [{ type: "builtin", command: "open", with: { url: "https://example.com" } }]
      }, null, 2)}`,
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(flowService.saveFlow("demo", sourcePath)).resolves.toEqual(
      expect.objectContaining({ ok: true, site: "demo", flowId: "bom-flow" })
    );
  });

  it("rejects saving version-suffixed flows as formal assets", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "manifest.json"),
      JSON.stringify({
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "Demo",
        commands: [{ name: "search", description: "Search", args: [], example: "demo" }]
      }, null, 2),
      "utf8"
    );
    const sourcePath = path.join(root, "search-route-v2.flow.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "search-route-v2",
        kind: "flow",
        goal: "Versioned flow should be rejected",
        steps: [{ type: "site", command: "demo/search" }]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(flowService.saveFlow("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: "Flow id must not use version suffixes like -v2 or -v3"
    });
  });

  it("rejects saving flows with duplicate consecutive steps", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "manifest.json"),
      JSON.stringify({
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "Demo",
        commands: [{ name: "search", description: "Search", args: [], example: "demo" }]
      }, null, 2),
      "utf8"
    );
    const sourcePath = path.join(root, "duplicate.flow.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "duplicate",
        kind: "flow",
        goal: "Reject duplicated steps",
        steps: [
          { type: "site", command: "demo/search", with: { query: "ai" } },
          { type: "site", command: "demo/search", with: { query: "ai" } }
        ]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(flowService.saveFlow("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: "Flow must not contain duplicate consecutive steps"
    });
  });

  it("rejects route-like flows that hardcode detail urls without reusable site steps", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "manifest.json"),
      JSON.stringify({
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "Demo",
        commands: [{ name: "listing", description: "Listing", args: [], example: "demo" }]
      }, null, 2),
      "utf8"
    );
    const sourcePath = path.join(root, "detail-route.flow.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "detail-route",
        kind: "flow",
        goal: "Open listing to detail route",
        steps: [
          { type: "builtin", command: "tabNew", with: { url: "https://example.com/detail/42" } },
          { type: "builtin", command: "tabSwitch", with: { target: "lastCreated" } }
        ]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(flowService.saveFlow("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: "Route-like flow must use reusable site steps instead of hardcoded detail URLs"
    });
  });

  it("runs sequential site and builtin steps with parameter substitution", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "search-open.flow.json"),
      JSON.stringify({
        id: "search-open",
        kind: "flow",
        goal: "Search and open",
        params: [{ name: "query", type: "string", required: true }],
        steps: [
          { type: "builtin", command: "open", with: { url: "https://example.com/search" } },
          { type: "site", command: "demo/search", with: { query: "${params.query}" } },
          { type: "builtin", command: "waitForSelector", with: { selector: ".result", state: "visible" } }
        ]
      }, null, 2),
      "utf8"
    );

    const executeSite = vi.fn(async () => ({ success: true }));
    const open = vi.fn(async (url: string) => ({ ok: true, url }));
    const waitForSelector = vi.fn(async (selector: string, options: unknown) => ({ ok: true, selector, options }));
    const flowService = createFlowService({
      adaptersDir,
      executeSite,
      builtinHandlers: {
        open,
        waitForSelector,
        wait: vi.fn(),
        getUrl: vi.fn(async () => "https://example.com/search"),
        getTitle: vi.fn(async () => "Search"),
        getSnapshotText: vi.fn(),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn(),

      }
    });

    const result = await flowService.runFlow("demo/search-open", { query: "fast-browser" });

    expect(result.ok).toBe(true);
    expect(open).toHaveBeenCalledWith("https://example.com/search");
    expect(executeSite).toHaveBeenCalledWith("demo/search", { query: "fast-browser" });
    expect(waitForSelector).toHaveBeenCalledWith(".result", { state: "visible", timeoutMs: undefined });
    expect(result.steps).toHaveLength(3);
  });

  it("runs tab and interaction builtins in sequence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "interaction.flow.json"),
      JSON.stringify({
        id: "interaction",
        kind: "flow",
        goal: "Run tab and interaction builtins",
        steps: [
          { type: "builtin", command: "tabNew", with: { url: "https://example.com/form" } },
          { type: "builtin", command: "fill", with: { target: { selector: "input[name='q']", placeholder: "请输入关键词" }, value: "fast-browser" } },
          { type: "builtin", command: "press", with: { key: "Enter" } },
          { type: "builtin", command: "click", with: { target: { selector: "button[type='submit']", text: "搜索" } } },
          { type: "builtin", command: "tabSwitch", with: { target: "previous" } }
        ]
      }, null, 2),
      "utf8"
    );

    const tabNew = vi.fn(async (url?: string) => ({ ok: true, tab: { id: "tab-2", url, active: true } }));
    const fill = vi.fn(async (target: string, value: string) => ({ ok: true, selector: target, value }));
    const press = vi.fn(async (key: string, options?: { target?: string }) => ({ ok: true, key, options }));
    const click = vi.fn(async (target: string) => ({ ok: true, selector: target }));
    const tabSwitch = vi.fn(async (target: string) => ({ ok: true, tab: { id: target, active: true } }));

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {
        open: vi.fn(),
        wait: vi.fn(),
        waitForSelector: vi.fn(),
        tabNew,
        tabSwitch,
        click,
        fill,
        press,
        getUrl: vi.fn(async () => "https://example.com/form"),
        getTitle: vi.fn(async () => "Form"),
        getSnapshotText: vi.fn(),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn()
      } as any
    });

    const result = await flowService.runFlow("demo/interaction");

    expect(tabNew).toHaveBeenCalledWith("https://example.com/form");
    expect(fill).toHaveBeenCalledWith("input[name='q']", "fast-browser", { placeholder: "请输入关键词" });
    expect(press).toHaveBeenCalledWith("Enter", undefined);
    expect(click).toHaveBeenCalledWith("button[type='submit']", { text: "搜索" });
    expect(tabSwitch).toHaveBeenCalledWith("previous");
    expect(result.steps).toHaveLength(5);
  });

  it("rejects flow builtins with invalid press chord length", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "bad-press.flow.json"),
      JSON.stringify({
        id: "bad-press",
        kind: "flow",
        goal: "Reject invalid chord",
        steps: [
          { type: "builtin", command: "press", with: { keys: ["Control", "Shift", "P"] } }
        ]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {
        open: vi.fn(),
        wait: vi.fn(),
        waitForSelector: vi.fn(),
        tabNew: vi.fn(),
        tabSwitch: vi.fn(),
        click: vi.fn(),
        fill: vi.fn(),
        press: vi.fn(),
        getUrl: vi.fn(),
        getTitle: vi.fn(),
        getSnapshotText: vi.fn(),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn()
      } as any
    });

    await expect(flowService.runFlow("demo/bad-press")).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: "builtin press keys must contain one or two keys"
    });
  });

  it("rejects flow builtins that use snapshot refs directly as targets", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "bad-target.flow.json"),
      JSON.stringify({
        id: "bad-target",
        kind: "flow",
        goal: "Reject unstable target",
        steps: [
          { type: "builtin", command: "click", with: { target: { selector: "@e57" } } }
        ]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {
        open: vi.fn(),
        wait: vi.fn(),
        waitForSelector: vi.fn(),
        tabNew: vi.fn(),
        tabSwitch: vi.fn(),
        click: vi.fn(),
        fill: vi.fn(),
        press: vi.fn(),
        getUrl: vi.fn(),
        getTitle: vi.fn(),
        getSnapshotText: vi.fn(),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn()
      } as any
    });

    await expect(flowService.runFlow("demo/bad-target")).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: "Flow interaction target must not store snapshot refs"
    });
  });

  it("evaluates success assertions after running the flow", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "assertions.flow.json"),
      JSON.stringify({
        id: "assertions",
        kind: "flow",
        goal: "Run and assert",
        steps: [
          { type: "builtin", command: "open", with: { url: "https://example.com/search" } }
        ],
        success: [
          { type: "urlIncludes", value: "/search" },
          { type: "titleNotEmpty" },
          { type: "selectorVisible", value: ".result" }
        ]
      }, null, 2),
      "utf8"
    );

    const getUrl = vi.fn(async () => "https://example.com/search?q=fast-browser");
    const getTitle = vi.fn(async () => "Search Results");
    const waitForSelector = vi.fn(async (selector: string, options: unknown) => ({ ok: true, selector, options }));
    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {
        open: vi.fn(async (url: string) => ({ ok: true, url })),
        wait: vi.fn(),
        waitForSelector,
        getUrl,
        getTitle,
        getSnapshotText: vi.fn(),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn(),

      }
    });

    const result = await flowService.runFlow("demo/assertions");

    expect(getUrl).toHaveBeenCalledTimes(1);
    expect(getTitle).toHaveBeenCalledTimes(1);
    expect(waitForSelector).toHaveBeenLastCalledWith(".result", { state: "visible", timeoutMs: undefined });
    expect(result.assertions).toEqual([
      { index: 0, type: "urlIncludes", value: "/search", ok: true, actual: "https://example.com/search?q=fast-browser" },
      { index: 1, type: "titleNotEmpty", ok: true, actual: "Search Results" },
      { index: 2, type: "selectorVisible", value: ".result", ok: true, actual: ".result" }
    ]);
  });

  it("supports richer text and selector assertions", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "rich-assertions.flow.json"),
      JSON.stringify({
        id: "rich-assertions",
        kind: "flow",
        goal: "Run richer assertions",
        steps: [
          { type: "builtin", command: "open", with: { url: "https://example.com/detail" } }
        ],
        success: [
          { type: "textIncludes", value: "Order placed" },
          { type: "textNotIncludes", value: "Error" },
          { type: "selectorCountAtLeast", selector: ".item", count: 2 },
          { type: "selectorCountEquals", selector: ".summary", count: 1 },
          { type: "elementTextIncludes", selector: ".status", value: "Success" },
          { type: "elementTextEquals", selector: ".total", value: "$19.99" },
          { type: "storageValueEquals", storage: "localStorage", key: "orderStatus", value: "confirmed" },
          { type: "networkRequestSeen", urlIncludes: "/api/orders", method: "POST", status: 200 }
        ]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {
        open: vi.fn(async (url: string) => ({ ok: true, url })),
        wait: vi.fn(),
        waitForSelector: vi.fn(),
        getUrl: vi.fn(async () => "https://example.com/detail"),
        getTitle: vi.fn(async () => "Detail"),
        getSnapshotText: vi.fn(async () => "Order placed successfully"),
        getSelectorCount: vi.fn(async (selector: string) => selector === ".item" ? 3 : 1),
        getElementText: vi.fn(async (selector: string) => selector === ".status" ? "Payment Success" : "$19.99"),
        getStorageValue: vi.fn(async () => "confirmed"),
        getNetworkEntries: vi.fn(async () => [{ url: "https://example.com/api/orders", method: "POST", status: 200, resourceType: "xhr", time: Date.now() }])
      }
    });

    const result = await flowService.runFlow("demo/rich-assertions");

    expect(result.assertions).toEqual([
      { index: 0, type: "textIncludes", value: "Order placed", ok: true, actual: "Order placed successfully" },
      { index: 1, type: "textNotIncludes", value: "Error", ok: true, actual: "Order placed successfully" },
      { index: 2, type: "selectorCountAtLeast", selector: ".item", count: 2, ok: true, actual: 3 },
      { index: 3, type: "selectorCountEquals", selector: ".summary", count: 1, ok: true, actual: 1 },
      { index: 4, type: "elementTextIncludes", selector: ".status", value: "Success", ok: true, actual: "Payment Success" },
      { index: 5, type: "elementTextEquals", selector: ".total", value: "$19.99", ok: true, actual: "$19.99" },
      { index: 6, type: "storageValueEquals", storage: "localStorage", key: "orderStatus", value: "confirmed", ok: true, actual: "confirmed" },
      { index: 7, type: "networkRequestSeen", urlIncludes: "/api/orders", method: "POST", status: 200, ok: true, actual: "https://example.com/api/orders" }
    ]);
  });

  it("fails the flow when a success assertion does not pass", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "assertion-failure.flow.json"),
      JSON.stringify({
        id: "assertion-failure",
        kind: "flow",
        goal: "Fail assertion",
        steps: [
          { type: "builtin", command: "open", with: { url: "https://example.com" } }
        ],
        success: [
          { type: "textIncludes", value: "Dashboard" }
        ]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {
        open: vi.fn(async (url: string) => ({ ok: true, url })),
        wait: vi.fn(),
        waitForSelector: vi.fn(),
        getUrl: vi.fn(async () => "https://example.com"),
        getTitle: vi.fn(async () => "Example Domain"),
        getSnapshotText: vi.fn(async () => "Welcome"),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn(),

      }
    });

    await expect(flowService.runFlow("demo/assertion-failure")).rejects.toMatchObject({
      code: "FB_FLOW_002",
      stage: "flow",
      message: "Flow success assertion failed: textIncludes"
    });
  });

  it("returns structured failure details and diagnostics when a builtin step fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "step-failure.flow.json"),
      JSON.stringify({
        id: "step-failure",
        kind: "flow",
        goal: "Expose structured step failures",
        steps: [
          { type: "builtin", command: "open", with: { url: "https://example.com/login" } },
          { type: "builtin", command: "click", with: { target: { selector: "button.submit", text: "Submit" } } }
        ]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {
        resetDiagnostics: vi.fn(async () => undefined),
        open: vi.fn(async () => ({ ok: true, url: "https://example.com/login" })),
        wait: vi.fn(),
        waitForSelector: vi.fn(),
        tabNew: vi.fn(),
        tabSwitch: vi.fn(),
        click: vi.fn(async () => { throw new Error("click failed"); }),
        fill: vi.fn(),
        press: vi.fn(),
        getUrl: vi.fn(async () => "https://example.com/login"),
        getTitle: vi.fn(async () => "Login"),
        getSnapshotText: vi.fn(async () => "Login page"),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn(async () => [{ url: "https://example.com/api/login", method: "POST", status: 500, time: Date.now() }]),
        getConsoleLogs: vi.fn(async () => [{ type: "error", text: "submit failed", time: Date.now() }]),
        captureSnapshot: vi.fn(async () => ({
          url: "https://example.com/login",
          title: "Login",
          text: "Login page",
          interactive: [{ ref: "@e1", tag: "button", text: "Submit", selector: "button.submit" }]
        })),
        captureScreenshot: vi.fn(async () => ({ ok: true, url: "https://example.com/login", path: "shot.png" }))
      } as any
    });

    await expect(flowService.runFlow("demo/step-failure")).rejects.toMatchObject({
      code: "FB_FLOW_002",
      stage: "flow",
      details: {
        stage: "flow",
        site: "demo",
        flowId: "step-failure",
        failureType: "step",
        stepIndex: 1,
        stepType: "builtin",
        command: "click",
        diagnostics: {
          available: ["console", "network", "snapshot", "screenshot"],
          consoleCount: 1,
          networkCount: 1,
          screenshotPath: "shot.png",
          snapshot: {
            url: "https://example.com/login",
            title: "Login",
            interactiveCount: 1,
            textLength: 10
          }
        }
      }
    });
  });

  it("returns structured assertion failure details", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "assertion-details.flow.json"),
      JSON.stringify({
        id: "assertion-details",
        kind: "flow",
        goal: "Expose assertion failure details",
        steps: [
          { type: "builtin", command: "open", with: { url: "https://example.com/results" } }
        ],
        success: [
          { type: "textIncludes", value: "needle" }
        ]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {
        resetDiagnostics: vi.fn(async () => undefined),
        open: vi.fn(async () => ({ ok: true, url: "https://example.com/results" })),
        wait: vi.fn(),
        waitForSelector: vi.fn(),
        tabNew: vi.fn(),
        tabSwitch: vi.fn(),
        click: vi.fn(),
        fill: vi.fn(),
        press: vi.fn(),
        getUrl: vi.fn(async () => "https://example.com/results"),
        getTitle: vi.fn(async () => "Results"),
        getSnapshotText: vi.fn(async () => "haystack"),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn(async () => []),
        getConsoleLogs: vi.fn(async () => []),
        captureSnapshot: vi.fn(async () => ({
          url: "https://example.com/results",
          title: "Results",
          text: "haystack",
          interactive: []
        })),
        captureScreenshot: vi.fn(async () => ({ ok: true, url: "https://example.com/results", path: "assertion.png" }))
      } as any
    });

    await expect(flowService.runFlow("demo/assertion-details")).rejects.toMatchObject({
      code: "FB_FLOW_002",
      stage: "flow",
      details: {
        stage: "flow",
        site: "demo",
        flowId: "assertion-details",
        failureType: "assertion",
        assertionIndex: 0,
        assertionType: "textIncludes",
        diagnostics: {
          screenshotPath: "assertion.png",
          snapshot: {
            url: "https://example.com/results",
            title: "Results",
            interactiveCount: 0,
            textLength: 8
          }
        }
      }
    });
  });
  it("rejects flows with empty goal during save", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    const sourcePath = path.join(root, "invalid.flow.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "invalid",
        kind: "flow",
        goal: "",
        steps: [{ type: "site", command: "demo/search" }]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(flowService.saveFlow("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: "Flow goal is required"
    });
  });

  it("adds auth recovery guidance when a builtin step fails on a login page", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "login-builtin-failure.flow.json"),
      JSON.stringify({
        id: "login-builtin-failure",
        kind: "flow",
        goal: "Builtin should surface auth guidance",
        steps: [{ type: "builtin", command: "waitForSelector", with: { selector: "button:has-text('Login')" } }]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {
        open: vi.fn(),
        wait: vi.fn(),
        waitForSelector: vi.fn(async () => {
          throw new Error("Waiting for selector `button:has-text('Login')` failed");
        }),
        getUrl: vi.fn(async () => "https://example.com/admin/login"),
        getTitle: vi.fn(async () => "Administration Login"),
        getSnapshotText: vi.fn(async () => ""),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn()
      } as any
    });

    await expect(flowService.runFlow("demo/login-builtin-failure")).rejects.toMatchObject({
      code: "FB_FLOW_002",
      stage: "flow",
      message: expect.stringContaining("Current page looks like a login/auth page")
    });
  });

  it("adds auth recovery guidance when a flow site step fails on a login page", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "login-required.flow.json"),
      JSON.stringify({
        id: "login-required",
        kind: "flow",
        goal: "Run from logged-in page",
        steps: [{ type: "site", command: "demo/protected", with: {} }]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(async () => ({
        success: false,
        error: { code: "FB_ADAPTER_900", message: "Need login", stage: "adapter", retryable: false },
        meta: { adapterId: "demo", commandName: "protected", cached: false, timingMs: 1 }
      })),
      builtinHandlers: {
        open: vi.fn(),
        wait: vi.fn(),
        waitForSelector: vi.fn(),
        getUrl: vi.fn(async () => "https://example.com/login"),
        getTitle: vi.fn(async () => "Login"),
        getSnapshotText: vi.fn(async () => ""),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn()
      } as any
    });

    await expect(flowService.runFlow("demo/login-required")).rejects.toMatchObject({
      code: "FB_FLOW_002",
      stage: "flow",
      message: expect.stringContaining("Current page looks like a login/auth page")
    });
  });

  it("rejects saving a flow when the source filename does not match the flow id", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    const sourcePath = path.join(root, "wrong-name.flow.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "actual-id",
        kind: "flow",
        goal: "Reject mismatched file name",
        steps: [{ type: "site", command: "demo/search" }]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(flowService.saveFlow("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: "Flow file name must match flow id: actual-id.flow.json"
    });
  });

  it("rejects saving a flow directly from a session draft path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "manifest.json"),
      JSON.stringify({
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "Demo",
        commands: [{ name: "search", description: "Search", args: [], example: "demo" }]
      }, null, 2),
      "utf8"
    );
    const sourcePath = path.join(root, ".fast-browser", "sessions", "demo-a", "flows", "search-open.flow.json");
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "search-open",
        kind: "flow",
        goal: "Session draft",
        steps: [{ type: "site", command: "demo/search" }]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(flowService.saveFlow("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: expect.stringContaining("Session draft flows cannot be saved directly")
    });
  });

  it("rejects saving a flow when a site step points to a different site", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "manifest.json"),
      JSON.stringify({
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "Demo",
        commands: [{ name: "search", description: "Search", args: [], example: "demo" }]
      }, null, 2),
      "utf8"
    );
    const sourcePath = path.join(root, "cross-site.flow.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "cross-site",
        kind: "flow",
        goal: "Reject cross-site site steps",
        steps: [{ type: "site", command: "other/search" }]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(flowService.saveFlow("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: "Flow site step must target the same site: demo"
    });
  });

  it("rejects saving a flow when a referenced site command does not exist in the manifest", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "manifest.json"),
      JSON.stringify({
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "Demo",
        commands: [{ name: "search", description: "Search", args: [], example: "demo" }]
      }, null, 2),
      "utf8"
    );
    const sourcePath = path.join(root, "missing-command.flow.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "missing-command",
        kind: "flow",
        goal: "Reject missing site commands",
        steps: [{ type: "site", command: "demo/open-detail" }]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(flowService.saveFlow("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: "Flow site step command not found in manifest: demo/open-detail"
    });
  });

  it("rejects invalid waitForSelector builtin state values before execution", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "bad-state.flow.json"),
      JSON.stringify({
        id: "bad-state",
        kind: "flow",
        goal: "Reject bad selector state",
        steps: [
          { type: "builtin", command: "waitForSelector", with: { selector: ".result", state: "present" } }
        ]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(),
      builtinHandlers: {
        open: vi.fn(),
        wait: vi.fn(),
        waitForSelector: vi.fn(),
        getUrl: vi.fn(),
        getTitle: vi.fn(),
        getSnapshotText: vi.fn(),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn()
      }
    });

    await expect(flowService.runFlow("demo/bad-state")).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: "builtin waitForSelector state must be attached, visible, or hidden"
    });
  });
  it("fails the flow when a site step reports success false", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "site-step-failure.flow.json"),
      JSON.stringify({
        id: "site-step-failure",
        kind: "flow",
        goal: "Fail when site command fails",
        steps: [
          { type: "site", command: "demo/search", with: { query: "broken" } }
        ]
      }, null, 2),
      "utf8"
    );

    const flowService = createFlowService({
      adaptersDir,
      executeSite: vi.fn(async () => ({ success: false, error: { code: "FB_UNKNOWN", message: "broken", stage: "adapter", retryable: false } })),
      builtinHandlers: {
        open: vi.fn(),
        wait: vi.fn(),
        waitForSelector: vi.fn(),
        getUrl: vi.fn(),
        getTitle: vi.fn(),
        getSnapshotText: vi.fn(),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn()
      }
    });

    await expect(flowService.runFlow("demo/site-step-failure")).rejects.toMatchObject({
      code: "FB_FLOW_002",
      stage: "flow",
      message: "Flow step failed: demo/search"
    });
  });


it("resolves later flow step inputs from previous site step data", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-flow-"));
  tempDirs.push(root);
  const adaptersDir = path.join(root, "src", "adapters");
  await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
  await fs.writeFile(
    path.join(adaptersDir, "demo", "flows", "dynamic-step.flow.json"),
    JSON.stringify({
      id: "dynamic-step",
      kind: "flow",
      goal: "Resolve values from earlier steps",
      params: [{ name: "query", type: "string", required: true }],
      steps: [
        { type: "site", command: "demo/search", with: { query: "${params.query}" } },
        { type: "site", command: "demo/open-video", with: { bvId: "${steps[0].data.firstVideoBvId}", searchOk: "${steps[0].result.success}" } },
        { type: "builtin", command: "open", with: { url: "https://example.com/video/${steps[1].data.bvId}" } }
      ]
    }, null, 2),
    "utf8"
  );

  const executeSite = vi.fn()
    .mockResolvedValueOnce({ success: true, data: { firstVideoBvId: "BV1demo" } })
    .mockResolvedValueOnce({ success: true, data: { bvId: "BV1demo" } });
  const open = vi.fn(async (url: string) => ({ ok: true, url }));

  const flowService = createFlowService({
    adaptersDir,
    executeSite,
    builtinHandlers: {
      open,
      wait: vi.fn(),
      waitForSelector: vi.fn(),
      getUrl: vi.fn(async () => "https://example.com/video/BV1demo"),
      getTitle: vi.fn(async () => "Video"),
      getSnapshotText: vi.fn(),
      getSelectorCount: vi.fn(),
      getElementText: vi.fn(),
      getStorageValue: vi.fn(),
      getNetworkEntries: vi.fn()
    }
  });

  const result = await flowService.runFlow("demo/dynamic-step", { query: "??" });

  expect(executeSite).toHaveBeenNthCalledWith(1, "demo/search", { query: "??" });
  expect(executeSite).toHaveBeenNthCalledWith(2, "demo/open-video", { bvId: "BV1demo", searchOk: true });
  expect(open).toHaveBeenCalledWith("https://example.com/video/BV1demo");
  expect(result.steps[1]).toMatchObject({
    command: "demo/open-video",
    input: { bvId: "BV1demo", searchOk: true }
  });
});

});
