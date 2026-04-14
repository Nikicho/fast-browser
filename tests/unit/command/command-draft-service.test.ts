import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createCommandDraftService } from "../../../src/command/command-draft-service";

describe("command draft service", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }));
  });

  it("saves a command draft into the session draft directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-command-"));
    tempDirs.push(root);

    const service = createCommandDraftService({
      root,
      sessionId: "demo-a"
    });

    const result = await service.saveCommandDraft("demo", {
      id: "search-query",
      kind: "command-draft",
      site: "demo",
      goal: "Search query",
      command: {
        name: "search-query",
        description: "Search query",
        args: [{ name: "query", type: "string", required: true }],
        example: 'fast-browser site demo/search-query --query "AI"'
      },
      source: {
        tracePath: ".fast-browser/sessions/demo-a/events.jsonl",
        entry: {
          index: 0,
          entryId: "f1",
          at: "2026-04-13T10:00:00.000Z",
          command: "fill",
          durationMs: 20,
          summary: "fill input[name='q']",
          flowSafe: true,
          commandCandidate: true,
          input: ["@e2", "AI"],
          locator: {
            rawTarget: "@e2",
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
          args: [{ name: "query", type: "string", required: true }],
          example: 'fast-browser site demo/search-query --query "AI"'
        },
        suggestedSource: {
          path: "src/adapters/demo/commands/search-query.ts",
          content: "export async function searchQuery"
        },
        selector: "input[name='q']",
        inputTemplate: { query: "$params.query" },
        wiringNotes: ["Add the manifest command entry and wire the export in src/adapters/demo/index.ts."],
        notes: ["Refine the trace draft into a stable site capability."]
      }
    });

    expect(result).toEqual({
      ok: true,
      site: "demo",
      commandId: "search-query",
      path: path.join(root, ".fast-browser", "sessions", "demo-a", "drafts", "commands", "demo", "search-query.command.draft.json"),
      nextSuggestedCommand: `fast-browser command materialize --draft ${JSON.stringify(path.join(root, ".fast-browser", "sessions", "demo-a", "drafts", "commands", "demo", "search-query.command.draft.json"))}`
    });

    const saved = JSON.parse(await fs.readFile(result.path, "utf8"));
    expect(saved).toMatchObject({
      id: "search-query",
      kind: "command-draft",
      site: "demo",
      command: {
        name: "search-query"
      },
      implementation: {
        selector: "input[name='q']",
        suggestedManifestCommand: {
          name: "search-query"
        },
        suggestedSource: {
          path: "src/adapters/demo/commands/search-query.ts",
          content: expect.stringContaining("export async function searchQuery")
        },
        wiringNotes: [expect.stringContaining("src/adapters/demo/index.ts")]
      }
    });
  });
});
