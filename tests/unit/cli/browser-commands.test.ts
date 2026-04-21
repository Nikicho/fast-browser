import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { registerBrowserCommands } from "../../../src/cli/commands/browser";
import { createProgram } from "../../../src/cli/parser";

describe("browser CLI commands", () => {
  it("passes headed mode to open", async () => {
    const router = {
      open: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "open", "https://example.com", "--headed"]);

    expect(router.open).toHaveBeenCalledWith("https://example.com", expect.objectContaining({
      headless: false,
      onProgress: expect.any(Function)
    }));
  });

  it("prints a human-readable open summary by default", async () => {
    const router = {
      open: vi.fn(async () => ({ ok: true, url: "https://example.com", title: "Example Domain" }))
    } as any;
    const program = createProgram().exitOverride();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "open", "https://example.com"]);

    expect(consoleSpy).toHaveBeenCalledWith("Open succeeded\nURL: https://example.com\nTitle: Example Domain");

    consoleSpy.mockRestore();
  });

  it("prints open progress to stderr and keeps final json on stdout", async () => {
    const router = {
      open: vi.fn(async (_url: string, options?: { onProgress?: (message: string) => void }) => {
        options?.onProgress?.("profile ready");
        options?.onProgress?.("cdp connected");
        return { ok: true, url: "https://example.com", title: "Example Domain" };
      })
    } as any;
    const program = createProgram().exitOverride();
    const stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "open", "https://example.com", "--json"]);

    expect(stderrSpy).toHaveBeenNthCalledWith(1, "[open] starting");
    expect(stderrSpy).toHaveBeenNthCalledWith(2, "[open] profile ready");
    expect(stderrSpy).toHaveBeenNthCalledWith(3, "[open] cdp connected");
    expect(stdoutSpy).toHaveBeenCalledWith(`{
  "ok": true,
  "url": "https://example.com",
  "title": "Example Domain"
}`);

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("rejects conflicting headed and headless flags", async () => {
    const router = {
      open: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registerBrowserCommands(program, { router });

    await expect(program.parseAsync(["node", "fast-browser", "open", "https://example.com", "--headed", "--headless"]))
      .rejects.toThrow(/cannot be used together/i);
    expect(router.open).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
  });

  it("passes snapshot options through to the router", async () => {
    const router = {
      snapshot: vi.fn(async () => ({ url: "https://example.com", title: "Example", text: "body", interactive: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "snapshot", "--interactive-only", "--selector", ".result", "--max-items", "25"]);

    expect(router.snapshot).toHaveBeenCalledWith({ interactiveOnly: true, selector: ".result", maxItems: 25 });
  });

  it("passes click timeout through to the router", async () => {
    const router = {
      click: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "click", "@e1", "--timeout", "1500"]);

    expect(router.click).toHaveBeenCalledWith("@e1", { timeoutMs: 1500 });
  });


  it("accepts click target via --target for PowerShell-safe snapshot refs", async () => {
    const router = {
      click: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "click", "--target", "@e1", "--timeout", "1500"]);

    expect(router.click).toHaveBeenCalledWith("@e1", { timeoutMs: 1500 });
  });

  it("returns a helpful click target error when no target is provided", async () => {
    const router = {
      click: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await expect(program.parseAsync(["node", "fast-browser", "click"]))
      .rejects.toThrow(/use --target/i);
    expect(router.click).not.toHaveBeenCalled();
  });

  it("passes type delay through to the router", async () => {
    const router = {
      type: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "type", "input[name=q]", "hello", "--delay", "20"]);

    expect(router.type).toHaveBeenCalledWith("input[name=q]", "hello", { delayMs: 20 });
  });

  it("passes fill timeout through to the router", async () => {
    const router = {
      fill: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "fill", "input[name=q]", "hello", "--timeout", "2200"]);

    expect(router.fill).toHaveBeenCalledWith("input[name=q]", "hello", { timeoutMs: 2200 });
  });

  it("passes press target through to the router", async () => {
    const router = {
      press: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "press", "Enter", "--target", "input[name=q]"]);

    expect(router.press).toHaveBeenCalledWith("Enter", { target: "input[name=q]" });
  });

  it("passes hover timeout through to the router", async () => {
    const router = {
      hover: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "hover", ".menu", "--timeout", "900"]);

    expect(router.hover).toHaveBeenCalledWith(".menu", { timeoutMs: 900 });
  });

  it("passes scroll amount through to the router", async () => {
    const router = {
      scroll: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "scroll", "down", "640"]);

    expect(router.scroll).toHaveBeenCalledWith("down", 640);
  });

  it("passes screenshot options through to the router", async () => {
    const router = {
      screenshot: vi.fn(async () => ({ ok: true, path: "shot.png", url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "screenshot", "shot.png", "--full-page"]);

    expect(router.screenshot).toHaveBeenCalledWith("shot.png", { fullPage: true });
  });


  it("accepts tab new url via --url", async () => {
    const router = {
      tabNew: vi.fn(async () => ({ ok: true, tab: { id: "tab-1", url: "https://example.com", active: true } }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "tab", "new", "--url", "https://example.com"]);

    expect(router.tabNew).toHaveBeenCalledWith("https://example.com");
  });

  it("accepts tab switch id via --id", async () => {
    const router = {
      tabSwitch: vi.fn(async () => ({ ok: true, tab: { id: "tab-1", url: "https://example.com", active: true } }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "tab", "switch", "--id", "tab-1"]);

    expect(router.tabSwitch).toHaveBeenCalledWith("tab-1");
  });

  it("rejects conflicting tab new url inputs", async () => {
    const router = {
      tabNew: vi.fn(async () => ({ ok: true }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await expect(program.parseAsync(["node", "fast-browser", "tab", "new", "https://a.example", "--url", "https://b.example"]))
      .rejects.toThrow(/tab new/i);
    expect(router.tabNew).not.toHaveBeenCalled();
  });

  it("rejects conflicting tab switch targets", async () => {
    const router = {
      tabSwitch: vi.fn(async () => ({ ok: true }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await expect(program.parseAsync(["node", "fast-browser", "tab", "switch", "2", "--id", "tab-1"]))
      .rejects.toThrow(/tab switch/i);
    expect(router.tabSwitch).not.toHaveBeenCalled();
  });

  it("passes eval expression through to the router", async () => {
    const router = {
      evalExpression: vi.fn(async () => ({ ok: true, value: 1, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "eval", "document.title"]);

    expect(router.evalExpression).toHaveBeenCalledWith("document.title");
  });

  it("loads eval expressions from a file to avoid shell quoting issues", async () => {
    const router = {
      evalExpression: vi.fn(async () => ({ ok: true, value: "Example", url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-cli-"));
    const scriptPath = path.join(tempDir, "eval.js");
    await fs.writeFile(scriptPath, "document.title + '::' + location.pathname", "utf8");

    try {
      await program.parseAsync(["node", "fast-browser", "eval", "--file", scriptPath]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }

    expect(router.evalExpression).toHaveBeenCalledWith("document.title + '::' + location.pathname");
  });

  it("runs browser scripts from a file", async () => {
    const router = {
      open: vi.fn(async () => ({ ok: true, url: "https://example.com" })),
      click: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-cli-"));
    const scriptPath = path.join(tempDir, "steps.browser.json");
    await fs.writeFile(scriptPath, JSON.stringify({
      steps: [
        { command: "open", args: ["https://example.com"] },
        { command: "click", args: ["button.primary"] }
      ]
    }, null, 2), "utf8");

    try {
      await program.parseAsync(["node", "fast-browser", "run-script", scriptPath]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }

    expect(router.open).toHaveBeenCalledWith("https://example.com", {});
    expect(router.click).toHaveBeenCalledWith("button.primary", {});
  });

  it("calls navigation and metadata commands", async () => {
    const router = {
      goBack: vi.fn(async () => ({ ok: true, url: "https://example.com" })),
      goForward: vi.fn(async () => ({ ok: true, url: "https://example.com" })),
      reload: vi.fn(async () => ({ ok: true, url: "https://example.com" })),
      getUrl: vi.fn(async () => "https://example.com"),
      getTitle: vi.fn(async () => "Example")
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "goback"]);
    await program.parseAsync(["node", "fast-browser", "goforward"]);
    await program.parseAsync(["node", "fast-browser", "reload"]);
    await program.parseAsync(["node", "fast-browser", "getUrl"]);
    await program.parseAsync(["node", "fast-browser", "getTitle"]);

    expect(router.goBack).toHaveBeenCalledTimes(1);
    expect(router.goForward).toHaveBeenCalledTimes(1);
    expect(router.reload).toHaveBeenCalledTimes(1);
    expect(router.getUrl).toHaveBeenCalledTimes(1);
    expect(router.getTitle).toHaveBeenCalledTimes(1);
  });

  it("passes wait options through to the router", async () => {
    const router = {
      wait: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "wait", "500", "--text", "Ready", "--url", "/dashboard", "--fn", "window.ready === true"]);

    expect(router.wait).toHaveBeenCalledWith({ ms: 500, text: "Ready", urlIncludes: "/dashboard", fn: "window.ready === true" });
  });

  it("rejects invalid waitForSelector state values", async () => {
    const router = {
      waitForSelector: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await expect(program.parseAsync(["node", "fast-browser", "waitForSelector", ".result", "--state", "present"]))
      .rejects.toThrow(/state/i);
    expect(router.waitForSelector).not.toHaveBeenCalled();
  });

  it("passes waitForSelector options through to the router", async () => {
    const router = {
      waitForSelector: vi.fn(async () => ({ ok: true, url: "https://example.com" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "waitForSelector", ".result", "--state", "visible", "--timeout", "1800"]);

    expect(router.waitForSelector).toHaveBeenCalledWith(".result", { state: "visible", timeoutMs: 1800 });
  });

  it("passes console filter and clear options through to the router", async () => {
    const router = {
      consoleLogs: vi.fn(async () => ({ logs: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "console", "--type", "error", "--text", "timeout", "--clear"]);

    expect(router.consoleLogs).toHaveBeenCalledWith({ clear: true, type: "error", text: "timeout" });
  });

  it("passes network filter and clear options through to the router", async () => {
    const router = {
      networkEntries: vi.fn(async () => ({ entries: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "network", "--url", "/api/orders", "--method", "POST", "--status", "200", "--resource-type", "xhr", "--clear"]);

    expect(router.networkEntries).toHaveBeenCalledWith({
      clear: true,
      urlIncludes: "/api/orders",
      method: "POST",
      status: 200,
      resourceType: "xhr"
    });
  });

  it("passes cookie actions through to the router", async () => {
    const router = {
      cookies: vi.fn(async () => ({ cookies: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "cookies", "set", "--name", "sid", "--value", "abc", "--url", "https://example.com"]);

    expect(router.cookies).toHaveBeenCalledWith("set", { name: "sid", value: "abc", url: "https://example.com" });
  });

  it("passes storage commands through to the router", async () => {
    const router = {
      storage: vi.fn(async () => ({ ok: true }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "localStorage", "set", "token", "abc"]);
    await program.parseAsync(["node", "fast-browser", "sessionStorage", "remove", "draft"]);

    expect(router.storage).toHaveBeenNthCalledWith(1, "localStorage", "set", "token", "abc");
    expect(router.storage).toHaveBeenNthCalledWith(2, "sessionStorage", "remove", "draft", undefined);
  });

  it("calls performance metrics", async () => {
    const router = {
      performanceMetrics: vi.fn(async () => ({ navigation: null, memory: null }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "performance"]);

    expect(router.performanceMetrics).toHaveBeenCalledTimes(1);
  });

  it("returns browser status", async () => {
    const router = {
      browserStatus: vi.fn(async () => ({ ok: true, running: true, mode: "headed" }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "browser", "status"]);

    expect(router.browserStatus).toHaveBeenCalledTimes(1);
  });

  it("closes the browser", async () => {
    const router = {
      browserClose: vi.fn(async () => ({ ok: true, closed: true }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "browser", "close"]);

    expect(router.browserClose).toHaveBeenCalledTimes(1);
  });
  it("passes gate options through to the router", async () => {
    const router = {
      gate: vi.fn(async () => ({ ok: true, handled: 1, matches: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "gate", "--text", "继续"]);

    expect(router.gate).toHaveBeenCalledWith({ text: "继续" });
  });

  it("passes collect options through to the router", async () => {
    const router = {
      collect: vi.fn(async () => ({ ok: true, items: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "collect", ".feed-item", "--limit", "30", "--scroll-step", "900", "--max-rounds", "8"]);

    expect(router.collect).toHaveBeenCalledWith(".feed-item", { limit: 30, scrollStep: 900, maxRounds: 8 });
  });

  it("passes extract-blocks options through to the router", async () => {
    const router = {
      extractBlocks: vi.fn(async () => ({ ok: true, blocks: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "extract-blocks", "--selector", ".feed-item", "--limit", "12"]);

    expect(router.extractBlocks).toHaveBeenCalledWith({ selector: ".feed-item", limit: 12 });
  });

  it("routes tab commands", async () => {
    const router = {
      tabList: vi.fn(async () => ({ ok: true, tabs: [] })),
      tabNew: vi.fn(async () => ({ ok: true, tab: { id: "tab-2" } })),
      tabSwitch: vi.fn(async () => ({ ok: true, tab: { id: "tab-2" } })),
      tabClose: vi.fn(async () => ({ ok: true, closed: { id: "tab-2" } }))
    } as any;
    const program = createProgram().exitOverride();
    registerBrowserCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "tab", "list"]);
    await program.parseAsync(["node", "fast-browser", "tab", "new", "https://example.com"]);
    await program.parseAsync(["node", "fast-browser", "tab", "switch", "2"]);
    await program.parseAsync(["node", "fast-browser", "tab", "close", "2"]);

    expect(router.tabList).toHaveBeenCalledTimes(1);
    expect(router.tabNew).toHaveBeenCalledWith("https://example.com");
    expect(router.tabSwitch).toHaveBeenCalledWith("2");
    expect(router.tabClose).toHaveBeenCalledWith("2");
  });
});




