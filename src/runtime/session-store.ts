import fs from "node:fs/promises";
import path from "node:path";

import { getSessionFilePath } from "../shared/constants";
import type { SessionStore } from "../shared/types";

export class FileSessionStore implements SessionStore {
  constructor(private readonly filePath = getSessionFilePath()) {}

  async get<T>(namespace: string): Promise<T | null> {
    const state = await this.load();
    return (state[namespace] as T | undefined) ?? null;
  }

  async set<T>(namespace: string, value: T): Promise<void> {
    const state = await this.load();
    state[namespace] = value;
    await this.save(state);
  }

  async delete(namespace: string): Promise<void> {
    const state = await this.load();
    delete state[namespace];
    await this.save(state);
  }

  private async load(): Promise<Record<string, unknown>> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        return {};
      }
      if (error instanceof SyntaxError) {
        return {};
      }
      throw error;
    }
  }

  private async save(value: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(value, null, 2), "utf8");
  }
}
