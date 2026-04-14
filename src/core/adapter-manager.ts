import type { Logger } from "pino";
import { z } from "zod";

import { buildCacheKey } from "../cache/cache-key";
import { FastBrowserError } from "../shared/errors";
import type { Adapter, AdapterResult, BrowserRuntime, CacheStore, SessionStore, SiteRequest } from "../shared/types";
import { failureResult } from "./result";

interface AdapterManagerOptions {
  adapters: Adapter[];
  cache: CacheStore;
  runtime: BrowserRuntime;
  logger: Logger;
  sessionStore: SessionStore;
}

export class AdapterManager {
  private readonly adapters = new Map<string, Adapter>();

  constructor(private readonly options: AdapterManagerOptions) {
    for (const adapter of options.adapters) {
      this.adapters.set(adapter.manifest.id, adapter);
    }
  }

  listAdapters(): Adapter[] {
    return Array.from(this.adapters.values());
  }

  getAdapter(id: string): Adapter | undefined {
    return this.adapters.get(id);
  }

  async health(adapterId?: string): Promise<Array<{ id: string; ok: boolean }>> {
    const adapters = adapterId ? [this.requireAdapter(adapterId)] : this.listAdapters();
    return Promise.all(
      adapters.map(async (adapter) => ({
        id: adapter.manifest.id,
        ok: adapter.healthCheck
          ? await adapter.healthCheck({
              runtime: this.options.runtime,
              cache: this.options.cache,
              logger: this.options.logger,
              sessionStore: this.options.sessionStore
            })
          : true
      }))
    );
  }

  async execute(request: SiteRequest): Promise<AdapterResult> {
    const adapter = this.requireAdapter(request.adapterId);
    const command = adapter.manifest.commands.find((item) => item.name === request.commandName);
    if (!command) {
      throw new FastBrowserError("FB_ADAPTER_001", `Command ${request.commandName} not found`, "adapter");
    }

    const params = this.validateParams(adapter.manifest.id, command, request.params);
    const cacheable = Boolean(command.cacheable && request.useCache);
    const cacheKey = cacheable ? buildCacheKey(request.adapterId, request.commandName, params) : null;

    if (cacheKey) {
      const cachedData = await this.options.cache.get<unknown>(cacheKey);
      if (cachedData !== null) {
        return {
          success: true,
          data: cachedData,
          meta: {
            adapterId: request.adapterId,
            commandName: request.commandName,
            cached: true,
            timingMs: 0
          }
        };
      }
    }

    const result = await adapter.execute(request.commandName, params, {
      runtime: this.options.runtime,
      cache: this.options.cache,
      logger: this.options.logger,
      sessionStore: this.options.sessionStore
    });

    if (result.success && cacheKey) {
      await this.options.cache.set(cacheKey, result.data, {
        ttlMs: adapter.manifest.defaultTtlMs
      });
    }

    return result;
  }

  private requireAdapter(id: string): Adapter {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new FastBrowserError("FB_REG_001", `Adapter ${id} not found`, "registry");
    }
    return adapter;
  }

  private validateParams(adapterId: string, command: Adapter["manifest"]["commands"][number], params: Record<string, unknown>): Record<string, unknown> {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const arg of command.args) {
      let schema: z.ZodTypeAny;
      switch (arg.type) {
        case "number":
          schema = z.number();
          break;
        case "boolean":
          schema = z.boolean();
          break;
        default:
          schema = z.string();
      }

      if (!arg.required && arg.defaultValue !== undefined) {
        schema = schema.default(arg.defaultValue);
      }
      if (!arg.required && arg.defaultValue === undefined) {
        schema = schema.optional();
      }

      shape[arg.name] = schema;
    }

    try {
      return z.object(shape).strict().parse(params);
    } catch (error) {
      throw new FastBrowserError(`FB_ADAPTER_002`, buildParamValidationMessage(adapterId, command, params, error), `adapter`, false, error);
    }
  }
}

export function toManagerFailure(adapterId: string, commandName: string, error: unknown): AdapterResult {
  return failureResult(adapterId, commandName, error, 0);
}
function buildParamValidationMessage(
  adapterId: string,
  command: Adapter["manifest"]["commands"][number],
  params: Record<string, unknown>,
  error: unknown
): string {
  const details: string[] = [];

  if (error instanceof z.ZodError) {
    const missingRequired = new Set<string>();
    const unknownFields = new Set<string>();
    const invalidFields = new Set<string>();

    for (const issue of error.issues) {
      const pathName = typeof issue.path[0] === "string" ? issue.path[0] : undefined;
      if (issue.code === "invalid_type" && pathName && issue.input === undefined) {
        missingRequired.add(pathName);
        continue;
      }
      if (issue.code === "unrecognized_keys") {
        for (const key of issue.keys) {
          unknownFields.add(key);
        }
        continue;
      }
      if (pathName) {
        invalidFields.add(`${pathName} (${issue.message})`);
      } else {
        invalidFields.add(issue.message);
      }
    }

    if (missingRequired.size > 0) {
      details.push(`missing required: ${Array.from(missingRequired).join(", ")}`);
    }
    if (unknownFields.size > 0) {
      details.push(`unknown fields: ${Array.from(unknownFields).join(", ")}`);
    }
    if (invalidFields.size > 0) {
      details.push(`invalid values: ${Array.from(invalidFields).join("; ")}`);
    }
  } else if (error instanceof Error && error.message) {
    details.push(error.message);
  }

  const argSummary = command.args.length > 0
    ? command.args
      .map((arg) => `${arg.name}:${arg.type}${arg.required ? " (required)" : ""}`)
      .join(", ")
    : "none";
  const providedSummary = Object.keys(params).length > 0 ? JSON.stringify(params) : "{}";

  return [
    `Adapter parameters are invalid for ${adapterId}/${command.name}.`,
    details.length > 0 ? details.join(". ") : undefined,
    `expected args: ${argSummary}`,
    `provided: ${providedSummary}`,
    `example: ${command.example}`,
    `Run 'fast-browser info ${adapterId} --json' to inspect command args.`
  ].filter(Boolean).join(" ");
}




