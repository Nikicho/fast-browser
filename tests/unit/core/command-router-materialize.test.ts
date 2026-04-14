import { describe, expect, it, vi } from "vitest";

import { CommandRouter } from "../../../src/core/command-router";

describe("CommandRouter command materialize", () => {
  it("forwards command draft materialization to the materialize service", async () => {
    const commandMaterializeService = {
      materializeDraft: vi.fn(async () => ({ ok: true, site: "demo", commandId: "search-query", draftPath: "draft.json", patches: [], warnings: [] }))
    };

    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime: {} as any,
      guideService: {} as any,
      flowService: {} as any,
      traceStore: {} as any,
      commandMaterializeService: commandMaterializeService as any
    });

    await expect((router as any).commandMaterialize("draft.json")).resolves.toEqual({
      ok: true,
      site: "demo",
      commandId: "search-query",
      draftPath: "draft.json",
      patches: [],
      warnings: []
    });
    expect(commandMaterializeService.materializeDraft).toHaveBeenCalledWith("draft.json");
  });
});
