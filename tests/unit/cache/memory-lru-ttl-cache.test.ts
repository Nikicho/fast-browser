import { describe, expect, it } from "vitest";

import { MemoryLruTtlCache } from "../../../src/cache/memory-lru-ttl-cache";

describe("MemoryLruTtlCache", () => {
  it("tracks hits, misses, and expiration", async () => {
    const cache = new MemoryLruTtlCache({ maxEntries: 2, defaultTtlMs: 5 });

    await cache.set("fast-browser:github:search:1", { ok: true });
    expect(await cache.get("fast-browser:github:search:1")).toEqual({ ok: true });
    expect(await cache.get("fast-browser:github:search:2")).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await cache.get("fast-browser:github:search:1")).toBeNull();

    expect(await cache.stats()).toMatchObject({
      hits: 1,
      misses: 1,
      expired: 1
    });
  });

  it("evicts least recently used entries and clears by namespace", async () => {
    const cache = new MemoryLruTtlCache({ maxEntries: 2, defaultTtlMs: 1_000 });

    await cache.set("fast-browser:github:search:1", { id: 1 });
    await cache.set("fast-browser:wikipedia:page:1", { id: 2 });
    await cache.get("fast-browser:github:search:1");
    await cache.set("fast-browser:google:search:1", { id: 3 });

    expect(await cache.get("fast-browser:wikipedia:page:1")).toBeNull();

    await cache.clear("fast-browser:github:");
    expect(await cache.get("fast-browser:github:search:1")).toBeNull();
  });
});
