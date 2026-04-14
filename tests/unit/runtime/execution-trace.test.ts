import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ExecutionTraceStore } from "../../../src/runtime/execution-trace";

describe("ExecutionTraceStore", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("appends entries and returns the latest ones in chronological order", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-trace-"));
    tempDirs.push(root);
    const traceStore = new ExecutionTraceStore(path.join(root, "events.jsonl"));

    await traceStore.append({
      id: "evt-1",
      at: "2026-03-19T10:00:00.000Z",
      kind: "command",
      command: "open",
      input: ["https://example.com"],
      ok: true,
      durationMs: 10
    });
    await traceStore.append({
      id: "evt-2",
      at: "2026-03-19T10:00:01.000Z",
      kind: "command",
      command: "click",
      input: ["#submit"],
      ok: false,
      durationMs: 12,
      error: {
        code: "FB_RT_002",
        message: "Missing selector",
        stage: "runtime",
        retryable: false
      }
    });

    await expect(traceStore.latest(1)).resolves.toEqual([
      expect.objectContaining({ id: "evt-2", command: "click", ok: false })
    ]);
    await expect(traceStore.latest(5)).resolves.toEqual([
      expect.objectContaining({ id: "evt-1", command: "open", ok: true }),
      expect.objectContaining({ id: "evt-2", command: "click", ok: false })
    ]);
  });

  it("returns the entries for the current goal since the latest goal_start marker", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-trace-"));
    tempDirs.push(root);
    const traceStore = new ExecutionTraceStore(path.join(root, "events.jsonl"));

    await traceStore.append({
      id: "evt-1",
      at: "2026-03-19T10:00:00.000Z",
      kind: "marker",
      command: "trace.mark",
      input: [{ type: "goal_start", label: "old-goal" }],
      ok: true,
      durationMs: 0,
      marker: { type: "goal_start", label: "old-goal" }
    });
    await traceStore.append({
      id: "evt-2",
      at: "2026-03-19T10:00:01.000Z",
      kind: "command",
      command: "open",
      input: ["https://example.com/old"],
      ok: true,
      durationMs: 5
    });
    await traceStore.append({
      id: "evt-3",
      at: "2026-03-19T10:00:02.000Z",
      kind: "marker",
      command: "trace.mark",
      input: [{ type: "goal_start", label: "new-goal" }],
      ok: true,
      durationMs: 0,
      marker: { type: "goal_start", label: "new-goal" }
    });
    await traceStore.append({
      id: "evt-4",
      at: "2026-03-19T10:00:03.000Z",
      kind: "command",
      command: "click",
      input: ["#submit"],
      ok: true,
      durationMs: 7
    });

    await expect(traceStore.current()).resolves.toEqual({
      startMarker: expect.objectContaining({ id: "evt-3", marker: { type: "goal_start", label: "new-goal" } }),
      entries: [
        expect.objectContaining({ id: "evt-3" }),
        expect.objectContaining({ id: "evt-4", command: "click" })
      ]
    });
  });

  it("ignores malformed trace lines instead of failing the whole session", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-trace-"));
    tempDirs.push(root);
    const tracePath = path.join(root, "events.jsonl");
    const traceStore = new ExecutionTraceStore(tracePath);

    await fs.writeFile(tracePath, [
      JSON.stringify({
        id: "evt-1",
        at: "2026-03-19T10:00:00.000Z",
        kind: "marker",
        command: "trace.mark",
        input: [{ type: "goal_start", label: "goal" }],
        ok: true,
        durationMs: 0,
        marker: { type: "goal_start", label: "goal" }
      }),
      "{ not-json",
      JSON.stringify({
        id: "evt-2",
        at: "2026-03-19T10:00:01.000Z",
        kind: "command",
        command: "open",
        input: ["https://example.com"],
        ok: true,
        durationMs: 5
      })
    ].join("\n"), "utf8");

    await expect(traceStore.latest(10)).resolves.toEqual([
      expect.objectContaining({ id: "evt-1" }),
      expect.objectContaining({ id: "evt-2" })
    ]);
    await expect(traceStore.current()).resolves.toEqual({
      startMarker: expect.objectContaining({ id: "evt-1" }),
      entries: [
        expect.objectContaining({ id: "evt-1" }),
        expect.objectContaining({ id: "evt-2" })
      ]
    });
  });
});
