import { describe, expect, it, vi } from "vitest";

import { registerTraceCommands } from "../../../src/cli/commands/trace";
import { createProgram } from "../../../src/cli/parser";

describe("trace CLI commands", () => {
  it("returns the latest trace entries", async () => {
    const router = {
      traceLatest: vi.fn(async () => ({ path: ".fast-browser/sessions/events.jsonl", entries: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerTraceCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "trace", "latest", "15"]);

    expect(router.traceLatest).toHaveBeenCalledWith(15);
  });

  it("creates a goal marker entry", async () => {
    const router = {
      traceLatest: vi.fn(),
      traceMark: vi.fn(async () => ({ ok: true, marker: { type: "goal_start", label: "checkout" } }))
    } as any;
    const program = createProgram().exitOverride();
    registerTraceCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "trace", "mark", "--type", "goal_start", "--label", "checkout", "--data", '{"step":1}']);

    expect(router.traceMark).toHaveBeenCalledWith("goal_start", "checkout", { step: 1 });
  });

  it("returns the current goal segment", async () => {
    const router = {
      traceLatest: vi.fn(),
      traceMark: vi.fn(),
      traceCurrent: vi.fn(async () => ({ startMarker: null, entries: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerTraceCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "trace", "current"]);

    expect(router.traceCurrent).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid json data for trace mark", async () => {
    const router = {
      traceLatest: vi.fn(),
      traceMark: vi.fn(async () => ({ ok: true })),
      traceCurrent: vi.fn()
    } as any;
    const program = createProgram().exitOverride();
    registerTraceCommands(program, { router });

    await expect(program.parseAsync(["node", "fast-browser", "trace", "mark", "--type", "goal_start", "--label", "checkout", "--data", "[]"]))
      .rejects.toThrow(/json input/i);
    expect(router.traceMark).not.toHaveBeenCalled();
  });
});

