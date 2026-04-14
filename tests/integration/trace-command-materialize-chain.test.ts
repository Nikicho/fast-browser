import "tsx/cjs";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createCommandDraftService } from "../../src/command/command-draft-service";
import { createCommandMaterializeService } from "../../src/command/command-materialize-service";
import { CommandRouter } from "../../src/core/command-router";
import { ExecutionTraceStore } from "../../src/runtime/execution-trace";
import { FileSessionStore } from "../../src/runtime/session-store";

describe("trace -> command draft -> materialize chain", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }));
  });

  it("persists trace context, saves a command draft, and materializes patch suggestions", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-trace-command-"));
    tempDirs.push(root);

    const adapterDir = path.join(root, "src", "adapters", "demo");
    await fs.mkdir(path.join(adapterDir, "commands"), { recursive: true });
    await fs.writeFile(path.join(adapterDir, "manifest.json"), JSON.stringify({
      id: "demo",
      displayName: "Demo",
      version: "1.0.0",
      platform: "demo",
      description: "Demo adapter.",
      commands: []
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
      '      return failureResult("demo", commandName, new Error("Unsupported command"), Date.now() - startedAt);',
      '    } catch (error) {',
      '      return failureResult("demo", commandName, error, Date.now() - startedAt);',
      '    }',
      '  }',
      '};',
      ''
    ].join("\n"), "utf8");

    const traceStore = new ExecutionTraceStore(path.join(root, ".fast-browser", "sessions", "demo-a", "events.jsonl"));
    const sessionStore = new FileSessionStore(path.join(root, ".fast-browser", "sessions", "store.json"));

    await traceStore.append({
      id: "m1",
      at: "2026-04-14T08:00:00.000Z",
      kind: "marker",
      command: "trace.mark",
      input: [{ type: "goal_start", label: "search" }],
      ok: true,
      durationMs: 0,
      marker: { type: "goal_start", label: "search" }
    });
    await traceStore.append({
      id: "f1",
      at: "2026-04-14T08:00:01.000Z",
      kind: "command",
      command: "fill",
      input: ["@e2", "AI"],
      ok: true,
      durationMs: 20,
      output: {
        ok: true,
        url: "https://example.com/search",
        title: "Example Search",
        selector: "input[name='q']",
        selectorCandidates: ["input[name='q']"],
        placeholder: "search",
        signal: {
          settled: true,
          urlChanged: false,
          titleChanged: false
        }
      }
    });
    await traceStore.append({
      id: "m2",
      at: "2026-04-14T08:00:02.000Z",
      kind: "marker",
      command: "trace.mark",
      input: [{ type: "goal_success", label: "search" }],
      ok: true,
      durationMs: 0,
      marker: { type: "goal_success", label: "search" }
    });

    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime: {} as any,
      guideService: {} as any,
      flowService: {} as any,
      commandDraftService: createCommandDraftService({ root, sessionId: "demo-a" }) as any,
      commandMaterializeService: createCommandMaterializeService({ root }) as any,
      traceStore,
      sessionStore
    });

    const current = await router.traceCurrent();
    expect(current).toMatchObject({
      status: "success",
      entries: [
        expect.objectContaining({
          command: "fill",
          commandCandidate: true,
          locator: expect.objectContaining({
            resolvedSelector: "input[name='q']"
          })
        })
      ]
    });

    const saved = await router.commandSaveFromTrace("demo", {
      id: "search-query",
      goal: "Search query"
    });

    expect(saved).toMatchObject({
      ok: true,
      site: "demo",
      commandId: "search-query",
      path: path.join(root, ".fast-browser", "sessions", "demo-a", "drafts", "commands", "demo", "search-query.command.draft.json"),
      nextSuggestedCommand: expect.stringContaining('fast-browser command materialize --draft')
    });

    const savedDraft = JSON.parse(await fs.readFile(saved.path, "utf8"));
    expect(savedDraft).toMatchObject({
      id: "search-query",
      kind: "command-draft",
      site: "demo",
      command: {
        name: "search-query",
        args: [expect.objectContaining({ name: "query", type: "string", required: true })]
      },
      implementation: {
        suggestedManifestCommand: expect.objectContaining({ name: "search-query" }),
        suggestedSource: expect.objectContaining({
          path: "src/adapters/demo/commands/search-query.ts",
          content: expect.stringContaining("export async function searchQuery")
        }),
        wiringNotes: expect.arrayContaining([
          expect.stringContaining("src/adapters/demo/index.ts")
        ])
      }
    });

    const materialized = await router.commandMaterialize(saved.path);
    expect(materialized).toMatchObject({
      ok: true,
      site: "demo",
      commandId: "search-query",
      draftPath: path.resolve(saved.path),
      warnings: []
    });
    expect(materialized.patches.map((patch) => patch.kind)).toEqual(["manifest", "source", "index"]);
    expect(materialized.patches[0]).toMatchObject({
      path: path.join(adapterDir, "manifest.json"),
      status: "update"
    });
    expect(materialized.patches[0]?.content).toContain('"name": "search-query"');
    expect(materialized.patches[1]).toMatchObject({
      path: path.join(adapterDir, "commands", "search-query.ts"),
      status: "create"
    });
    expect(materialized.patches[2]).toMatchObject({
      path: path.join(adapterDir, "index.ts"),
      status: "update"
    });
  });
});
