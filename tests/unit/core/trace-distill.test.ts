import { describe, expect, it } from "vitest";

import { distillCurrentTraceSegment } from "../../../src/core/trace-distill";

describe("distillCurrentTraceSegment", () => {
  it("returns a cleaned success path with locator details and failed steps discarded", () => {
    const result = distillCurrentTraceSegment({
      startMarker: {
        id: "m1",
        at: "2026-03-24T10:00:00.000Z",
        kind: "marker",
        command: "trace.mark",
        input: [{ type: "goal_start", label: "publish" }],
        ok: true,
        durationMs: 0,
        marker: { type: "goal_start", label: "publish" }
      },
      entries: [
        {
          id: "m1",
          at: "2026-03-24T10:00:00.000Z",
          kind: "marker",
          command: "trace.mark",
          input: [{ type: "goal_start", label: "publish" }],
          ok: true,
          durationMs: 0,
          marker: { type: "goal_start", label: "publish" }
        },
        {
          id: "c1",
          at: "2026-03-24T10:00:01.000Z",
          kind: "command",
          command: "snapshot",
          input: [{ interactiveOnly: true }],
          ok: true,
          durationMs: 25,
          output: { ok: true, url: "https://example.com", title: "Example" }
        },
        {
          id: "c2",
          at: "2026-03-24T10:00:02.000Z",
          kind: "command",
          command: "click",
          input: ["@e3"],
          ok: true,
          durationMs: 40,
          output: {
            ok: true,
            url: "https://example.com/publish",
            title: "Publish",
            selector: 'button[data-testid="publish-image"]',
            selectorCandidates: ['button[data-testid="publish-image"]', 'div:nth-of-type(7) > button:nth-of-type(2)']
          }
        },
        {
          id: "c3",
          at: "2026-03-24T10:00:03.000Z",
          kind: "command",
          command: "site",
          input: ["demo/open-publish", { draft: false }, "json", false],
          ok: true,
          durationMs: 55,
          output: { success: true, data: { opened: true } }
        },
        {
          id: "c4",
          at: "2026-03-24T10:00:04.000Z",
          kind: "command",
          command: "click",
          input: [".retry"],
          ok: false,
          durationMs: 12,
          error: {
            code: "FB_RT_002",
            message: "Missing selector",
            stage: "runtime",
            retryable: false
          }
        },
        {
          id: "cp1",
          at: "2026-03-24T10:00:05.000Z",
          kind: "marker",
          command: "trace.mark",
          input: [{ type: "checkpoint", label: "composer-ready" }],
          ok: true,
          durationMs: 0,
          marker: { type: "checkpoint", label: "composer-ready" }
        },
        {
          id: "m2",
          at: "2026-03-24T10:00:06.000Z",
          kind: "marker",
          command: "trace.mark",
          input: [{ type: "goal_success", label: "publish" }],
          ok: true,
          durationMs: 0,
          marker: { type: "goal_success", label: "publish" }
        }
      ]
    });

    expect(result.status).toBe("success");
    expect(result.endMarker?.marker?.type).toBe("goal_success");
    expect(result.rawEntryCount).toBe(7);
    expect(result.checkpoints).toEqual([expect.objectContaining({ id: "cp1" })]);
    expect(result.discarded).toEqual([{ entryId: "c4", command: "click", reason: "failed" }]);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]).toMatchObject({
      entryId: "c1",
      command: "snapshot",
      flowSafe: false,
      commandCandidate: false,
      summary: "采集页面快照（探索证据）"
    });
    expect(result.entries[0].notes).toContain("探索命令，不应直接进入已保存的 flow/case。");
    expect(result.entries[1]).toMatchObject({
      entryId: "c2",
      command: "click",
      flowSafe: true,
      commandCandidate: true,
      locator: {
        rawTarget: "@e3",
        strategy: "snapshot_ref",
        resolvedSelector: 'button[data-testid="publish-image"]',
        selectorCandidates: ['button[data-testid="publish-image"]', 'div:nth-of-type(7) > button:nth-of-type(2)']
      }
    });
    expect(result.entries[2]).toMatchObject({
      entryId: "c3",
      command: "site",
      flowSafe: true,
      commandCandidate: false,
      summary: "执行站点命令 demo/open-publish"
    });
  });

  it("keeps an in-progress segment open when no terminal marker exists", () => {
    const result = distillCurrentTraceSegment({
      startMarker: null,
      entries: [
        {
          id: "c1",
          at: "2026-03-24T10:00:01.000Z",
          kind: "command",
          command: "open",
          input: ["https://example.com"],
          ok: true,
          durationMs: 10,
          output: { ok: true, url: "https://example.com" }
        }
      ]
    });

    expect(result.status).toBe("idle");
    expect(result.endMarker).toBeNull();
    expect(result.entries).toEqual([
      expect.objectContaining({
        command: "open",
        flowSafe: true,
        commandCandidate: false,
        summary: "打开 https://example.com"
      })
    ]);
  });
});
