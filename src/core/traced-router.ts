import { randomUUID } from "node:crypto";

import { toErrorShape } from "../shared/errors";
import type { ExecutionTraceEntry } from "../shared/types";
import type { ExecutionTraceStore } from "../runtime/execution-trace";

export function createTracedRouter<T extends object>(router: T, traceStore: ExecutionTraceStore): T {
  return new Proxy(router, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }

      const command = String(property);
      if (command.startsWith("trace")) {
        return value.bind(target);
      }

      return async (...input: unknown[]) => {
        const startedAt = Date.now();
        try {
          const output = await value.apply(target, input);
          await traceStore.append(createEntry(command, input, Date.now() - startedAt, true, output));
          return output;
        } catch (error) {
          await traceStore.append(createEntry(command, input, Date.now() - startedAt, false, undefined, error));
          throw error;
        }
      };
    }
  });
}

function createEntry(command: string, input: unknown[], durationMs: number, ok: boolean, output?: unknown, error?: unknown): ExecutionTraceEntry {
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    kind: "command",
    command,
    input,
    ok,
    durationMs,
    ...(ok ? { output } : { error: toErrorShape(error) })
  };
}
