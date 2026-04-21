import { describe, expect, it } from "vitest";

import { FastBrowserError, toErrorShape } from "../../../src/shared/errors";

describe("toErrorShape", () => {
  it("normalizes FastBrowserError instances", () => {
    const error = new FastBrowserError("FB_REG_001", "adapter missing", "registry", true, undefined, {
      adapterId: "demo",
      stage: "registry"
    });

    expect(toErrorShape(error)).toEqual({
      code: "FB_REG_001",
      message: "adapter missing",
      stage: "registry",
      retryable: true,
      details: {
        adapterId: "demo",
        stage: "registry"
      }
    });
  });

  it("falls back to an unknown error shape", () => {
    const shape = toErrorShape(new Error("boom"));

    expect(shape.code).toBe("FB_UNKNOWN");
    expect(shape.message).toBe("boom");
    expect(shape.stage).toBe("cli");
    expect(shape.retryable).toBe(false);
  });
});
