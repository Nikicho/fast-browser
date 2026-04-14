import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaseService } from "../../../src/case/case-service";

describe("CaseService", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("saves and lists case definitions under the adapter case directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "search-open.flow.json"),
      JSON.stringify({
        id: "search-open",
        kind: "flow",
        goal: "Search and open",
        steps: [{ type: "site", command: "demo/search" }]
      }, null, 2),
      "utf8"
    );
    const sourcePath = path.join(root, "search-repo.case.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "search-repo",
        kind: "case",
        goal: "Verify search works",
        uses: [{ flow: "search-open", with: { query: "fast-browser" } }]
      }, null, 2),
      "utf8"
    );

    const caseService = createCaseService({
      adaptersDir,
      runFlow: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(caseService.saveCase("demo", sourcePath)).resolves.toEqual(
      expect.objectContaining({ ok: true, site: "demo", caseId: "search-repo" })
    );
    await expect(caseService.listCases("demo")).resolves.toEqual([
      expect.objectContaining({ site: "demo", caseId: "search-repo" })
    ]);
  });

  it("writes saved case files as UTF-8 BOM for Windows-readable JSON", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "search-open.flow.json"),
      JSON.stringify({
        id: "search-open",
        kind: "flow",
        goal: "Search and open",
        steps: [{ type: "site", command: "demo/search" }]
      }, null, 2),
      "utf8"
    );

    const caseService = createCaseService({
      adaptersDir,
      runFlow: vi.fn(),
      builtinHandlers: {} as any
    });

    const result = await caseService.saveCase("demo", {
      id: "search-repo",
      kind: "case",
      goal: "验证搜索流程",
      uses: [{ flow: "search-open", with: {} }],
      assertions: [{ type: "textIncludes", value: "人工智能" }]
    });

    const raw = await fs.readFile(result.path, "utf8");
    expect(raw.charCodeAt(0)).toBe(0xfeff);
    expect(raw).toContain("人工智能");
  });

  it("runs multiple flows sequentially and evaluates assertions after them", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "cases"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "cases", "checkout-smoke.case.json"),
      JSON.stringify({
        id: "checkout-smoke",
        kind: "case",
        goal: "Verify checkout journey",
        params: [{ name: "query", type: "string", required: true }],
        uses: [
          { flow: "search-product", with: { query: "${params.query}" } },
          { flow: "open-first-result", with: {} }
        ],
        assertions: [
          { type: "urlIncludes", value: "/detail" },
          { type: "titleNotEmpty" }
        ]
      }, null, 2),
      "utf8"
    );

    const runFlow = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, flowId: "search-product", steps: [] })
      .mockResolvedValueOnce({ ok: true, flowId: "open-first-result", steps: [] });
    const getUrl = vi.fn(async () => "https://example.com/detail/1");
    const getTitle = vi.fn(async () => "Detail");
    const caseService = createCaseService({
      adaptersDir,
      runFlow,
      builtinHandlers: {
        getUrl,
        getTitle,
        waitForSelector: vi.fn(),
        getSnapshotText: vi.fn(),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn(),

      }
    });

    const result = await caseService.runCase("demo/checkout-smoke", { query: "phone case" });

    expect(runFlow).toHaveBeenNthCalledWith(1, "demo/search-product", { query: "phone case" });
    expect(runFlow).toHaveBeenNthCalledWith(2, "demo/open-first-result", {});
    expect(result.ok).toBe(true);
    expect(result.uses).toHaveLength(2);
    expect(result.assertions).toEqual([
      { index: 0, type: "urlIncludes", value: "/detail", ok: true, actual: "https://example.com/detail/1" },
      { index: 1, type: "titleNotEmpty", ok: true, actual: "Detail" }
    ]);
  });

  it("supports richer assertions at the case level", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "cases"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "cases", "rich-assertions.case.json"),
      JSON.stringify({
        id: "rich-assertions",
        kind: "case",
        goal: "Verify richer assertions",
        uses: [
          { flow: "noop", with: {} }
        ],
        assertions: [
          { type: "textIncludes", value: "Confirmed" },
          { type: "selectorCountEquals", selector: ".summary", count: 2 },
          { type: "elementTextEquals", selector: ".status", value: "Done" },
          { type: "storageValueEquals", storage: "sessionStorage", key: "checkoutStep", value: "complete" },
          { type: "networkRequestSeen", urlIncludes: "/api/checkout", method: "POST", status: 200 }
        ]
      }, null, 2),
      "utf8"
    );

    const caseService = createCaseService({
      adaptersDir,
      runFlow: vi.fn(async () => ({ ok: true as const, site: "demo", flowId: "noop", steps: [] })),
      builtinHandlers: {
        getUrl: vi.fn(async () => "https://example.com/done"),
        getTitle: vi.fn(async () => "Done"),
        waitForSelector: vi.fn(),
        getSnapshotText: vi.fn(async () => "Payment Confirmed"),
        getSelectorCount: vi.fn(async () => 2),
        getElementText: vi.fn(async () => "Done"),
        getStorageValue: vi.fn(async () => "complete"),
        getNetworkEntries: vi.fn(async () => [{ url: "https://example.com/api/checkout", method: "POST", status: 200, resourceType: "fetch", time: Date.now() }])
      }
    });

    const result = await caseService.runCase("demo/rich-assertions");

    expect(result.assertions).toEqual([
      { index: 0, type: "textIncludes", value: "Confirmed", ok: true, actual: "Payment Confirmed" },
      { index: 1, type: "selectorCountEquals", selector: ".summary", count: 2, ok: true, actual: 2 },
      { index: 2, type: "elementTextEquals", selector: ".status", value: "Done", ok: true, actual: "Done" },
      { index: 3, type: "storageValueEquals", storage: "sessionStorage", key: "checkoutStep", value: "complete", ok: true, actual: "complete" },
      { index: 4, type: "networkRequestSeen", urlIncludes: "/api/checkout", method: "POST", status: 200, ok: true, actual: "https://example.com/api/checkout" }
    ]);
  });

  it("adds auth recovery guidance when a case flow fails on a login page", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "cases"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "cases", "flow-auth-failure.case.json"),
      JSON.stringify({
        id: "flow-auth-failure",
        kind: "case",
        goal: "Stop on auth failure",
        uses: [{ flow: "first", with: {} }]
      }, null, 2),
      "utf8"
    );

    const runFlow = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "FB_FLOW_002", stage: "flow" }));
    const caseService = createCaseService({
      adaptersDir,
      runFlow,
      builtinHandlers: {
        getUrl: vi.fn(async () => "https://example.com/signin"),
        getTitle: vi.fn(async () => "Sign in"),
        waitForSelector: vi.fn(),
        getSnapshotText: vi.fn(),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn(),

      }
    });

    await expect(caseService.runCase("demo/flow-auth-failure")).rejects.toMatchObject({
      code: "FB_CASE_002",
      stage: "case",
      message: expect.stringContaining("Current page looks like a login/auth page")
    });
    expect(runFlow).toHaveBeenCalledTimes(1);
  });

  it("stops the case when a flow fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "cases"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "cases", "flow-failure.case.json"),
      JSON.stringify({
        id: "flow-failure",
        kind: "case",
        goal: "Stop on first flow failure",
        uses: [
          { flow: "first", with: {} },
          { flow: "second", with: {} }
        ]
      }, null, 2),
      "utf8"
    );

    const runFlow = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "FB_FLOW_002", stage: "flow" }));
    const caseService = createCaseService({
      adaptersDir,
      runFlow,
      builtinHandlers: {
        getUrl: vi.fn(),
        getTitle: vi.fn(),
        waitForSelector: vi.fn(),
        getSnapshotText: vi.fn(),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn(),

      }
    });

    await expect(caseService.runCase("demo/flow-failure")).rejects.toMatchObject({
      code: "FB_CASE_002",
      stage: "case",
      message: "Case flow failed: first"
    });
    expect(runFlow).toHaveBeenCalledTimes(1);
  });
  it("rejects cases with empty goal during save", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    const sourcePath = path.join(root, "invalid.case.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "invalid",
        kind: "case",
        goal: "",
        uses: [{ flow: "search" }]
      }, null, 2),
      "utf8"
    );

    const caseService = createCaseService({
      adaptersDir,
      runFlow: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(caseService.saveCase("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_CASE_001",
      stage: "case",
      message: "Case goal is required"
    });
  });

  it("rejects saving a case when the source filename does not match the case id", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    const sourcePath = path.join(root, "wrong-name.case.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "actual-id",
        kind: "case",
        goal: "Reject mismatched file name",
        uses: [{ flow: "search-open" }]
      }, null, 2),
      "utf8"
    );

    const caseService = createCaseService({
      adaptersDir,
      runFlow: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(caseService.saveCase("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_CASE_001",
      stage: "case",
      message: "Case file name must match case id: actual-id.case.json"
    });
  });

  it("rejects saving a case directly from a session draft path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "search-open.flow.json"),
      JSON.stringify({
        id: "search-open",
        kind: "flow",
        goal: "Search and open",
        steps: [{ type: "site", command: "demo/search" }]
      }, null, 2),
      "utf8"
    );
    const sourcePath = path.join(root, ".fast-browser", "sessions", "demo-a", "cases", "search-repo.case.json");
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "search-repo",
        kind: "case",
        goal: "Session draft",
        uses: [{ flow: "search-open" }]
      }, null, 2),
      "utf8"
    );

    const caseService = createCaseService({
      adaptersDir,
      runFlow: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(caseService.saveCase("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_CASE_001",
      stage: "case",
      message: expect.stringContaining("Session draft cases cannot be saved directly")
    });
  });

  it("rejects saving a case when a referenced flow file does not exist", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    const sourcePath = path.join(root, "missing-flow.case.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "missing-flow",
        kind: "case",
        goal: "Reject missing flow refs",
        uses: [{ flow: "search-open" }]
      }, null, 2),
      "utf8"
    );

    const caseService = createCaseService({
      adaptersDir,
      runFlow: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(caseService.saveCase("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_CASE_001",
      stage: "case",
      message: "Case flow reference not found: demo/search-open"
    });
  });

  it("rejects saving a case when a referenced flow id does not match its file name", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "flows"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "flows", "search-open.flow.json"),
      JSON.stringify({
        id: "wrong-id",
        kind: "flow",
        goal: "Bad flow id",
        steps: [{ type: "site", command: "demo/search" }]
      }, null, 2),
      "utf8"
    );
    const sourcePath = path.join(root, "bad-flow-ref.case.json");
    await fs.writeFile(
      sourcePath,
      JSON.stringify({
        id: "bad-flow-ref",
        kind: "case",
        goal: "Reject inconsistent flow refs",
        uses: [{ flow: "search-open" }]
      }, null, 2),
      "utf8"
    );

    const caseService = createCaseService({
      adaptersDir,
      runFlow: vi.fn(),
      builtinHandlers: {} as any
    });

    await expect(caseService.saveCase("demo", sourcePath)).rejects.toMatchObject({
      code: "FB_CASE_001",
      stage: "case",
      message: "Referenced flow id does not match file name: demo/search-open"
    });
  });

  it("rejects cases with unsupported assertion types before execution", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-case-"));
    tempDirs.push(root);
    const adaptersDir = path.join(root, "src", "adapters");
    await fs.mkdir(path.join(adaptersDir, "demo", "cases"), { recursive: true });
    await fs.writeFile(
      path.join(adaptersDir, "demo", "cases", "bad-assertion.case.json"),
      JSON.stringify({
        id: "bad-assertion",
        kind: "case",
        goal: "Reject unsupported assertion",
        uses: [{ flow: "noop", with: {} }],
        assertions: [{ type: "cookieExists", name: "sid" }]
      }, null, 2),
      "utf8"
    );

    const caseService = createCaseService({
      adaptersDir,
      runFlow: vi.fn(async () => ({ ok: true as const, site: "demo", flowId: "noop", steps: [] })),
      builtinHandlers: {
        getUrl: vi.fn(),
        getTitle: vi.fn(),
        waitForSelector: vi.fn(),
        getSnapshotText: vi.fn(),
        getSelectorCount: vi.fn(),
        getElementText: vi.fn(),
        getStorageValue: vi.fn(),
        getNetworkEntries: vi.fn()
      }
    });

    await expect(caseService.runCase("demo/bad-assertion")).rejects.toMatchObject({
      code: "FB_CASE_001",
      stage: "case",
      message: "Unsupported case assertion type: cookieExists"
    });
  });
});

