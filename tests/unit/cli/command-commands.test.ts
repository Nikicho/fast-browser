import { describe, expect, it, vi } from "vitest";

import { registerCommandCommands } from "../../../src/cli/commands/command";
import { createProgram } from "../../../src/cli/parser";

describe("command CLI commands", () => {
  it("prints a human-readable command save summary by default", async () => {
    const router = {
      commandSaveFromTrace: vi.fn(async () => ({
        ok: true,
        site: "demo",
        commandId: "search-query",
        path: "draft.json",
        nextSuggestedCommand: 'fast-browser command materialize --draft "draft.json"'
      }))
    } as any;
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = createProgram().exitOverride();
    registerCommandCommands(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "command", "save",
      "--site", "demo",
      "--from-trace",
      "--id", "search-query",
      "--goal", "Search query"
    ]);

    expect(router.commandSaveFromTrace).toHaveBeenCalledWith("demo", {
      id: "search-query",
      goal: "Search query"
    });
    expect(consoleSpy).toHaveBeenCalledWith([
      "Command draft saved",
      "Site: demo",
      "Command: search-query",
      "Draft: draft.json",
      'Next: fast-browser command materialize --draft "draft.json"'
    ].join("\n"));

    consoleSpy.mockRestore();
  });

  it("saves a command draft from the latest trace as json", async () => {
    const router = {
      commandSaveFromTrace: vi.fn(async () => ({
        ok: true,
        site: "demo",
        commandId: "search-query",
        path: "draft.json",
        nextSuggestedCommand: 'fast-browser command materialize --draft "draft.json"'
      }))
    } as any;
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = createProgram().exitOverride();
    registerCommandCommands(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "command", "save",
      "--site", "demo",
      "--from-trace",
      "--id", "search-query",
      "--goal", "Search query",
      "--json"
    ]);

    expect(consoleSpy).toHaveBeenCalledWith(`{
  "ok": true,
  "site": "demo",
  "commandId": "search-query",
  "path": "draft.json",
  "nextSuggestedCommand": "fast-browser command materialize --draft \\"draft.json\\""
}`);

    consoleSpy.mockRestore();
  });


  it("prints a human-readable command materialize summary by default", async () => {
    const router = {
      commandMaterialize: vi.fn(async () => ({
        ok: true,
        site: "demo",
        commandId: "search-query",
        draftPath: "draft.json",
        patches: [
          { kind: "manifest", path: "manifest.json", status: "update", summary: "Update manifest.", content: "{}" },
          { kind: "source", path: "search-query.ts", status: "create", summary: "Create source.", content: "export {};" }
        ],
        warnings: ["Existing command will be replaced."]
      }))
    } as any;
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = createProgram().exitOverride();
    registerCommandCommands(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "command", "materialize",
      "--draft", "session-draft.json"
    ]);

    expect(router.commandMaterialize).toHaveBeenCalledWith("session-draft.json");
    expect(consoleSpy).toHaveBeenCalledWith([
      "Command draft materialized",
      "Site: demo",
      "Command: search-query",
      "Draft: draft.json",
      "Patches: 2",
      "Warnings: 1"
    ].join("\n"));

    consoleSpy.mockRestore();
  });

  it("materializes a command draft into patch suggestions as json", async () => {
    const router = {
      commandMaterialize: vi.fn(async () => ({ ok: true, site: "demo", commandId: "search-query", draftPath: "draft.json", patches: [], warnings: [] }))
    } as any;
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = createProgram().exitOverride();
    registerCommandCommands(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "command", "materialize",
      "--draft", "session-draft.json",
      "--json"
    ]);

    expect(router.commandMaterialize).toHaveBeenCalledWith("session-draft.json");
    expect(consoleSpy).toHaveBeenCalledWith(`{
  "ok": true,
  "site": "demo",
  "commandId": "search-query",
  "draftPath": "draft.json",
  "patches": [],
  "warnings": []
}`);

    consoleSpy.mockRestore();
  });

  it("rejects command materialize without a draft path", async () => {
    const router = {
      commandMaterialize: vi.fn(async () => ({ ok: true }))
    } as any;
    const program = createProgram().exitOverride();
    registerCommandCommands(program, { router });

    await expect(program.parseAsync([
      "node", "fast-browser", "command", "materialize"
    ])).rejects.toThrow(/required option '--draft <path>' not specified/i);

    expect(router.commandMaterialize).not.toHaveBeenCalled();
  });

  it("rejects command save without from-trace id and goal", async () => {
    const router = {
      commandSaveFromTrace: vi.fn(async () => ({ ok: true }))
    } as any;
    const program = createProgram().exitOverride();
    registerCommandCommands(program, { router });

    await expect(program.parseAsync([
      "node", "fast-browser", "command", "save",
      "--site", "demo"
    ])).rejects.toThrow(/command save requires --from-trace --id <id> --goal <goal>/i);

    expect(router.commandSaveFromTrace).not.toHaveBeenCalled();
  });
});
