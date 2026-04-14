import { describe, expect, it, vi } from "vitest";

import { registerFlowCommands } from "../../../src/cli/commands/flow";
import { createProgram } from "../../../src/cli/parser";

describe("flow CLI commands", () => {
  it("saves a flow definition from file", async () => {
    const router = {
      flowSave: vi.fn(async () => ({ ok: true, site: "demo", flowId: "search-open" }))
    } as any;
    const program = createProgram().exitOverride();
    registerFlowCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "flow", "save", "--site", "demo", "--file", "fixtures/demo.flow.json"]);

    expect(router.flowSave).toHaveBeenCalledWith("demo", "fixtures/demo.flow.json");
  });

  it("saves a flow draft from the latest trace", async () => {
    const router = {
      flowSaveFromTrace: vi.fn(async () => ({ ok: true, site: "demo", flowId: "search-open" }))
    } as any;
    const program = createProgram().exitOverride();
    registerFlowCommands(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "flow", "save",
      "--site", "demo",
      "--from-trace",
      "--id", "search-open",
      "--goal", "Search and open first result"
    ]);

    expect(router.flowSaveFromTrace).toHaveBeenCalledWith("demo", {
      id: "search-open",
      goal: "Search and open first result"
    });
  });

  it("lists flows for a site", async () => {
    const router = {
      flowList: vi.fn(async () => [{ site: "demo", flowId: "search-open" }])
    } as any;
    const program = createProgram().exitOverride();
    registerFlowCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "flow", "list", "demo"]);

    expect(router.flowList).toHaveBeenCalledWith("demo");
  });

  it("runs a flow with json input", async () => {
    const router = {
      flowRun: vi.fn(async () => ({ ok: true, flowId: "search-open", steps: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerFlowCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "flow", "run", "demo/search-open", "--input", '{"query":"fast-browser"}']);

    expect(router.flowRun).toHaveBeenCalledWith("demo/search-open", { query: "fast-browser" });
  });

  it("rejects invalid json input for flow run", async () => {
    const router = {
      flowRun: vi.fn(async () => ({ ok: true, flowId: "search-open", steps: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerFlowCommands(program, { router });

    await expect(program.parseAsync(["node", "fast-browser", "flow", "run", "demo/search-open", "--input", "[]"]))
      .rejects.toThrow(/json input/i);
    expect(router.flowRun).not.toHaveBeenCalled();
  });

  it("runs a flow with flag input and merges it over json input", async () => {
    const router = {
      flowRun: vi.fn(async () => ({ ok: true, flowId: "search-open", steps: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerFlowCommands(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "flow", "run", "demo/search-open",
      "--input", '{"query":"seed","page":1}',
      "--query", "override",
      "--page", "2"
    ]);

    expect(router.flowRun).toHaveBeenCalledWith("demo/search-open", { query: "override", page: 2 });
  });
});
