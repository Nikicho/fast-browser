import type { ErrorStage, FastBrowserErrorShape } from "./types";

export class FastBrowserError extends Error {
  public readonly code: string;
  public readonly stage: ErrorStage;
  public readonly retryable: boolean;
  public readonly cause?: unknown;
  public readonly details?: unknown;

  constructor(code: string, message: string, stage: ErrorStage, retryable = false, cause?: unknown, details?: unknown) {
    super(message);
    this.name = "FastBrowserError";
    this.code = code;
    this.stage = stage;
    this.retryable = retryable;
    this.cause = cause;
    this.details = details;
  }
}

export function toErrorShape(error: unknown): FastBrowserErrorShape {
  if (error instanceof FastBrowserError) {
    return {
      code: error.code,
      message: error.message,
      stage: error.stage,
      retryable: error.retryable,
      ...(error.details !== undefined ? { details: error.details } : {})
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

export function withErrorDetails(error: unknown, details: unknown): unknown {
  if (!(error instanceof FastBrowserError)) {
    return error;
  }
  const mergedDetails = mergeUnknownDetails(error.details, details);
  return new FastBrowserError(
    error.code,
    error.message,
    error.stage,
    error.retryable,
    error.cause,
    mergedDetails
  );
}

function mergeUnknownDetails(current: unknown, next: unknown): unknown {
  if (isPlainObject(current) && isPlainObject(next)) {
    return { ...current, ...next };
  }
  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
