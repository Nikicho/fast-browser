import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createCommandMaterializeService } from "../../../src/command/command-materialize-service";

describe("command materialize service", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }));
  });

  it("builds manifest, source, and index patch suggestions from a command draft", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-materialize-"));
    tempDirs.push(root);

    const adapterDir = path.join(root, "src", "adapters", "demo");
    await fs.mkdir(path.join(adapterDir, "commands"), { recursive: true });
    await fs.writeFile(path.join(adapterDir, "manifest.json"), JSON.stringify({
      id: "demo",
      displayName: "Demo",
      version: "1.0.0",
      platform: "demo",
      description: "Demo adapter.",
      commands: [
        {
          name: "existing",
          description: "Existing command.",
          args: [],
          example: "fast-browser site demo/existing",
          cacheable: false
        }
      ]
    }, null, 2), "utf8");
    await fs.writeFile(path.join(adapterDir, "index.ts"), [
      'import type { Adapter, AdapterContext, AdapterResult } from "../../shared/types";',
      'import { failureResult, successResult } from "../../core/result";',
      '',
      'const manifest: Adapter["manifest"] = { id: "demo", displayName: "Demo", version: "1.0.0", platform: "demo", description: "Demo adapter.", commands: [] };',
      '',
      'export const adapter: Adapter = {',
      '  manifest,',
      '  async execute(commandName: string, params: Record<string, unknown>, context: AdapterContext): Promise<AdapterResult> {',
      '    const startedAt = Date.now();',
      '    try {',
      '      if (commandName === "existing") {',
      '        return successResult("demo", commandName, { ok: true }, Date.now() - startedAt);',
      '      }',
      '      return failureResult("demo", commandName, new Error("Unsupported command"), Date.now() - startedAt);',
      '    } catch (error) {',
      '      return failureResult("demo", commandName, error, Date.now() - startedAt);',
      '    }',
      '  }',
      '};',
      ''
    ].join("\n"), "utf8");

    const draftPath = path.join(root, ".fast-browser", "sessions", "demo-a", "drafts", "commands", "demo", "search-query.command.draft.json");
    await fs.mkdir(path.dirname(draftPath), { recursive: true });
    await fs.writeFile(draftPath, JSON.stringify({
      id: "search-query",
      kind: "command-draft",
      site: "demo",
      goal: "Search query",
      command: {
        name: "search-query",
        description: "Search query",
        args: [{ name: "query", type: "string", required: true, description: "Value for fill target" }],
        example: 'fast-browser site demo/search-query --query "<query>"'
      },
      source: {
        tracePath: ".fast-browser/sessions/demo-a/events.jsonl",
        entry: {
          index: 0,
          entryId: "f1",
          at: "2026-04-14T08:00:00.000Z",
          command: "fill",
          durationMs: 20,
          summary: "fill input[name='q']",
          flowSafe: true,
          commandCandidate: true,
          input: ["@e1", "AI"],
          locator: {
            rawTarget: "@e1",
            strategy: "snapshot_ref",
            resolvedSelector: "input[name='q']",
            selectorCandidates: ["input[name='q']"],
            placeholder: "search"
          }
        }
      },
      implementation: {
        suggestedFile: "src/adapters/demo/commands/search-query.ts",
        suggestedExport: "searchQuery",
        suggestedManifestCommand: {
          name: "search-query",
          description: "Search query",
          args: [{ name: "query", type: "string", required: true, description: "Value for fill target" }],
          example: 'fast-browser site demo/search-query --query "<query>"'
        },
        suggestedSource: {
          path: "src/adapters/demo/commands/search-query.ts",
          content: "export async function searchQuery() {}\n"
        },
        selector: "input[name='q']",
        inputTemplate: { query: "$params.query" },
        wiringNotes: ["Export searchQuery from src/adapters/demo/commands/search-query.ts and wire it in src/adapters/demo/index.ts."],
        notes: ["Built from the last stable commandCandidate in the latest successful trace."]
      }
    }, null, 2), "utf8");

    const service = createCommandMaterializeService({ root });
    const result = await service.materializeDraft(draftPath);

    expect(result).toMatchObject({
      ok: true,
      site: "demo",
      commandId: "search-query",
      draftPath: path.resolve(draftPath),
      warnings: []
    });
    expect(result.patches).toHaveLength(3);
    expect(result.patches[0]).toMatchObject({
      kind: "manifest",
      path: path.join(adapterDir, "manifest.json"),
      status: "update"
    });
    expect(result.patches[0]?.content).toContain('"name": "search-query"');
    expect(result.patches[1]).toMatchObject({
      kind: "source",
      path: path.join(adapterDir, "commands", "search-query.ts"),
      status: "create"
    });
    expect(result.patches[1]?.content).toContain("export async function searchQuery() {}");
    expect(result.patches[2]).toMatchObject({
      kind: "index",
      path: path.join(adapterDir, "index.ts"),
      status: "update"
    });
    expect(result.patches[2]?.content).toContain('import { searchQuery } from "./commands/search-query";');
    expect(result.patches[2]?.content).toContain('if (commandName === "search-query")');
  });
});
