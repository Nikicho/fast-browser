import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { BrowserSessionStateStore, BrowserStateStore } from "../../../src/runtime/browser-state";
import { FileSessionStore } from "../../../src/runtime/session-store";

describe("runtime state stores", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("treats malformed browser state as empty instead of crashing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-state-store-"));
    tempDirs.push(root);
    const stateFilePath = path.join(root, "browser-state.json");
    const sessionStateFilePath = path.join(root, "browser-session-test.json");

    await fs.writeFile(stateFilePath, '{ not-json', 'utf8');
    await fs.writeFile(sessionStateFilePath, '{ not-json', 'utf8');

    await expect(new BrowserStateStore(stateFilePath).load()).resolves.toBeNull();
    await expect(new BrowserSessionStateStore(sessionStateFilePath).load()).resolves.toBeNull();
  });

  it("treats malformed session store payload as empty instead of crashing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-session-store-"));
    tempDirs.push(root);
    const filePath = path.join(root, "store.json");

    await fs.writeFile(filePath, '{ not-json', 'utf8');

    const store = new FileSessionStore(filePath);
    await expect(store.get('trace.lastCurrent')).resolves.toBeNull();
  });
});
