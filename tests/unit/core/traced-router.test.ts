import { describe, expect, it, vi } from "vitest";

import { FastBrowserError } from "../../../src/shared/errors";
import { createTracedRouter } from "../../../src/core/traced-router";

describe("createTracedRouter", () => {
  it("records successful router calls", async () => {
    const append = vi.fn(async () => undefined);
    const traceStore = { append } as any;
    const router = {
      open: vi.fn(async () => ({ ok: true, url: "https://example.com" })),
      traceLatest: vi.fn()
    } as any;

    const tracedRouter = createTracedRouter(router, traceStore);
    const result = await tracedRouter.open("https://example.com", { headless: false });

    expect(result).toEqual({ ok: true, url: "https://example.com" });
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "command",
        command: "open",
        input: ["https://example.com", { headless: false }],
        ok: true,
        output: { ok: true, url: "https://example.com" }
      })
    );
  });

  it("records router errors and rethrows them", async () => {
    const append = vi.fn(async () => undefined);
    const traceStore = { append } as any;
    const error = new FastBrowserError("FB_RT_002", "Missing selector", "runtime");
    const router = {
      click: vi.fn(async () => { throw error; }),
      traceLatest: vi.fn()
    } as any;

    const tracedRouter = createTracedRouter(router, traceStore);

    await expect(tracedRouter.click("#missing")).rejects.toBe(error);
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "command",
        command: "click",
        input: ["#missing"],
        ok: false,
        error: expect.objectContaining({ code: "FB_RT_002", stage: "runtime" })
      })
    );
  });
});
