import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_CACHE_MAX_ENTRIES, DEFAULT_CACHE_TTL_MS } from "../shared/constants";
import type { CacheStats, CacheStore } from "../shared/types";

interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  expiresAt: number;
  createdAt: number;
  lastAccessAt: number;
  size: number;
}

interface PersistedState {
  entries: Array<CacheEntry>;
  stats: Omit<CacheStats, "keys">;
}

interface CacheOptions {
  maxEntries?: number;
  defaultTtlMs?: number;
  filePath?: string;
}

export class MemoryLruTtlCache implements CacheStore {
  private readonly store = new Map<string, CacheEntry>();
  private readonly statsState = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expired: 0
  };
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private readonly filePath?: string;
  private loaded = false;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.filePath = options.filePath;
  }

  async get<T>(key: string): Promise<T | null> {
    await this.ensureLoaded();
    const entry = this.store.get(key);
    if (!entry) {
      this.statsState.misses += 1;
      await this.persist();
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.statsState.expired += 1;
      await this.persist();
      return null;
    }

    this.store.delete(key);
    entry.lastAccessAt = Date.now();
    this.store.set(key, entry);
    this.statsState.hits += 1;
    await this.persist();
    return entry.value as T;
  }

  async set<T>(key: string, value: T, options?: { ttlMs?: number; size?: number }): Promise<void> {
    await this.ensureLoaded();
    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: now,
      lastAccessAt: now,
      expiresAt: now + (options?.ttlMs ?? this.defaultTtlMs),
      size: options?.size ?? Buffer.byteLength(JSON.stringify(value), "utf8")
    };

    this.store.delete(key);
    this.store.set(key, entry);
    this.evictIfNeeded();
    await this.persist();
  }

  async delete(key: string): Promise<void> {
    await this.ensureLoaded();
    this.store.delete(key);
    await this.persist();
  }

  async clear(namespace?: string): Promise<void> {
    await this.ensureLoaded();
    if (!namespace) {
      this.store.clear();
      await this.persist();
      return;
    }

    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(namespace)) {
        this.store.delete(key);
      }
    }
    await this.persist();
  }

  async stats(): Promise<CacheStats> {
    await this.ensureLoaded();
    return {
      ...this.statsState,
      keys: this.store.size
    };
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.store.delete(oldestKey);
      this.statsState.evictions += 1;
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    this.loaded = true;
    if (!this.filePath) {
      return;
    }

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedState;
      for (const entry of parsed.entries ?? []) {
        if (Date.now() <= entry.expiresAt) {
          this.store.set(entry.key, entry);
        }
      }
      Object.assign(this.statsState, parsed.stats ?? {});
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "ENOENT") {
        throw error;
      }
    }
  }

  private async persist(): Promise<void> {
    if (!this.filePath) {
      return;
    }

    const dirPath = path.dirname(this.filePath);
    await fs.mkdir(dirPath, { recursive: true });
    const payload: PersistedState = {
      entries: Array.from(this.store.values()),
      stats: { ...this.statsState }
    };
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}
