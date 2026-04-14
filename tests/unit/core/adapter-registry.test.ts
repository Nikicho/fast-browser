import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AdapterRegistry } from "../../../src/core/adapter-registry";

describe("AdapterRegistry", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("loads custom adapters from runtime-loadable modules", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-registry-"));
    tempDirs.push(root);
    const adapterDir = path.join(root, "demo");
    await fs.mkdir(adapterDir, { recursive: true });
    await fs.writeFile(
      path.join(adapterDir, "manifest.json"),
      JSON.stringify({
        id: "demo",
        displayName: "demo",
        version: "0.1.0",
        platform: "demo",
        description: "Demo adapter",
        commands: [
          {
            name: "home",
            description: "Fetch demo home",
            args: [],
            example: "fast-browser site demo/home"
          }
        ]
      }),
      "utf8"
    );
    await fs.writeFile(
      path.join(adapterDir, "index.js"),
      [
        'const manifest = require("./manifest.json");',
        "const adapter = {",
        "  manifest,",
        "  async execute() {",
        '    return { success: true, data: { ok: true }, meta: { adapterId: "demo", commandName: "home", cached: false, timingMs: 0 } };',
        "  }",
        "};",
        "module.exports = { adapter, default: adapter };",
        ""
      ].join("\n"),
      "utf8"
    );

    const registry = new AdapterRegistry({} as any, root);
    const adapters = await registry.discover();

    expect(adapters.some((adapter) => adapter.manifest.id === "demo")).toBe(true);
  });

  it("loads custom adapters when manifest.json contains a UTF-8 BOM", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-registry-"));
    tempDirs.push(root);
    const adapterDir = path.join(root, "bom-demo");
    await fs.mkdir(adapterDir, { recursive: true });
    await fs.writeFile(
      path.join(adapterDir, "manifest.json"),
      `\uFEFF${JSON.stringify({
        id: "bom-demo",
        displayName: "bom-demo",
        version: "0.1.0",
        platform: "bom-demo",
        description: "Demo adapter with BOM manifest",
        commands: [
          {
            name: "home",
            description: "Fetch demo home",
            args: [],
            example: "fast-browser site bom-demo/home"
          }
        ]
      })}`,
      "utf8"
    );
    await fs.writeFile(
      path.join(adapterDir, "index.js"),
      [
        'const manifest = require("./manifest.json");',
        "const adapter = {",
        "  manifest,",
        "  async execute() {",
        '    return { success: true, data: { ok: true }, meta: { adapterId: "bom-demo", commandName: "home", cached: false, timingMs: 0 } };',
        "  }",
        "};",
        "module.exports = { adapter, default: adapter };",
        ""
      ].join("\n"),
      "utf8"
    );

    const registry = new AdapterRegistry({} as any, root);
    const adapters = await registry.discover();

    expect(adapters.some((adapter) => adapter.manifest.id === "bom-demo")).toBe(true);
  });

  it("surfaces diagnostics for custom adapters that fail to load", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-registry-"));
    tempDirs.push(root);
    const adapterDir = path.join(root, "broken-demo");
    await fs.mkdir(adapterDir, { recursive: true });
    await fs.writeFile(
      path.join(adapterDir, "manifest.json"),
      JSON.stringify({
        id: "broken-demo",
        displayName: "broken-demo",
        version: "0.1.0",
        platform: "broken-demo",
        description: "Broken adapter",
        commands: [
          {
            name: "home",
            description: "Fetch demo home",
            args: [],
            example: "fast-browser site broken-demo/home"
          }
        ]
      }),
      "utf8"
    );

    const registry = new AdapterRegistry({} as any, root);
    await registry.discover();

    expect(registry.getLoadDiagnostics()).toEqual([
      expect.objectContaining({
        adapterId: "broken-demo",
        stage: "module",
        message: expect.stringMatching(/missing/i)
      })
    ]);
  });
});