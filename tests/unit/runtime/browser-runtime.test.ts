import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserRuntimeFacade } from "../../../src/runtime/browser-runtime";
import { BrowserSessionStateStore, BrowserStateStore } from "../../../src/runtime/browser-state";

describe("BrowserRuntimeFacade", () => {
  const tempRoots: string[] = [];
  const originalCwd = process.cwd();
  const originalRoot = process.env.FAST_BROWSER_ROOT;
  const originalHome = process.env.FAST_BROWSER_HOME;
  const originalSessionId = process.env.FAST_BROWSER_SESSION_ID;

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalRoot === undefined) { delete process.env.FAST_BROWSER_ROOT; } else { process.env.FAST_BROWSER_ROOT = originalRoot; }
    if (originalHome === undefined) { delete process.env.FAST_BROWSER_HOME; } else { process.env.FAST_BROWSER_HOME = originalHome; }
    if (originalSessionId === undefined) { delete process.env.FAST_BROWSER_SESSION_ID; } else { process.env.FAST_BROWSER_SESSION_ID = originalSessionId; }
    await Promise.all(tempRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempRoots.length = 0;
  });

  it("captures console and network diagnostics through installed instrumentation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const runtime = new BrowserRuntimeFacade({
      stateFilePath: path.join(root, "state.json"),
      sessionStateFilePath: path.join(root, "browser-session-session-b.json"),
      sessionId: "session-b"
    }) as any;

    const listeners = new Map<string, (...args: any[]) => void>();
    const page = {
      evaluateOnNewDocument: vi.fn(async () => undefined),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        listeners.set(event, handler);
      })
    };

    await runtime.installInstrumentation(page);

    const consoleHandler = listeners.get("console");
    const responseHandler = listeners.get("response");
    expect(consoleHandler).toBeTypeOf("function");
    expect(responseHandler).toBeTypeOf("function");

    await consoleHandler?.({
      type: () => "error",
      text: () => "submit failed"
    });
    await responseHandler?.({
      url: () => "https://example.com/api/login",
      status: () => 500,
      request: () => ({
        method: () => "POST",
        resourceType: () => "fetch"
      })
    });

    await expect(runtime.consoleLogs()).resolves.toEqual({
      logs: [
        expect.objectContaining({ type: "error", text: "submit failed" })
      ]
    });
    await expect(runtime.networkEntries()).resolves.toEqual({
      entries: [
        expect.objectContaining({ url: "https://example.com/api/login", method: "POST", status: 500, resourceType: "fetch" })
      ]
    });
  });

  it("creates a dedicated tab for a different browser session instead of reusing another session page", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false
    });
    await new BrowserSessionStateStore(path.join(root, "browser-session-session-a.json")).save({
      pageTargetId: "page-a",
      pageUrl: "https://example.com/a"
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const existingPage = {
      url: () => "https://example.com/a",
      target: () => ({ _targetId: "page-a" })
    };
    const newPage = {
      url: () => "about:blank",
      target: () => ({ _targetId: "page-b" })
    };
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      pages: vi.fn(async () => [existingPage]),
      newPage: vi.fn(async () => newPage)
    };

    runtime.tryConnect = vi.fn(async () => browser);
    runtime.installInstrumentation = vi.fn(async () => undefined);
    runtime.loadClaimedPageTargetIds = vi.fn(async () => new Set(["page-a"]));

    const context = await runtime.ensurePage();

    expect(browser.newPage).toHaveBeenCalledTimes(1);
    expect(context.page).toBe(newPage);
    expect(context.session.pageTargetId).toBe("page-b");
  });

  it("does not overwrite a non-blank session identity with about:blank", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false,
      lastNonBlankPageTargetId: "real-page",
      lastNonBlankPageUrl: "https://example.com/results",
      lastNonBlankPageTitle: "Results"
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test"
    };
    const blankPage = {
      url: () => "about:blank",
      title: vi.fn(async () => ""),
      target: () => ({ _targetId: "blank-page" })
    };

    await runtime.persistState(browser, blankPage, {
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false,
      lastNonBlankPageTargetId: "real-page",
      lastNonBlankPageUrl: "https://example.com/results",
      lastNonBlankPageTitle: "Results"
    }, {
      pageTargetId: "real-page",
      pageUrl: "https://example.com/results",
      pageTitle: "Results",
      consoleLogs: [],
      networkEntries: []
    });

    const savedState = await new BrowserStateStore(stateFilePath).load();
    const savedSessionState = await new BrowserSessionStateStore(path.join(root, "browser-session-session-b.json")).load();
    expect(savedState).toMatchObject({
      lastNonBlankPageTargetId: "real-page",
      lastNonBlankPageUrl: "https://example.com/results",
      lastNonBlankPageTitle: "Results"
    });
    expect(savedSessionState).toMatchObject({
      pageTargetId: "real-page",
      pageUrl: "https://example.com/results",
      pageTitle: "Results"
    });
  });

  it("persists current session state without overwriting another browser session", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false,
      sessions: {
        "session-a": {
          pageTargetId: "page-a",
          refs: [{ ref: "@e1", selector: "button.a" }]
        }
      }
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test"
    };
    const page = {
      target: () => ({ _targetId: "page-b" })
    };

    await runtime.persistState(browser, page, { debugPort: 9222, wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test", headless: false, sessions: {} }, {
      pageTargetId: "page-b",
      refs: [{ ref: "@e9", selector: "button.b" }],
      consoleLogs: [],
      networkEntries: []
    });

    const savedState = await new BrowserStateStore(stateFilePath).load();
    const savedSessionState = await new BrowserSessionStateStore(path.join(root, "browser-session-session-b.json")).load();
    expect(savedState).toMatchObject({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false
    });
    expect(savedSessionState).toMatchObject({
      pageTargetId: "page-b",
      refs: [{ ref: "@e9", selector: "button.b" }]
    });
  });


  it("resolves snapshot refs from another recent session when the current tab identity matches", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false
    });
    await new BrowserSessionStateStore(path.join(root, "browser-session-session-a.json")).save({
      pageTargetId: "shared-page",
      pageUrl: "https://example.com/results",
      refs: [{ ref: "@e57", selector: "a.result-link", selectors: ["a.result-link"], text: "Result", tag: "a" }]
    });
    await new BrowserSessionStateStore(path.join(root, "browser-session-session-b.json")).save({
      pageTargetId: "shared-page",
      pageUrl: "https://example.com/results",
      refs: []
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    runtime.readSnapshotData = vi.fn(async () => ({
      url: "https://example.com/results",
      title: "Results",
      elements: [{
        tag: "a",
        text: "Result",
        selector: "a.result-link",
        selectors: ["a.result-link"],
        interactive: true
      }]
    }));

    const page = {
      url: () => "https://example.com/results",
      target: () => ({ _targetId: "shared-page" }),
      $: vi.fn(async (selector: string) => selector === "a.result-link" ? {} : null)
    };

    const session = { pageTargetId: "shared-page", pageUrl: "https://example.com/results", refs: [] };
    const resolved = await runtime.resolveTarget("@e57", session, page);

    expect(resolved).toMatchObject({
      selector: "a.result-link",
      selectorCandidates: ["a.result-link"]
    });
    expect(session.refs).toEqual([
      { ref: "@e57", selector: "a.result-link", selectors: ["a.result-link"], text: "Result", tag: "a" }
    ]);
  });

  it("falls back to the last known non-blank page when the current session state is blank", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false,
      lastNonBlankPageTargetId: "real-page",
      lastNonBlankPageUrl: "https://example.com/results",
      lastNonBlankPageTitle: "Results"
    });
    await new BrowserSessionStateStore(path.join(root, "browser-session-session-b.json")).save({
      pageTargetId: "blank-page",
      pageUrl: "about:blank",
      pageTitle: ""
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const aboutBlankPage = {
      url: () => "about:blank",
      title: vi.fn(async () => ""),
      target: () => ({ _targetId: "blank-page" }),
      evaluate: vi.fn(async () => undefined),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const realPage = {
      url: () => "https://example.com/results",
      title: vi.fn(async () => "Results"),
      target: () => ({ _targetId: "real-page" }),
      evaluate: vi.fn(async () => undefined),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      pages: vi.fn(async () => [aboutBlankPage, realPage]),
      newPage: vi.fn(async () => ({ url: () => "about:blank", target: () => ({ _targetId: "new-page" }) }))
    };

    runtime.tryConnect = vi.fn(async () => browser);
    runtime.installInstrumentation = vi.fn(async () => undefined);
    runtime.cleanupOrphanBlankTabs = vi.fn(async () => undefined);

    const context = await runtime.ensurePage();

    expect(browser.newPage).not.toHaveBeenCalled();
    expect(context.page.url()).toBe("https://example.com/results");
    expect(context.page.target()).toMatchObject({ _targetId: "real-page" });
    expect(context.session.pageUrl).toBe("https://example.com/results");
  });

  it("reuses an existing non-blank page instead of creating a fresh blank tab when session identity is stale", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false
    });
    await new BrowserSessionStateStore(path.join(root, "browser-session-session-b.json")).save({
      pageTargetId: "stale-page",
      pageUrl: "https://example.com/old",
      pageTitle: "Old"
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const aboutBlankPage = {
      url: () => "about:blank",
      title: vi.fn(async () => ""),
      target: () => ({ _targetId: "blank-page" }),
      evaluate: vi.fn(async () => undefined),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const realPage = {
      url: () => "https://example.com/results",
      title: vi.fn(async () => "Results"),
      target: () => ({ _targetId: "real-page" }),
      evaluate: vi.fn(async () => undefined),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      pages: vi.fn(async () => [aboutBlankPage, realPage]),
      newPage: vi.fn(async () => ({ url: () => "about:blank", target: () => ({ _targetId: "new-page" }) }))
    };

    runtime.tryConnect = vi.fn(async () => browser);
    runtime.installInstrumentation = vi.fn(async () => undefined);

    const context = await runtime.ensurePage();

    expect(browser.newPage).not.toHaveBeenCalled();
    expect(context.page).toBe(realPage);
    expect(context.session.pageUrl).toBe("https://example.com/results");
  });

  it("does not close the selected blank page before it becomes the current session page", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const blankPage = {
      url: () => "about:blank",
      title: vi.fn(async () => ""),
      target: () => ({ _targetId: "blank-page" }),
      evaluate: vi.fn(async () => undefined),
      evaluateOnNewDocument: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined)
    };
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      pages: vi.fn(async () => [blankPage]),
      newPage: vi.fn(async () => blankPage)
    };

    runtime.tryConnect = vi.fn(async () => browser);
    runtime.installInstrumentation = vi.fn(async () => undefined);

    const context = await runtime.ensurePage();

    expect(blankPage.close).not.toHaveBeenCalled();
    expect(context.page).toBe(blankPage);
    expect(context.session.pageTargetId).toBe("blank-page");
  });

  it("reuses the current blank tab after tab new so the next open stays on that tab", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false,
      lastNonBlankPageTargetId: "real-page",
      lastNonBlankPageUrl: "https://example.com/results",
      lastNonBlankPageTitle: "Results"
    });
    await new BrowserSessionStateStore(path.join(root, "browser-session-session-b.json")).save({
      updatedAt: Date.now(),
      pageTargetId: "blank-page",
      pageUrl: "about:blank",
      pageTitle: ""
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const blankPage = {
      url: () => "about:blank",
      title: vi.fn(async () => ""),
      target: () => ({ _targetId: "blank-page" }),
      evaluate: vi.fn(async () => undefined),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const realPage = {
      url: () => "https://example.com/results",
      title: vi.fn(async () => "Results"),
      target: () => ({ _targetId: "real-page" }),
      evaluate: vi.fn(async () => undefined),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      pages: vi.fn(async () => [realPage, blankPage]),
      newPage: vi.fn(async () => ({ url: () => "about:blank", target: () => ({ _targetId: "new-page" }) }))
    };

    runtime.tryConnect = vi.fn(async () => browser);
    runtime.installInstrumentation = vi.fn(async () => undefined);
    runtime.cleanupOrphanBlankTabs = vi.fn(async () => undefined);

    const context = await runtime.ensurePage();

    expect(browser.newPage).not.toHaveBeenCalled();
    expect(context.page).toBe(blankPage);
    expect(context.session.pageTargetId).toBe("blank-page");
  });

  it("relaunches the browser when the requested headed mode differs from the running mode", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: true
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const closedBrowser = {
      close: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined)
    };
    const launchedPage = {
      url: () => "about:blank",
      title: vi.fn(async () => ""),
      target: () => ({ _targetId: "page-headed" }),
      evaluate: vi.fn(async () => undefined),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const launchedBrowser = {
      wsEndpoint: () => "ws://127.0.0.1:9333/devtools/browser/test",
      pages: vi.fn(async () => [launchedPage]),
      newPage: vi.fn(async () => launchedPage)
    };

    runtime.tryConnect = vi.fn(async (port: number) => port === 9222 ? closedBrowser : launchedBrowser);
    runtime.waitForBrowserToClose = vi.fn(async () => true);
    runtime.launchChrome = vi.fn(async () => undefined);
    runtime.connectWithRetry = vi.fn(async () => launchedBrowser);
    runtime.installInstrumentation = vi.fn(async () => undefined);

    const context = await runtime.ensurePage({ headless: false });

    expect(closedBrowser.close).toHaveBeenCalledTimes(1);
    expect(runtime.launchChrome).toHaveBeenCalledTimes(1);
    expect(context.page).toBe(launchedPage);
  });

  it("retries browser launch after the first connect attempt fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const launchedPage = {
      url: () => "about:blank",
      title: vi.fn(async () => ""),
      target: () => ({ _targetId: "page-1" }),
      evaluate: vi.fn(async () => undefined),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const launchedBrowser = {
      wsEndpoint: () => "ws://127.0.0.1:9333/devtools/browser/test",
      pages: vi.fn(async () => [launchedPage]),
      newPage: vi.fn(async () => launchedPage)
    };

    runtime.launchChrome = vi.fn(async () => undefined);
    runtime.connectWithRetry = vi
      .fn()
      .mockRejectedValueOnce(new Error("first-launch-failed"))
      .mockResolvedValueOnce(launchedBrowser);
    runtime.cleanupProfileProcesses = vi.fn(async () => true);
    runtime.installInstrumentation = vi.fn(async () => undefined);

    const context = await runtime.ensurePage();

    expect(runtime.launchChrome).toHaveBeenCalledTimes(2);
    expect(runtime.connectWithRetry).toHaveBeenCalledTimes(2);
    expect(runtime.cleanupProfileProcesses).toHaveBeenCalledTimes(1);
    expect(context.page).toBe(launchedPage);
  });

  it("returns success from open when goto times out after the target page is already visible", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    let currentUrl = "about:blank";
    let currentTitle = "";
    const page = {
      goto: vi.fn(async () => {
        currentUrl = "https://demo.opencartmarketplace.com/d1/oc_demo/demo_2/admin/";
        currentTitle = "Administration";
        const error = new Error("Navigation timeout of 10000 ms exceeded");
        error.name = "TimeoutError";
        throw error;
      }),
      url: () => currentUrl,
      title: vi.fn(async () => currentTitle),
      target: () => ({ _targetId: "page-1" }),
      waitForFunction: vi.fn(async () => undefined),
      waitForNetworkIdle: vi.fn(async () => undefined)
    };
    const browser = { disconnect: vi.fn(async () => undefined) };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: { headless: false },
      session: { pageTargetId: "page-1", consoleLogs: [], networkEntries: [] }
    }));
    runtime.persistState = vi.fn(async () => undefined);

    const result = await runtime.open("https://demo.opencartmarketplace.com/d1/oc_demo/demo_2/admin/", { headless: false });

    expect(result).toMatchObject({
      ok: true,
      url: "https://demo.opencartmarketplace.com/d1/oc_demo/demo_2/admin/",
      title: "Administration"
    });
  });


  it("returns success from open without re-navigating when the current page already matches the target", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const page = {
      goto: vi.fn(async () => undefined),
      url: () => "https://marmelab.com/react-admin-demo/#/login",
      title: vi.fn(async () => "Posters Galore Administration"),
      target: () => ({ _targetId: "page-1" }),
      waitForFunction: vi.fn(async () => undefined),
      waitForNetworkIdle: vi.fn(async () => undefined)
    };
    const browser = { disconnect: vi.fn(async () => undefined) };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: { headless: false },
      session: { pageTargetId: "page-1", consoleLogs: [], networkEntries: [] }
    }));
    runtime.persistState = vi.fn(async () => undefined);

    const result = await runtime.open("https://marmelab.com/react-admin-demo/", { headless: false });

    expect(page.goto).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      url: "https://marmelab.com/react-admin-demo/#/login",
      title: "Posters Galore Administration"
    });
  });

  it("reuses the visible non-blank page when a reused browser has no session identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const blankPage = {
      url: () => "about:blank",
      target: () => ({ _targetId: "blank-page" })
    };
    const visiblePage = {
      url: () => "https://example.com/results",
      title: vi.fn(async () => "Results"),
      target: () => ({ _targetId: "visible-page" }),
      evaluate: vi.fn(async () => true),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      pages: vi.fn(async () => [blankPage, visiblePage]),
      newPage: vi.fn(async () => ({ url: () => "about:blank", target: () => ({ _targetId: "new-page" }) }))
    };

    runtime.tryConnect = vi.fn(async () => browser);
    runtime.installInstrumentation = vi.fn(async () => undefined);
    runtime.cleanupOrphanBlankTabs = vi.fn(async () => undefined);

    const context = await runtime.ensurePage();

    expect(browser.newPage).not.toHaveBeenCalled();
    expect(context.page).toBe(visiblePage);
  });

  it("closes orphan about:blank tabs that are not claimed by any session", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserSessionStateStore(path.join(root, "browser-session-session-a.json")).save({
      pageTargetId: "claimed-page",
      pageUrl: "https://example.com/a"
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const orphanBlank = {
      url: () => "about:blank",
      target: () => ({ _targetId: "blank-page" }),
      close: vi.fn(async () => undefined)
    };
    const claimedPage = {
      url: () => "https://example.com/a",
      target: () => ({ _targetId: "claimed-page" })
    };
    const currentPage = {
      url: () => "https://example.com/b",
      target: () => ({ _targetId: "current-page" })
    };
    const browser = {
      pages: vi.fn(async () => [orphanBlank, claimedPage, currentPage])
    };

    await runtime.cleanupOrphanBlankTabs(browser, { pageTargetId: "current-page" });

    expect(orphanBlank.close).toHaveBeenCalledTimes(1);
  });

  it("retries browser.pages when Chrome reports a transient target attach failure", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const page = {
      url: () => "https://example.com/results",
      title: vi.fn(async () => "Results"),
      target: () => ({ _targetId: "real-page" }),
      evaluate: vi.fn(async () => true),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      pages: vi
        .fn()
        .mockRejectedValueOnce(new Error("Protocol error (Target.attachToTarget): No target with given id found"))
        .mockResolvedValueOnce([page])
    };

    runtime.tryConnect = vi.fn(async () => browser);
    runtime.installInstrumentation = vi.fn(async () => undefined);
    runtime.cleanupOrphanBlankTabs = vi.fn(async () => undefined);

    const context = await runtime.ensurePage();

    expect(browser.pages).toHaveBeenCalledTimes(2);
    expect(context.page.url()).toBe("https://example.com/results");
  });

  it("retries browser.newPage when Chrome reports a transient target attach failure", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const page = {
      url: () => "about:blank",
      title: vi.fn(async () => ""),
      target: () => ({ _targetId: "fresh-page" }),
      evaluate: vi.fn(async () => undefined),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      pages: vi.fn(async () => []),
      newPage: vi
        .fn()
        .mockRejectedValueOnce(new Error("Protocol error (Target.attachToTarget): No target with given id found"))
        .mockResolvedValueOnce(page)
    };

    runtime.tryConnect = vi.fn(async () => browser);
    runtime.installInstrumentation = vi.fn(async () => undefined);
    runtime.cleanupOrphanBlankTabs = vi.fn(async () => undefined);

    const context = await runtime.ensurePage();

    expect(browser.newPage).toHaveBeenCalledTimes(2);
    expect(context.page).toBe(page);
  });

  it("retries navigation when Chrome reports the main frame too early", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    process.env.FAST_BROWSER_SESSION_ID = "test-session";
    const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    let currentUrl = "about:blank";
    const page = {
      goto: vi
        .fn()
        .mockRejectedValueOnce(new Error("Requesting main frame too early!"))
        .mockImplementationOnce(async () => {
          currentUrl = "https://search.bilibili.com/all?keyword=test";
        }),
      waitForFunction: vi.fn(async () => undefined),
      waitForNetworkIdle: vi.fn(async () => undefined),
      title: vi.fn(async () => (currentUrl === "about:blank" ? "" : "Bilibili")),
      url: vi.fn(() => currentUrl),
      target: () => ({ _targetId: "page-nav" })
    };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: {
        debugPort: 9222,
        wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/old",
        pageTargetId: "page-nav",
        headless: false,
        launchedAt: 1
      }
    }));

    await expect(runtime.open("https://search.bilibili.com/all?keyword=test")).resolves.toMatchObject({
      ok: true,
      url: "https://search.bilibili.com/all?keyword=test"
    });
    expect(page.goto).toHaveBeenCalledTimes(2);
  });

  it("reattaches to the last known page by url when the target id is unavailable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false
    });
    await new BrowserSessionStateStore(path.join(root, "browser-session-session-b.json")).save({
      pageUrl: "https://example.com/publish",
      pageTitle: "Publish"
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "session-b" }) as any;
    const existingPage = {
      url: () => "https://example.com/publish",
      title: vi.fn(async () => "Publish"),
      target: () => ({}),
      evaluate: vi.fn(async () => undefined),
      evaluateOnNewDocument: vi.fn(async () => undefined)
    };
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      pages: vi.fn(async () => [existingPage]),
      newPage: vi.fn(async () => ({ url: () => "about:blank", target: () => ({ _targetId: "new-page" }) }))
    };

    runtime.tryConnect = vi.fn(async () => browser);
    runtime.installInstrumentation = vi.fn(async () => undefined);

    const context = await runtime.ensurePage();

    expect(browser.newPage).not.toHaveBeenCalled();
    expect(context.page).toBe(existingPage);
    expect(context.session.pageUrl).toBe("https://example.com/publish");
  });
  it("persists the latest snapshot refs instead of re-saving stale refs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    process.env.FAST_BROWSER_SESSION_ID = "test-session";
    const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    const page = {
      evaluate: vi.fn(async () => ({
        url: "https://example.com/publish",
        title: "Publish",
        elements: [
          {
            tag: "button",
            text: "Publish",
            selector: "button.publish",
            interactive: true,
            className: "publish"
          }
        ]
      })),
      target: () => ({ _targetId: "page-2" })
    };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: {
        debugPort: 9222,
        wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/old",
        pageTargetId: "page-1",
        refs: [{ ref: "@e1", selector: "div.stale" }],
        headless: true,
        launchedAt: 1
      }
    }));

    await runtime.snapshot();

    const savedSessionState = await new BrowserSessionStateStore(path.join(root, "browser-session-test-session.json")).load();
    expect(savedSessionState?.refs).toEqual([{ ref: "@e1", selector: "button.publish", selectors: ["button.publish"], text: "Publish", tag: "button" }]);
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });

  it("fills fields through the DOM setter path instead of keyboard typing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    process.env.FAST_BROWSER_SESSION_ID = "test-session";
    const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    const page = {
      waitForSelector: vi.fn(async () => undefined),
      focus: vi.fn(async () => undefined),
      $eval: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
      type: vi.fn(async () => undefined),
      keyboard: {
        press: vi.fn(async () => undefined),
        type: vi.fn(async () => undefined)
      },
      title: vi.fn(async () => "Example"),
      url: vi.fn(() => "https://example.com/search"),
      target: () => ({ _targetId: "page-4" })
    };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: {
        debugPort: 9222,
        wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/old",
        pageTargetId: "page-1",
        headless: false,
        launchedAt: 1
      }
    }));

    await runtime.fill("input[name=q]", "??");

    expect(page.$eval).toHaveBeenCalledTimes(1);
    expect(page.click).not.toHaveBeenCalled();
    expect(page.type).not.toHaveBeenCalled();
    expect(page.keyboard.press).not.toHaveBeenCalled();
    expect(page.keyboard.type).not.toHaveBeenCalled();
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });


  it("falls back to a DOM setter when keyboard typing does not change the target value", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    process.env.FAST_BROWSER_SESSION_ID = "test-session";
    const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    const page = {
      focus: vi.fn(async () => undefined),
      $eval: vi
        .fn()
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce(undefined),
      keyboard: {
        press: vi.fn(async () => undefined),
        type: vi.fn(async () => undefined)
      },
      title: vi.fn(async () => "Example"),
      url: vi.fn(() => "https://example.com/search"),
      target: () => ({ _targetId: "page-type-fallback" })
    };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: {
        debugPort: 9222,
        wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/old",
        pageTargetId: "page-1",
        headless: false,
        launchedAt: 1
      }
    }));
    runtime.waitForPageReady = vi.fn(async () => undefined);

    const result = await runtime.type("input[name=q]", "fast-browser");

    expect(page.focus).toHaveBeenCalledWith("input[name=q]");
    expect(page.keyboard.type).toHaveBeenCalledWith("fast-browser", { delay: 50 });
    expect(page.$eval).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      ok: true,
      selector: "input[name=q]"
    });
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });  it("retries multiple transient runtime failures before surfacing the error", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    process.env.FAST_BROWSER_SESSION_ID = "test-session";
    const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    const page = {
      title: vi
        .fn()
        .mockRejectedValueOnce(new Error("Unexpected end of JSON input"))
        .mockRejectedValueOnce(new Error("Unexpected end of JSON input"))
        .mockResolvedValueOnce("Recovered"),
      target: () => ({ _targetId: "page-5" })
    };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: {
        debugPort: 9222,
        wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/old",
        pageTargetId: "page-1",
        headless: false,
        launchedAt: 1
      }
    }));
    runtime.waitForPageReady = vi.fn(async () => undefined);

    await expect(runtime.getTitle()).resolves.toBe("Recovered");
    expect(page.title).toHaveBeenCalledTimes(4);
    expect(runtime.waitForPageReady).toHaveBeenCalledTimes(2);
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });

  it("retries selector waits after transient runtime errors", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    process.env.FAST_BROWSER_SESSION_ID = "test-session";
    const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    const page = {
      waitForSelector: vi
        .fn()
        .mockRejectedValueOnce(new Error("Execution context was destroyed"))
        .mockResolvedValueOnce(undefined),
      title: vi.fn(async () => "Example"),
      url: vi.fn(() => "https://example.com/dashboard"),
      target: () => ({ _targetId: "page-6" })
    };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: {
        debugPort: 9222,
        wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/old",
        pageTargetId: "page-1",
        headless: false,
        launchedAt: 1
      }
    }));
    runtime.waitForPageReady = vi.fn(async () => undefined);

    await expect(runtime.waitForSelector(".ready")).resolves.toMatchObject({
      ok: true,
      selector: ".ready"
    });
    expect(page.waitForSelector).toHaveBeenCalledTimes(2);
    expect(runtime.waitForPageReady).toHaveBeenCalledTimes(1);
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });

  it("retries click after transient runtime errors instead of returning early", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    process.env.FAST_BROWSER_SESSION_ID = "test-session";
    const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    const page = {
      waitForSelector: vi.fn(async () => undefined),
      $eval: vi.fn(async () => undefined),
      click: vi
        .fn()
        .mockRejectedValueOnce(new Error("Execution context was destroyed"))
        .mockResolvedValueOnce(undefined),
      $: vi.fn(async () => null),
      title: vi.fn(async () => "Example"),
      url: vi.fn(() => "https://example.com/dashboard"),
      target: () => ({ _targetId: "page-3" })
    };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: {
        debugPort: 9222,
        wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/old",
        pageTargetId: "page-1",
        headless: false,
        launchedAt: 1
      }
    }));
    runtime.waitForPageReady = vi.fn(async () => undefined);

    await runtime.click(".creator-tab");

    expect(page.click).toHaveBeenCalledTimes(2);
    expect(runtime.waitForPageReady).toHaveBeenCalled();
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });

  it("prefers a live fallback selector when a stored snapshot ref points at stale markup", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    process.env.FAST_BROWSER_SESSION_ID = "test-session";
    const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    const page = {
      waitForSelector: vi.fn(async () => undefined),
      $eval: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
      $: vi.fn(async (selector: string) => (selector === 'button[data-testid="publish-image"]' ? {} : null)),
      title: vi.fn(async () => "Example"),
      url: vi.fn(() => "https://example.com/publish"),
      target: () => ({ _targetId: "page-7" })
    };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: {
        debugPort: 9222,
        wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/old",
        pageTargetId: "page-1",
        refs: [{
          ref: "@e1",
          selector: "div:nth-of-type(7) > button:nth-of-type(2)",
          selectors: [
            "div:nth-of-type(7) > button:nth-of-type(2)",
            'button[data-testid="publish-image"]'
          ]
        }],
        headless: false,
        launchedAt: 1
      }
    }));
    runtime.waitForPageReady = vi.fn(async () => undefined);

    await expect(runtime.click("@e1")).resolves.toMatchObject({
      ok: true,
      selector: 'button[data-testid="publish-image"]'
    });
    expect(page.$).toHaveBeenCalledWith("div:nth-of-type(7) > button:nth-of-type(2)");
    expect(page.$).toHaveBeenCalledWith('button[data-testid="publish-image"]');
    expect(page.waitForSelector).toHaveBeenCalledWith('button[data-testid="publish-image"]', { timeout: 5000, visible: true });
    expect(page.click).toHaveBeenCalledWith('button[data-testid="publish-image"]');
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });


  it("falls back to a semantic ref match when every stored selector is stale", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    process.env.FAST_BROWSER_SESSION_ID = "test-session";
    const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    const page = {
      waitForSelector: vi.fn(async () => undefined),
      $eval: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
      $: vi.fn(async () => null),
      evaluate: vi.fn(async () => ({
        url: "https://example.com/publish",
        title: "Publish",
        elements: [
          {
            tag: "button",
            text: "发布图片",
            selector: 'button[aria-label="发布图片"]',
            selectors: ['button[aria-label="发布图片"]', 'button.primary-action'],
            interactive: true,
            className: "primary-action"
          }
        ]
      })),
      title: vi.fn(async () => "Publish"),
      url: vi.fn(() => "https://example.com/publish"),
      target: () => ({ _targetId: "page-semantic-ref" })
    };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: {
        debugPort: 9222,
        wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/old",
        pageTargetId: "page-1",
        refs: [{
          ref: "@e1",
          selector: "div:nth-of-type(7) > button:nth-of-type(2)",
          selectors: [
            "div:nth-of-type(7) > button:nth-of-type(2)",
            'button[data-testid="publish-image"]'
          ],
          text: "发布图片",
          tag: "button"
        }],
        headless: false,
        launchedAt: 1
      }
    }));
    runtime.waitForPageReady = vi.fn(async () => undefined);

    await expect(runtime.click("@e1")).resolves.toMatchObject({
      ok: true,
      selector: 'button[aria-label="发布图片"]'
    });
    expect(page.$).toHaveBeenCalledWith("div:nth-of-type(7) > button:nth-of-type(2)");
    expect(page.$).toHaveBeenCalledWith('button[data-testid="publish-image"]');
    expect(page.waitForSelector).toHaveBeenCalledWith('button[aria-label="发布图片"]', { timeout: 5000, visible: true });
    expect(page.click).toHaveBeenCalledWith('button[aria-label="发布图片"]');
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });it("waits for page readiness after key presses", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
  tempRoots.push(root);
  const stateFilePath = path.join(root, "state.json");

  const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
  const browser = {
    wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
    disconnect: vi.fn(async () => undefined)
  };
  const page = {
    focus: vi.fn(async () => undefined),
    keyboard: {
      press: vi.fn(async () => undefined),
      type: vi.fn(async () => undefined)
    },
    title: vi.fn(async () => "Search"),
    url: vi.fn(() => "https://example.com/search"),
    target: () => ({ _targetId: "page-8" })
  };

  runtime.ensurePage = vi.fn(async () => ({
    browser,
    page,
    state: {
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/old",
      pageTargetId: "page-1",
      headless: false,
      launchedAt: 1
    }
  }));
  runtime.waitForPageReady = vi.fn(async () => undefined);

  await runtime.press("Enter", { target: "input[name=q]" });

  expect(page.focus).toHaveBeenCalledWith("input[name=q]");
  expect(page.keyboard.press).toHaveBeenCalledWith("Enter");
  expect(runtime.waitForPageReady).toHaveBeenCalled();
  expect(browser.disconnect).toHaveBeenCalledTimes(1);
});


it("commits enter presses on targeted inputs through a form-submit fallback", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
  tempRoots.push(root);
  const stateFilePath = path.join(root, "state.json");

  const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
  const browser = {
    wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
    disconnect: vi.fn(async () => undefined)
  };
  const page = {
    focus: vi.fn(async () => undefined),
    $eval: vi.fn(async () => undefined),
    keyboard: {
      press: vi.fn(async () => undefined),
      type: vi.fn(async () => undefined)
    },
    title: vi.fn(async () => "Search"),
    url: vi.fn(() => "https://example.com/search"),
    target: () => ({ _targetId: "page-enter-submit" })
  };

  runtime.ensurePage = vi.fn(async () => ({
    browser,
    page,
    state: {
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/old",
      pageTargetId: "page-1",
      headless: false,
      launchedAt: 1
    }
  }));
  runtime.waitForPageReady = vi.fn(async () => undefined);

  await runtime.press("Enter", { target: "input[name=q]" });

  expect(page.focus).toHaveBeenCalledWith("input[name=q]");
  expect(page.keyboard.press).toHaveBeenCalledWith("Enter");
  expect(page.$eval).toHaveBeenCalledTimes(1);
  expect(browser.disconnect).toHaveBeenCalledTimes(1);
});it("migrates a legacy workspace browser profile into the global browser home", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-workspace-"));
  const browserHome = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-home-"));
  tempRoots.push(workspaceRoot, browserHome);
  process.env.FAST_BROWSER_ROOT = workspaceRoot;
  process.env.FAST_BROWSER_HOME = browserHome;
  process.chdir(workspaceRoot);

  const legacyProfileDir = path.join(workspaceRoot, ".fast-browser", "chrome-profile", "Default");
  const globalProfileDir = path.join(browserHome, "chrome-profile", "Default");
  await fs.mkdir(legacyProfileDir, { recursive: true });
  await fs.writeFile(path.join(legacyProfileDir, "Preferences"), "legacy-profile", "utf8");

  const runtime = new BrowserRuntimeFacade() as any;
  await runtime.ensureLegacyProfileMigrated(path.join(browserHome, "chrome-profile"));

  await expect(fs.readFile(path.join(globalProfileDir, "Preferences"), "utf8")).resolves.toBe("legacy-profile");
});

it("waits until the current url contains the requested substring", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
  tempRoots.push(root);
  const stateFilePath = path.join(root, "state.json");

  const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
  const browser = {
    wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
    disconnect: vi.fn(async () => undefined)
  };
  const page = {
    waitForFunction: vi.fn(async () => undefined),
    title: vi.fn(async () => "Dashboard"),
    url: vi.fn(() => "https://example.com/dashboard"),
    target: () => ({ _targetId: "page-wait-url" })
  };

  runtime.ensurePage = vi.fn(async () => ({
    browser,
    page,
    state: {
      debugPort: 9222,
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
      headless: false,
      launchedAt: 1
    },
    session: {
      pageTargetId: "page-wait-url",
      consoleLogs: [],
      networkEntries: []
    }
  }));

  const result = await runtime.waitUntilUrlContains("/dashboard", { timeoutMs: 1800 });

  expect(page.waitForFunction).toHaveBeenCalledWith(expect.any(Function), { timeout: 1800 }, "/dashboard");
  expect(result).toMatchObject({
    ok: true,
    url: "https://example.com/dashboard",
    title: "Dashboard"
  });
  expect(browser.disconnect).toHaveBeenCalledTimes(1);
});
it("handles a common page gate by clicking the first matching interactive element", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
  tempRoots.push(root);
  const stateFilePath = path.join(root, "state.json");

  const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
  const browser = {
    wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
    disconnect: vi.fn(async () => undefined)
  };
  const page = {
    evaluate: vi.fn(async () => ({
      url: "https://example.com/adult",
      title: "Adult Gate",
      elements: [
        {
          tag: "button",
          text: "继续浏览",
          selector: "button.continue",
          interactive: true,
          className: "continue",
          selectors: ["button.continue"]
        }
      ]
    })),
    waitForSelector: vi.fn(async () => undefined),
    $eval: vi.fn(async () => undefined),
    click: vi.fn(async () => undefined),
    title: vi.fn(async () => "Adult Gate"),
    url: vi.fn(() => "https://example.com/adult"),
    target: () => ({ _targetId: "page-gate" })
  };

  runtime.ensurePage = vi.fn(async () => ({
    browser,
    page,
    state: {
      debugPort: 9222,
      pageTargetId: "page-gate",
      headless: false,
      launchedAt: 1
    }
  }));
  runtime.waitForPageReady = vi.fn(async () => undefined);

  const result = await runtime.handleGate();

  expect(result.ok).toBe(true);
  expect(result.handled).toBe(1);
  expect(result.matches).toEqual([{ text: "继续浏览", selector: "button.continue" }]);
  expect(page.click).toHaveBeenCalledWith("button.continue");
});

it("collects list items across multiple scroll rounds", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
  tempRoots.push(root);
  const stateFilePath = path.join(root, "state.json");

  const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
  const browser = {
    wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
    disconnect: vi.fn(async () => undefined)
  };
  const page = {
    $$eval: vi
      .fn()
      .mockResolvedValueOnce([
        { text: "A", href: "https://example.com/a", selector: ".feed-item:nth-of-type(1)" },
        { text: "B", href: "https://example.com/b", selector: ".feed-item:nth-of-type(2)" }
      ])
      .mockResolvedValueOnce([
        { text: "A", href: "https://example.com/a", selector: ".feed-item:nth-of-type(1)" },
        { text: "B", href: "https://example.com/b", selector: ".feed-item:nth-of-type(2)" },
        { text: "C", href: "https://example.com/c", selector: ".feed-item:nth-of-type(3)" }
      ])
      .mockResolvedValueOnce([
        { text: "A", href: "https://example.com/a", selector: ".feed-item:nth-of-type(1)" },
        { text: "B", href: "https://example.com/b", selector: ".feed-item:nth-of-type(2)" },
        { text: "C", href: "https://example.com/c", selector: ".feed-item:nth-of-type(3)" }
      ]),
    evaluate: vi.fn(async () => undefined),
    title: vi.fn(async () => "Feed"),
    url: vi.fn(() => "https://example.com/feed"),
    target: () => ({ _targetId: "page-collect" })
  };

  runtime.ensurePage = vi.fn(async () => ({
    browser,
    page,
    state: {
      debugPort: 9222,
      pageTargetId: "page-collect",
      headless: false,
      launchedAt: 1
    }
  }));

  const result = await runtime.collect(".feed-item", { limit: 5, scrollStep: 800, maxRounds: 4 });

  expect(result.ok).toBe(true);
  expect(result.items).toHaveLength(3);
  expect(result.items[2]).toMatchObject({ text: "C", href: "https://example.com/c" });
  expect(page.$$eval).toHaveBeenCalledTimes(3);
});

it("extracts semi-structured content blocks from the current page", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
  tempRoots.push(root);
  const stateFilePath = path.join(root, "state.json");

  const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
  const browser = {
    wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
    disconnect: vi.fn(async () => undefined)
  };
  const page = {
    evaluate: vi.fn(async () => ({
      blocks: [
        { heading: "标题一", text: "第一段内容", hrefs: ["https://example.com/a"] },
        { heading: "标题二", text: "第二段内容", hrefs: [] }
      ]
    })),
    title: vi.fn(async () => "Article"),
    url: vi.fn(() => "https://example.com/article"),
    target: () => ({ _targetId: "page-extract" })
  };

  runtime.ensurePage = vi.fn(async () => ({
    browser,
    page,
    state: {
      debugPort: 9222,
      pageTargetId: "page-extract",
      headless: false,
      launchedAt: 1
    }
  }));

  const result = await runtime.extractBlocks({ selector: ".article-block", limit: 2 });

  expect(result.ok).toBe(true);
  expect(result.blocks).toEqual([
    { heading: "标题一", text: "第一段内容", hrefs: ["https://example.com/a"] },
    { heading: "标题二", text: "第二段内容", hrefs: [] }
  ]);
});

it("lists, switches, creates, and closes tabs while updating the active page", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
  tempRoots.push(root);
  const stateFilePath = path.join(root, "state.json");

  const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
  const stateStore = new BrowserStateStore(stateFilePath);
  await stateStore.save({ debugPort: 9222, pageTargetId: "tab-1", headless: false, launchedAt: 1 });

  const page1 = {
    url: vi.fn(() => "https://example.com/one"),
    title: vi.fn(async () => "One"),
    target: () => ({ _targetId: "tab-1" }),
    bringToFront: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const page2 = {
    url: vi.fn(() => "https://example.com/two"),
    title: vi.fn(async () => "Two"),
    target: () => ({ _targetId: "tab-2" }),
    bringToFront: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const page3 = {
    url: vi.fn(() => "https://example.com/three"),
    title: vi.fn(async () => "Three"),
    target: () => ({ _targetId: "tab-3" }),
    bringToFront: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const browser = {
    wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
    disconnect: vi.fn(async () => undefined),
    pages: vi.fn(async () => [page1, page2]),
    newPage: vi.fn(async () => page3)
  };

  runtime.ensurePage = vi.fn(async () => ({
    browser,
    page: page1,
    state: {
      debugPort: 9222,
      pageTargetId: "tab-1",
      headless: false,
      launchedAt: 1
    }
  }));
  runtime.navigate = vi.fn(async () => undefined);

  const listed = await runtime.tabList();
  expect(listed.tabs).toHaveLength(2);
  expect(listed.tabs[0]).toMatchObject({ id: "tab-1", active: true });

  const switched = await runtime.tabSwitch("2");
  expect(switched.tab).toMatchObject({ id: "tab-2", active: true });
  expect(page2.bringToFront).toHaveBeenCalled();

  const created = await runtime.tabNew("https://example.com/three");
  expect(created.tab).toMatchObject({ id: "tab-3", active: true });
  expect(runtime.navigate).toHaveBeenCalledWith(page3, "https://example.com/three");

  browser.pages = vi.fn(async () => [page1, page2, page3]);
  const closed = await runtime.tabClose("3");
  expect(closed.closed).toMatchObject({ id: "tab-3" });
  expect(page3.close).toHaveBeenCalled();
});
});














describe("BrowserRuntimeFacade interaction semantics", () => {
  const tempRoots: string[] = [];
  const originalSessionId = process.env.FAST_BROWSER_SESSION_ID;

  afterEach(async () => {
    if (originalSessionId === undefined) {
      delete process.env.FAST_BROWSER_SESSION_ID;
    } else {
      process.env.FAST_BROWSER_SESSION_ID = originalSessionId;
    }
    await Promise.all(tempRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempRoots.length = 0;
  });

  it("resolves snapshot refs before pressing keys on a target", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    process.env.FAST_BROWSER_SESSION_ID = "test-session";
    const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    const page = {
      focus: vi.fn(async () => undefined),
      $eval: vi.fn(async () => undefined),
      $: vi.fn(async (selector: string) => selector === 'input[aria-label="搜索"]' ? {} : null),
      keyboard: {
        press: vi.fn(async () => undefined),
        type: vi.fn(async () => undefined)
      },
      title: vi.fn(async () => "Search"),
      url: vi.fn(() => "https://example.com/search"),
      target: () => ({ _targetId: "page-press-ref" })
    };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: {
        debugPort: 9222,
        wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
        headless: false,
        launchedAt: 1
      },
      session: {
        pageTargetId: "page-press-ref",
        refs: [{
          ref: "@e1",
          selector: "div:nth-of-type(4) > input:nth-of-type(1)",
          selectors: ['div:nth-of-type(4) > input:nth-of-type(1)', 'input[aria-label="搜索"]'],
          text: "",
          tag: "input"
        }],
        consoleLogs: [],
        networkEntries: []
      }
    }));
    runtime.waitForPageReady = vi.fn(async () => undefined);

    const result = await runtime.press("Enter", { target: "@e1" });

    expect(page.focus).toHaveBeenCalledWith('input[aria-label="搜索"]');
    expect(page.keyboard.press).toHaveBeenCalledWith("Enter");
    expect(result).toMatchObject({
      selector: 'input[aria-label="搜索"]',
      selectorCandidates: ['div:nth-of-type(4) > input:nth-of-type(1)', 'input[aria-label="搜索"]']
    });
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });

  it("dispatches input and change events when filling a field through the DOM setter path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    tempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    process.env.FAST_BROWSER_SESSION_ID = "test-session";
    const runtime = new BrowserRuntimeFacade({ stateFilePath }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    const dispatchedEvents: string[] = [];
    const inputPrototype = {
      set value(nextValue: string) {
        (this as { __value?: string }).__value = nextValue;
      }
    };
    const element = Object.create(inputPrototype) as {
      __value?: string;
      dispatchEvent: (event: { type: string }) => void;
    };
    element.dispatchEvent = (event) => {
      dispatchedEvents.push(event.type);
    };

    const page = {
      waitForSelector: vi.fn(async () => undefined),
      focus: vi.fn(async () => undefined),
      $eval: vi.fn(async (_selector: string, callback: (node: unknown, nextValue: string) => void, nextValue: string) => {
        callback(element, nextValue);
        return undefined;
      }),
      title: vi.fn(async () => "Example"),
      url: vi.fn(() => "https://example.com/search"),
      target: () => ({ _targetId: "page-fill-events" })
    };

    runtime.ensurePage = vi.fn(async () => ({
      browser,
      page,
      state: {
        debugPort: 9222,
        wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/test",
        headless: false,
        launchedAt: 1
      },
      session: {
        pageTargetId: "page-fill-events",
        consoleLogs: [],
        networkEntries: []
      }
    }));
    runtime.waitForPageReady = vi.fn(async () => undefined);

    await runtime.fill("input[name=q]", "hello");

    expect(element.__value).toBe("hello");
    expect(dispatchedEvents).toEqual(["input", "change"]);
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("BrowserRuntimeFacade auth and clone lifecycle", () => {
  const lifecycleTempRoots: string[] = [];
  const previousHome = process.env.FAST_BROWSER_HOME;

  afterEach(async () => {
    if (previousHome === undefined) {
      delete process.env.FAST_BROWSER_HOME;
    } else {
      process.env.FAST_BROWSER_HOME = previousHome;
    }
    await Promise.all(lifecycleTempRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    lifecycleTempRoots.length = 0;
  });

  it("syncs auth state from the session clone profile back to the base profile", async () => {
    const browserHome = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-home-"));
    lifecycleTempRoots.push(browserHome);
    process.env.FAST_BROWSER_HOME = browserHome;

    const runtime = new BrowserRuntimeFacade({ sessionId: "zhihu-a" }) as any;
    const baseAuthFile = path.join(runtime.baseProfileDir, "Default", "Login Data");
    const cloneAuthFile = path.join(runtime.profileDir, "Default", "Login Data");
    await fs.mkdir(path.dirname(baseAuthFile), { recursive: true });
    await fs.mkdir(path.dirname(cloneAuthFile), { recursive: true });
    await fs.writeFile(baseAuthFile, "base-auth", "utf8");
    await fs.writeFile(cloneAuthFile, "clone-auth", "utf8");

    runtime.ensurePage = vi.fn(async () => ({ browser: { disconnect: vi.fn(async () => undefined) }, page: {}, state: {}, session: {} }));
    runtime.exportAuthSnapshot = vi.fn(async () => {
      const authSnapshotFilePath = path.join(browserHome, "sessions", "browser-auth.json");
      await fs.mkdir(path.dirname(authSnapshotFilePath), { recursive: true });
      await fs.writeFile(authSnapshotFilePath, JSON.stringify({ updatedAt: Date.now(), cookies: [{ name: "SESSDATA" }, { name: "DedeUserID" }] }), "utf8");
      return 2;
    });
    const result = await runtime.authSync();

    await expect(fs.readFile(baseAuthFile, "utf8")).resolves.toBe("clone-auth");
    const authSnapshotFilePath = path.join(browserHome, "sessions", "browser-auth.json");
    await expect(fs.readFile(authSnapshotFilePath, "utf8")).resolves.toContain('"cookies"');
    expect(result).toMatchObject({
      ok: true,
      synced: true,
      mode: "session-clone",
      exportedCookies: 2,
      notice: "已导出 2 个 cookies 到认证快照。 已将当前 clone profile 的认证状态同步回 base profile。"
    });
  });

  it("reports lifecycle fields from browser status", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    lifecycleTempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      headless: false,
      launchedAt: 1,
      lastUsedAt: Date.now() - 60_000,
      authSyncedAt: Date.now() - 30_000
    } as any);

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "zhihu-a" });
    await expect(runtime.browserStatus()).resolves.toMatchObject({
      ok: true,
      running: false,
      lifecycleStatus: "idle"
    });
  });

  it("treats running but stale sessions as idle and does not refresh lastUsedAt from browser status", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    lifecycleTempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");
    const staleLastUsedAt = Date.now() - 20 * 60 * 1000;

    await new BrowserStateStore(stateFilePath).save({
      debugPort: 9222,
      headless: false,
      launchedAt: 1,
      lastUsedAt: staleLastUsedAt
    } as any);

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "zhihu-a" }) as any;
    const browser = {
      wsEndpoint: () => "ws://127.0.0.1:9222/devtools/browser/test",
      disconnect: vi.fn(async () => undefined)
    };
    const page = {
      url: vi.fn(() => "https://www.zhihu.com/hot"),
      title: vi.fn(async () => "????"),
      target: () => ({ _targetId: "page-1" })
    };

    runtime.tryConnect = vi.fn(async () => browser);
    runtime.listBrowserPages = vi.fn(async () => [page]);

    const result = await runtime.browserStatus();
    const saved = await new BrowserStateStore(stateFilePath).load();

    expect(result).toMatchObject({
      ok: true,
      running: true,
      lifecycleStatus: "idle"
    });
    expect(saved?.lastUsedAt).toBe(staleLastUsedAt);
  });

  it("returns current session status with lifecycle and file paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    lifecycleTempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");
    const sessionStateFilePath = path.join(root, "browser-session-zhihu-a.json");

    await new BrowserStateStore(stateFilePath).save({
      headless: false,
      launchedAt: 1,
      lastUsedAt: Date.now() - 60_000,
      authSyncedAt: Date.now() - 30_000,
      pinned: true,
      pinnedAt: Date.now() - 15_000
    } as any);
    await new BrowserSessionStateStore(sessionStateFilePath).save({
      pageTargetId: "page-1",
      pageUrl: "https://www.zhihu.com/hot",
      pageTitle: "知乎热榜"
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionStateFilePath, sessionId: "zhihu-a" });
    await expect(runtime.sessionStatus()).resolves.toMatchObject({
      ok: true,
      session: {
        sessionId: "zhihu-a",
        sessionScope: "zhihu-a",
        current: true,
        running: false,
        profileKind: "session-clone",
        browserStateFilePath: stateFilePath,
        sessionStateFilePath,
        lifecycleStatus: "idle",
        pinned: true,
        pageTargetId: "page-1",
        url: "https://www.zhihu.com/hot",
        title: "知乎热榜"
      }
    });
  });

  it("lists current and stored session clone statuses", async () => {
    const browserHome = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-home-"));
    lifecycleTempRoots.push(browserHome);
    process.env.FAST_BROWSER_HOME = browserHome;

    const currentScope = "zhihu-a";
    const stateFilePath = path.join(browserHome, "sessions", "browser-meta", `${currentScope}.json`);
    const sessionStateFilePath = path.join(browserHome, "sessions", "browser", `${currentScope}.json`);
    const otherScope = "bili-b";
    const otherMetaPath = path.join(browserHome, "sessions", "browser-meta", `${otherScope}.json`);
    const otherSessionStatePath = path.join(browserHome, "sessions", "browser", `${otherScope}.json`);

    await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
    await fs.mkdir(path.dirname(sessionStateFilePath), { recursive: true });

    await new BrowserStateStore(stateFilePath).save({
      headless: false,
      launchedAt: 1,
      lastUsedAt: Date.now() - 2 * 60 * 1000
    } as any);
    await new BrowserSessionStateStore(sessionStateFilePath).save({
      pageUrl: "https://www.zhihu.com/hot",
      pageTitle: "知乎热榜"
    });

    await new BrowserStateStore(otherMetaPath).save({
      headless: true,
      launchedAt: 1,
      lastUsedAt: Date.now() - 30 * 60 * 60 * 1000,
      pinned: true,
      pinnedAt: Date.now() - 29 * 60 * 60 * 1000
    } as any);
    await new BrowserSessionStateStore(otherSessionStatePath).save({
      pageUrl: "https://search.bilibili.com/all?keyword=tavern%20ai",
      pageTitle: "搜索结果"
    });

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionStateFilePath, sessionId: "zhihu-a" }) as any;
    const result = await runtime.sessionList();

    expect(result.ok).toBe(true);
    expect(result.sessions[0]).toMatchObject({
      sessionId: "zhihu-a",
      current: true,
      lifecycleStatus: "idle"
    });
    expect(result.sessions).toContainEqual(expect.objectContaining({
      sessionId: otherScope,
      current: false,
      pinned: true,
      lifecycleStatus: "expired",
      url: "https://search.bilibili.com/all?keyword=tavern%20ai",
      title: "搜索结果"
    }));
  });

  it("reports pinned fields from browser status", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    lifecycleTempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    await new BrowserStateStore(stateFilePath).save({
      headless: false,
      launchedAt: 1,
      lastUsedAt: Date.now() - 60_000,
      pinned: true,
      pinnedAt: Date.now() - 15_000
    } as any);

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "zhihu-a" });
    await expect(runtime.browserStatus()).resolves.toMatchObject({
      ok: true,
      pinned: true
    });
  });

  it("pins and unpins the current session", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-runtime-"));
    lifecycleTempRoots.push(root);
    const stateFilePath = path.join(root, "state.json");

    const runtime = new BrowserRuntimeFacade({ stateFilePath, sessionId: "zhihu-a" }) as any;

    const pinResult = await runtime.sessionPin();
    const pinnedState = await new BrowserStateStore(stateFilePath).load();
    const unpinResult = await runtime.sessionUnpin();
    const unpinnedState = await new BrowserStateStore(stateFilePath).load();

    expect(pinResult).toMatchObject({ ok: true, pinned: true });
    expect(pinnedState).toMatchObject({ pinned: true });
    expect(typeof pinnedState?.pinnedAt).toBe("number");
    expect(unpinResult).toMatchObject({ ok: true, pinned: false });
    expect(unpinnedState?.pinned).toBe(false);
    expect(unpinnedState?.pinnedAt).toBeUndefined();
  });

  it("cleans up expired session clone profiles and preserves auth in the base profile", async () => {
    const browserHome = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-home-"));
    lifecycleTempRoots.push(browserHome);
    process.env.FAST_BROWSER_HOME = browserHome;

    const runtime = new BrowserRuntimeFacade({ sessionId: "cleanup-runner" }) as any;
    const sessionScope = "expired-session";
    const cloneProfileDir = path.join(browserHome, "chrome-profiles", sessionScope);
    const metaStatePath = path.join(browserHome, "sessions", "browser-meta", `${sessionScope}.json`);
    const browserSessionStatePath = path.join(browserHome, "sessions", "browser", `${sessionScope}.json`);
    const baseAuthFile = path.join(runtime.baseProfileDir, "Default", "Login Data");
    const cloneAuthFile = path.join(cloneProfileDir, "Default", "Login Data");

    await fs.mkdir(path.dirname(baseAuthFile), { recursive: true });
    await fs.mkdir(path.dirname(cloneAuthFile), { recursive: true });
    await fs.mkdir(path.dirname(metaStatePath), { recursive: true });
    await fs.mkdir(path.dirname(browserSessionStatePath), { recursive: true });
    await fs.writeFile(baseAuthFile, "base-auth", "utf8");
    await fs.writeFile(cloneAuthFile, "clone-auth", "utf8");
    await fs.writeFile(metaStatePath, JSON.stringify({
      lastUsedAt: Date.now() - 48 * 60 * 60 * 1000,
      launchedAt: Date.now() - 48 * 60 * 60 * 1000,
      headless: false
    }, null, 2), "utf8");
    await fs.writeFile(browserSessionStatePath, JSON.stringify({ pageTargetId: "page-1" }, null, 2), "utf8");

    const result = await runtime.sessionCleanup({ maxAgeHours: 24 });

    expect(result).toMatchObject({ ok: true, ttlHours: 24, removed: [sessionScope] });
    await expect(fs.readFile(baseAuthFile, "utf8")).resolves.toBe("clone-auth");
    await expect(fs.access(cloneProfileDir)).rejects.toBeTruthy();
    await expect(fs.access(metaStatePath)).rejects.toBeTruthy();
    await expect(fs.access(browserSessionStatePath)).rejects.toBeTruthy();
  });

  it("keeps pinned session clone profiles during cleanup", async () => {
    const browserHome = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-home-"));
    lifecycleTempRoots.push(browserHome);
    process.env.FAST_BROWSER_HOME = browserHome;

    const runtime = new BrowserRuntimeFacade({ sessionId: "cleanup-runner" }) as any;
    const sessionScope = "pinned-session";
    const cloneProfileDir = path.join(browserHome, "chrome-profiles", sessionScope);
    const metaStatePath = path.join(browserHome, "sessions", "browser-meta", `${sessionScope}.json`);

    await fs.mkdir(cloneProfileDir, { recursive: true });
    await fs.mkdir(path.dirname(metaStatePath), { recursive: true });
    await fs.writeFile(metaStatePath, JSON.stringify({
      lastUsedAt: Date.now() - 48 * 60 * 60 * 1000,
      pinned: true,
      pinnedAt: Date.now() - 47 * 60 * 60 * 1000
    }, null, 2), "utf8");

    const result = await runtime.sessionCleanup({ maxAgeHours: 24 });

    expect(result.removed).toEqual([]);
    expect(result.kept).toContainEqual({ sessionId: sessionScope, reason: "pinned" });
    await expect(fs.access(cloneProfileDir)).resolves.toBeUndefined();
    await expect(fs.access(metaStatePath)).resolves.toBeUndefined();
  });

  it("keeps running but stale sessions without classifying them as active-browser", async () => {
    const browserHome = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-home-"));
    lifecycleTempRoots.push(browserHome);
    process.env.FAST_BROWSER_HOME = browserHome;

    const runtime = new BrowserRuntimeFacade({ sessionId: "cleanup-runner" }) as any;
    const sessionScope = "running-stale-session";
    const cloneProfileDir = path.join(browserHome, "chrome-profiles", sessionScope);
    const metaStatePath = path.join(browserHome, "sessions", "browser-meta", `${sessionScope}.json`);

    await fs.mkdir(cloneProfileDir, { recursive: true });
    await fs.mkdir(path.dirname(metaStatePath), { recursive: true });
    await fs.writeFile(metaStatePath, JSON.stringify({
      debugPort: 9222,
      lastUsedAt: Date.now() - 20 * 60 * 1000,
      headless: false
    }, null, 2), "utf8");

    runtime.tryConnect = vi.fn(async () => ({ disconnect: vi.fn(async () => undefined) }));

    const result = await runtime.sessionCleanup({ maxAgeHours: 24 });

    expect(result.removed).toEqual([]);
    expect(result.kept).toContainEqual({ sessionId: sessionScope, reason: "running-idle-browser" });
    await expect(fs.access(cloneProfileDir)).resolves.toBeUndefined();
    await expect(fs.access(metaStatePath)).resolves.toBeUndefined();
  });
});

