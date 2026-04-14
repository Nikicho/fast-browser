import fs from "node:fs/promises";
import path from "node:path";

import type { ExecutionTraceCurrentSegment, ExecutionTraceEntry } from "../shared/types";

export class ExecutionTraceStore {
  constructor(private readonly filePath: string) {}

  async append(entry: ExecutionTraceEntry): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async latest(limit: number): Promise<ExecutionTraceEntry[]> {
    if (limit <= 0) {
      return [];
    }

    return (await this.readAll()).slice(-limit);
  }

  async current(): Promise<ExecutionTraceCurrentSegment> {
    const entries = await this.readAll();
    const startIndex = findLatestGoalStartIndex(entries);
    return {
      startMarker: startIndex >= 0 ? entries[startIndex] : null,
      entries: startIndex >= 0 ? entries.slice(startIndex) : entries
    };
  }

  getPath(): string {
    return this.filePath;
  }

  private async readAll(): Promise<ExecutionTraceEntry[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const entries: ExecutionTraceEntry[] = [];
      for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) {
          continue;
        }
        try {
          entries.push(JSON.parse(line) as ExecutionTraceEntry);
        } catch {
          continue;
        }
      }
      return entries;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}

function findLatestGoalStartIndex(entries: ExecutionTraceEntry[]): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.kind === "marker" && entry.marker?.type === "goal_start") {
      return index;
    }
  }
  return -1;
}
