import fs from "node:fs/promises";
import path from "node:path";

import type { BrowserSessionState, BrowserState } from "../shared/types";

async function loadJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return null;
    }
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

async function saveJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export class BrowserStateStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<BrowserState | null> {
    return loadJson<BrowserState>(this.filePath);
  }

  async save(state: BrowserState): Promise<void> {
    await saveJson(this.filePath, state);
  }

  async update(mutator: (state: BrowserState) => BrowserState | Promise<BrowserState>): Promise<BrowserState> {
    const current = (await this.load()) ?? {};
    const next = await mutator(current);
    await this.save(next);
    return next;
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true });
  }
}

export class BrowserSessionStateStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<BrowserSessionState | null> {
    return loadJson<BrowserSessionState>(this.filePath);
  }

  async save(state: BrowserSessionState): Promise<void> {
    await saveJson(this.filePath, state);
  }

  async update(mutator: (state: BrowserSessionState) => BrowserSessionState | Promise<BrowserSessionState>): Promise<BrowserSessionState> {
    const current = (await this.load()) ?? {};
    const next = await mutator(current);
    await this.save(next);
    return next;
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true });
  }
}
