import { describe, expect, it, vi } from "vitest";

import { MemoryLruTtlCache } from "../../../src/cache/memory-lru-ttl-cache";
import { AdapterManager } from "../../../src/core/adapter-manager";
import { createLogger } from "../../../src/shared/logger";
import type { Adapter, BrowserRuntime, SessionStore } from "../../../src/shared/types";

describe("AdapterManager", () => {
  it("caches cacheable adapter results", async () => {
    const execute = vi.fn(async () => ({
      success: true,
      data: { items: [{ id: 1 }] },
      meta: {
        adapterId: "demo",
        commandName: "search",
        cached: false,
        timingMs: 1
      }
    }));

    const adapter: Adapter = {
      manifest: {
        id: "demo",
        displayName: "Demo",
        version: "1.0.0",
        platform: "demo",
        description: "demo",
        commands: [
          {
            name: "search",
            description: "search",
            args: [{ name: "query", type: "string", required: true }],
            example: "fast-browser site demo/search --query hello",
            cacheable: true
          }
        ]
      },
      execute
    };

    const manager = new AdapterManager({
      adapters: [adapter],
      cache: new MemoryLruTtlCache({ maxEntries: 100, defaultTtlMs: 10_000 }),
      runtime: {} as BrowserRuntime,
      logger: createLogger("silent"),
      sessionStore: {} as SessionStore
    });

    const first = await manager.execute({
      adapterId: "demo",
      commandName: "search",
      params: { query: "hello" },
      output: "json",
      useCache: true
    });
    const second = await manager.execute({
      adapterId: "demo",
      commandName: "search",
      params: { query: "hello" },
      output: "json",
      useCache: true
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.meta.cached).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects missing required params even when the manifest carries defaults", async () => {
    const adapter: Adapter = {
      manifest: {
        id: "github-like",
        displayName: "GitHub Like",
        version: "1.0.0",
        platform: "github-like",
        description: "demo",
        commands: [
          {
            name: "repo",
            description: "repo",
            args: [
              { name: "owner", type: "string", required: true, defaultValue: "torvalds" },
              { name: "repo", type: "string", required: true, defaultValue: "linux" }
            ],
            example: "fast-browser site github-like/repo --owner torvalds --repo linux"
          }
        ]
      },
      execute: vi.fn(async () => ({
        success: true,
        data: {},
        meta: { adapterId: "github-like", commandName: "repo", cached: false, timingMs: 1 }
      }))
    };

    const manager = new AdapterManager({
      adapters: [adapter],
      cache: new MemoryLruTtlCache({ maxEntries: 100, defaultTtlMs: 10_000 }),
      runtime: {} as BrowserRuntime,
      logger: createLogger("silent"),
      sessionStore: {} as SessionStore
    });

    await expect(manager.execute({
      adapterId: "github-like",
      commandName: "repo",
      params: {},
      output: "json",
      useCache: false
    })).rejects.toMatchObject({
      code: "FB_ADAPTER_002",
      stage: "adapter",
      message: expect.stringContaining("missing required: owner, repo")
    });
  });

  it("rejects unknown params instead of silently stripping them", async () => {
    const adapter: Adapter = {
      manifest: {
        id: "demo-strict",
        displayName: "Demo Strict",
        version: "1.0.0",
        platform: "demo",
        description: "demo",
        commands: [
          {
            name: "repo",
            description: "repo",
            args: [
              { name: "owner", type: "string", required: true },
              { name: "repo", type: "string", required: true }
            ],
            example: "fast-browser site demo-strict/repo --owner obra --repo superpowers"
          }
        ]
      },
      execute: vi.fn(async () => ({
        success: true,
        data: {},
        meta: { adapterId: "demo-strict", commandName: "repo", cached: false, timingMs: 1 }
      }))
    };

    const manager = new AdapterManager({
      adapters: [adapter],
      cache: new MemoryLruTtlCache({ maxEntries: 100, defaultTtlMs: 10_000 }),
      runtime: {} as BrowserRuntime,
      logger: createLogger("silent"),
      sessionStore: {} as SessionStore
    });

    await expect(manager.execute({
      adapterId: "demo-strict",
      commandName: "repo",
      params: { owner: "obra", repo: "superpowers", input: "ignored-before" },
      output: "json",
      useCache: false
    })).rejects.toMatchObject({
      code: "FB_ADAPTER_002",
      stage: "adapter",
      message: expect.stringContaining("unknown fields: input")
    });
  });
});
