import { describe, expect, it, vi } from "vitest";

import { registerAuthCommands } from "../../../src/cli/commands/auth";
import { registerCacheCommand } from "../../../src/cli/commands/cache";
import { registerHealthCommand } from "../../../src/cli/commands/health";
import { registerInfoCommand } from "../../../src/cli/commands/info";
import { registerListCommand } from "../../../src/cli/commands/list";
import { registerSessionCommands } from "../../../src/cli/commands/session";
import { registerSiteCommand } from "../../../src/cli/commands/site";
import { registerTestCommand } from "../../../src/cli/commands/test";
import { registerWorkspaceCommand } from "../../../src/cli/commands/workspace";
import { createProgram } from "../../../src/cli/parser";

describe("system CLI commands", () => {
  it("lists adapters", async () => {
    const router = {
      list: vi.fn(async () => [{ id: "github", commands: ["search"] }])
    } as any;
    const program = createProgram().exitOverride();
    registerListCommand(program, { router });

    await program.parseAsync(["node", "fast-browser", "list"]);

    expect(router.list).toHaveBeenCalledTimes(1);
  });

  it("returns adapter info", async () => {
    const router = {
      info: vi.fn(async () => ({ id: "github" }))
    } as any;
    const program = createProgram().exitOverride();
    registerInfoCommand(program, { router });

    await program.parseAsync(["node", "fast-browser", "info", "github"]);

    expect(router.info).toHaveBeenCalledWith("github");
  });

  it("returns command-level adapter info", async () => {
    const router = {
      info: vi.fn(async () => ({ adapterId: "zhihu", command: { name: "search", args: [{ name: "query", type: "string", required: true }] } }))
    } as any;
    const program = createProgram().exitOverride();
    registerInfoCommand(program, { router });

    await program.parseAsync(["node", "fast-browser", "info", "zhihu/search"]);

    expect(router.info).toHaveBeenCalledWith("zhihu/search");
  });

  it("returns health for a specific adapter", async () => {
    const router = {
      health: vi.fn(async () => ({ runtime: { ok: true }, adapters: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerHealthCommand(program, { router });

    await program.parseAsync(["node", "fast-browser", "health", "github"]);

    expect(router.health).toHaveBeenCalledWith("github");
  });

  it("returns workspace information", async () => {
    const router = {
      workspace: vi.fn(async () => ({
        projectRoot: "D:/AIWorks/skills/fast-browser",
        adaptersDir: "D:/AIWorks/skills/fast-browser/src/adapters",
        browserProfileKind: "session-clone"
      }))
    } as any;
    const program = createProgram().exitOverride();
    registerWorkspaceCommand(program, { router });

    await program.parseAsync(["node", "fast-browser", "workspace"]);

    expect(router.workspace).toHaveBeenCalledTimes(1);
  });

  it("prints workspace information as json", async () => {
    const router = {
      workspace: vi.fn(async () => ({
        projectRoot: "D:/AIWorks/skills/fast-browser",
        adaptersDir: "D:/AIWorks/skills/fast-browser/src/adapters",
        browserProfileKind: "session-clone"
      }))
    } as any;
    const program = createProgram().exitOverride();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    registerWorkspaceCommand(program, { router });

    await program.parseAsync(["node", "fast-browser", "workspace", "--json"]);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(`{
  "projectRoot": "D:/AIWorks/skills/fast-browser",
  "adaptersDir": "D:/AIWorks/skills/fast-browser/src/adapters",
  "browserProfileKind": "session-clone"
}`);

    consoleSpy.mockRestore();
  });

  it("runs auth sync", async () => {
    const router = {
      authSync: vi.fn(async () => ({ ok: true, synced: true }))
    } as any;
    const program = createProgram().exitOverride();
    registerAuthCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "auth", "sync"]);

    expect(router.authSync).toHaveBeenCalledTimes(1);
  });

  it("runs session cleanup with ttl hours", async () => {
    const router = {
      sessionCleanup: vi.fn(async () => ({ ok: true, ttlHours: 24, removed: [], kept: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerSessionCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "session", "cleanup", "--max-age-hours", "24"]);

    expect(router.sessionCleanup).toHaveBeenCalledWith({ maxAgeHours: 24 });
  });

  it("runs session pin", async () => {
    const router = {
      sessionPin: vi.fn(async () => ({ ok: true, pinned: true }))
    } as any;
    const program = createProgram().exitOverride();
    registerSessionCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "session", "pin"]);

    expect(router.sessionPin).toHaveBeenCalledTimes(1);
  });

  it("runs session unpin", async () => {
    const router = {
      sessionUnpin: vi.fn(async () => ({ ok: true, pinned: false }))
    } as any;
    const program = createProgram().exitOverride();
    registerSessionCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "session", "unpin"]);

    expect(router.sessionUnpin).toHaveBeenCalledTimes(1);
  });

  it("returns current session status", async () => {
    const router = {
      sessionStatus: vi.fn(async () => ({ ok: true, session: { sessionId: "zhihu-a", lifecycleStatus: "idle" } }))
    } as any;
    const program = createProgram().exitOverride();
    registerSessionCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "session", "status"]);

    expect(router.sessionStatus).toHaveBeenCalledTimes(1);
  });

  it("lists known sessions", async () => {
    const router = {
      sessionList: vi.fn(async () => ({ ok: true, sessions: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerSessionCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "session", "list"]);

    expect(router.sessionList).toHaveBeenCalledTimes(1);
  });

  it("returns cache stats", async () => {
    const router = {
      cacheStats: vi.fn(async () => ({ hits: 1, misses: 2, evictions: 0, expired: 0, keys: 3 }))
    } as any;
    const program = createProgram().exitOverride();
    registerCacheCommand(program, { router });

    await program.parseAsync(["node", "fast-browser", "cache", "stats"]);

    expect(router.cacheStats).toHaveBeenCalledTimes(1);
  });

  it("clears all cache entries", async () => {
    const router = {
      cacheClear: vi.fn(async () => ({ cleared: "all" }))
    } as any;
    const program = createProgram().exitOverride();
    registerCacheCommand(program, { router });

    await program.parseAsync(["node", "fast-browser", "cache", "clear", "--all"]);

    expect(router.cacheClear).toHaveBeenCalledWith({ adapterId: undefined, all: true });
  });

  it("clears a specific adapter cache namespace", async () => {
    const router = {
      cacheClear: vi.fn(async () => ({ cleared: "github" }))
    } as any;
    const program = createProgram().exitOverride();
    registerCacheCommand(program, { router });

    await program.parseAsync(["node", "fast-browser", "cache", "clear", "github"]);

    expect(router.cacheClear).toHaveBeenCalledWith({ adapterId: "github", all: undefined });
  });

  it("passes site target, params, output mode, and cache mode through to the router", async () => {
    const router = {
      site: vi.fn(async () => ({ success: true, meta: { cached: false } }))
    } as any;
    const program = createProgram().exitOverride();
    registerSiteCommand(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "site", "github/search",
      "--query", "fast-browser",
      "--page", "2",
      "--exact", "true",
      "--json",
      "--no-cache"
    ]);

    expect(router.site).toHaveBeenCalledWith(
      "github/search",
      { query: "fast-browser", page: 2, exact: true },
      "json",
      false
    );
  });

  it("merges --input json into site params and lets explicit flags override it", async () => {
    const router = {
      site: vi.fn(async () => ({ success: true, meta: { cached: false } }))
    } as any;
    const program = createProgram().exitOverride();
    registerSiteCommand(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "site", "github/repo",
      "--input", '{"owner":"obra","repo":"superpowers","branch":"main"}',
      "--repo", "superpowers-next"
    ]);

    expect(router.site).toHaveBeenCalledWith(
      "github/repo",
      { owner: "obra", repo: "superpowers-next", branch: "main" },
      "text",
      true
    );
  });

  it("calls adapter test entry with optional command", async () => {
    const router = {
      test: vi.fn(async () => ({ ok: true }))
    } as any;
    const program = createProgram().exitOverride();
    registerTestCommand(program, { router });

    await program.parseAsync(["node", "fast-browser", "test", "github", "search"]);

    expect(router.test).toHaveBeenCalledWith("github", "search");
  });
});

