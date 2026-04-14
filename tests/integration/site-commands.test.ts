import { afterEach, describe, expect, it, vi } from "vitest";

import { createBuiltInAdapters } from "../../src/adapters";
import { MemoryLruTtlCache } from "../../src/cache/memory-lru-ttl-cache";
import { AdapterManager } from "../../src/core/adapter-manager";
import { BrowserRuntimeFacade } from "../../src/runtime/browser-runtime";
import { createLogger } from "../../src/shared/logger";
import { FileSessionStore } from "../../src/runtime/session-store";

describe("built-in adapters", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });
  it("returns normalized github search results", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              full_name: "openai/fast-browser",
              html_url: "https://github.com/openai/fast-browser",
              description: "Fast browser",
              stargazers_count: 10
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ) as typeof fetch;

    const runtime = new BrowserRuntimeFacade({
      fetcher: global.fetch
    });
    const manager = new AdapterManager({
      adapters: createBuiltInAdapters(runtime),
      cache: new MemoryLruTtlCache({ maxEntries: 100, defaultTtlMs: 10_000 }),
      runtime,
      logger: createLogger("silent"),
      sessionStore: new FileSessionStore()
    });

    const result = await manager.execute({
      adapterId: "github",
      commandName: "search",
      params: { query: "fast browser" },
      output: "json",
      useCache: false
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      items: [
        {
          fullName: "openai/fast-browser",
          url: "https://github.com/openai/fast-browser",
          description: "Fast browser",
          stars: 10
        }
      ]
    });
  });
});


