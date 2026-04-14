import type { AdapterResult } from "../shared/types";
import { toErrorShape } from "../shared/errors";

export function successResult<T>(
  adapterId: string,
  commandName: string,
  data: T,
  timingMs: number,
  cached = false
): AdapterResult<T> {
  return {
    success: true,
    data,
    meta: {
      adapterId,
      commandName,
      cached,
      timingMs
    }
  };
}

export function failureResult(
  adapterId: string,
  commandName: string,
  error: unknown,
  timingMs: number
): AdapterResult {
  return {
    success: false,
    error: toErrorShape(error),
    meta: {
      adapterId,
      commandName,
      cached: false,
      timingMs
    }
  };
}
