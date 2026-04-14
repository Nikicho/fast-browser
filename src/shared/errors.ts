import type { ErrorStage, FastBrowserErrorShape } from "./types";

export class FastBrowserError extends Error {
  public readonly code: string;
  public readonly stage: ErrorStage;
  public readonly retryable: boolean;
  public readonly cause?: unknown;

  constructor(code: string, message: string, stage: ErrorStage, retryable = false, cause?: unknown) {
    super(message);
    this.name = "FastBrowserError";
    this.code = code;
    this.stage = stage;
    this.retryable = retryable;
    this.cause = cause;
  }
}

export function toErrorShape(error: unknown): FastBrowserErrorShape {
  if (error instanceof FastBrowserError) {
    return {
      code: error.code,
      message: error.message,
      stage: error.stage,
      retryable: error.retryable
    };
  }

  if (error instanceof Error) {
    return {
      code: "FB_UNKNOWN",
      message: error.message,
      stage: "cli",
      retryable: false
    };
  }

  return {
    code: "FB_UNKNOWN",
    message: "Unknown error",
    stage: "cli",
    retryable: false
  };
}
