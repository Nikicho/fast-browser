import { describe, expect, it, vi } from "vitest";

import { CommandRouter } from "../../../src/core/command-router";

describe("CommandRouter command drafts", () => {
  it("builds a command draft from the latest successful trace", async () => {
    const saveCommandDraft = vi.fn(async () => ({ ok: true, site: "demo", commandId: "search-query", path: "draft.json", nextSuggestedCommand: 'fast-browser command materialize --draft "draft.json"' }));
    const commandDraftService = {
      saveCommandDraft
    };
    const sessionStore = {
      get: vi.fn(async () => ({
        status: "success",
        path: ".fast-browser/sessions/events.jsonl",
        at: new Date().toISOString()
      })),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined)
    };
    const traceStore = {
      current: vi.fn(async () => ({
        startMarker: {
          id: "m1",
          at: "2026-04-13T10:00:00.000Z",
          kind: "marker",
          command: "trace.mark",
          input: [{ type: "goal_start", label: "demo" }],
          ok: true,
          durationMs: 0,
          marker: { type: "goal_start", label: "demo" }
        },
        entries: [
          {
            id: "m1",
            at: "2026-04-13T10:00:00.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_start", label: "demo" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_start", label: "demo" }
          },
          {
            id: "c1",
            at: "2026-04-13T10:00:01.000Z",
            kind: "command",
            command: "click",
            input: ["@e1"],
            ok: true,
            durationMs: 15,
            output: {
              ok: true,
              url: "https://example.com/search",
              selector: "button[data-testid='submit']",
              selectorCandidates: ["button[data-testid='submit']"],
              text: "search"
            }
          },
          {
            id: "f1",
            at: "2026-04-13T10:00:02.000Z",
            kind: "command",
            command: "fill",
            input: ["@e2", "AI"],
            ok: true,
            durationMs: 20,
            output: {
              ok: true,
              url: "https://example.com/search",
              selector: "input[name='q']",
              selectorCandidates: ["input[name='q']"],
              placeholder: "search content"
            }
          },
          {
            id: "m2",
            at: "2026-04-13T10:00:03.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_success", label: "demo" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_success", label: "demo" }
          }
        ]
      })),
      getPath: vi.fn(() => ".fast-browser/sessions/events.jsonl")
    };

    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime: {} as any,
      guideService: {} as any,
      flowService: {} as any,
      traceStore: traceStore as any,
      sessionStore: sessionStore as any,
      commandDraftService: commandDraftService as any
    });

    await expect((router as any).commandSaveFromTrace("demo", { id: "search-query", goal: "Search query" })).resolves.toEqual({
      ok: true,
      site: "demo",
      commandId: "search-query",
      path: "draft.json",
      nextSuggestedCommand: 'fast-browser command materialize --draft "draft.json"'
    });

    expect(saveCommandDraft).toHaveBeenCalledTimes(1);
    const firstCall = saveCommandDraft.mock.calls[0] as unknown as [string, Record<string, any>] | undefined;
    const savedDraft = firstCall?.[1];
    expect(savedDraft).toBeDefined();
    expect(savedDraft).toMatchObject({
      id: "search-query",
      kind: "command-draft",
      site: "demo",
      goal: "Search query",
      command: {
        name: "search-query",
        args: [expect.objectContaining({ name: "query", type: "string", required: true })]
      },
      source: {
        tracePath: ".fast-browser/sessions/events.jsonl",
        entry: expect.objectContaining({
          entryId: "f1",
          command: "fill"
        })
      },
      implementation: {
        selector: "input[name='q']",
        inputTemplate: { query: "$params.query" },
        suggestedManifestCommand: {
          name: "search-query",
          args: [expect.objectContaining({ name: "query" })]
        },
        suggestedSource: {
          path: "src/adapters/demo/commands/search-query.ts",
          content: expect.stringContaining("export async function searchQuery")
        }
      }
    });
    expect(savedDraft?.implementation.wiringNotes).toEqual(expect.arrayContaining([
      expect.stringContaining("src/adapters/demo/index.ts")
    ]));
  });

  it("rejects command drafts when the latest successful trace has no stable command candidate", async () => {
    const saveCommandDraft = vi.fn(async () => ({ ok: true, site: "demo", commandId: "unstable", path: "draft.json", nextSuggestedCommand: 'fast-browser command materialize --draft "draft.json"' }));
    const commandDraftService = {
      saveCommandDraft
    };
    const sessionStore = {
      get: vi.fn(async () => ({
        status: "success",
        path: ".fast-browser/sessions/events.jsonl",
        at: new Date().toISOString()
      })),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined)
    };
    const traceStore = {
      current: vi.fn(async () => ({
        startMarker: {
          id: "m1",
          at: "2026-04-13T10:00:00.000Z",
          kind: "marker",
          command: "trace.mark",
          input: [{ type: "goal_start", label: "demo" }],
          ok: true,
          durationMs: 0,
          marker: { type: "goal_start", label: "demo" }
        },
        entries: [
          {
            id: "m1",
            at: "2026-04-13T10:00:00.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_start", label: "demo" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_start", label: "demo" }
          },
          {
            id: "c1",
            at: "2026-04-13T10:00:01.000Z",
            kind: "command",
            command: "click",
            input: ["@e1"],
            ok: true,
            durationMs: 15,
            output: { ok: true, url: "https://example.com/search" }
          },
          {
            id: "m2",
            at: "2026-04-13T10:00:03.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_success", label: "demo" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_success", label: "demo" }
          }
        ]
      })),
      getPath: vi.fn(() => ".fast-browser/sessions/events.jsonl")
    };

    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime: {} as any,
      guideService: {} as any,
      flowService: {} as any,
      traceStore: traceStore as any,
      sessionStore: sessionStore as any,
      commandDraftService: commandDraftService as any
    });

    await expect((router as any).commandSaveFromTrace("demo", { id: "unstable", goal: "Unstable command" })).rejects.toMatchObject({
      code: "FB_COMMAND_001",
      stage: "command",
      message: "No stable command candidate was found in the latest successful trace for demo."
    });

    expect(saveCommandDraft).not.toHaveBeenCalled();
  });
});
