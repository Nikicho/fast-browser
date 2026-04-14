import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { BrowserStateStore } from "../../../src/runtime/browser-state";

describe("BrowserStateStore", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempRoots.length = 0;
  });

  it("persists browser lifecycle and collection state", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-state-"));
    tempRoots.push(root);
    const filePath = path.join(root, "state.json");

    const store = new BrowserStateStore(filePath);
    await store.save({
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/abc",
      pageTargetId: "page-1",
      headless: false,
      launchedAt: 123,
      consoleLogs: [{ type: "log", text: "hello", time: 1 }],
      networkEntries: [{ url: "https://example.com/app.js", method: "GET", status: 200, resourceType: "Script", time: 2 }]
    });

    const reloaded = new BrowserStateStore(filePath);
    expect(await reloaded.load()).toEqual({
      wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/abc",
      pageTargetId: "page-1",
      headless: false,
      launchedAt: 123,
      consoleLogs: [{ type: "log", text: "hello", time: 1 }],
      networkEntries: [{ url: "https://example.com/app.js", method: "GET", status: 200, resourceType: "Script", time: 2 }]
    });
  });
});
