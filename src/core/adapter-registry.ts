import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { createBuiltInAdapters } from "../adapters/index";
import { getCustomAdaptersDir } from "../shared/constants";
import type { Adapter, BrowserRuntime } from "../shared/types";

const adapterArgSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean().optional(),
  description: z.string().optional(),
  defaultValue: z.unknown().optional()
});

const adapterManifestSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  version: z.string(),
  platform: z.string(),
  description: z.string(),
  homepage: z.string().optional(),
  commands: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      args: z.array(adapterArgSchema),
      example: z.string(),
      cacheable: z.boolean().optional()
    })
  ),
  defaultTtlMs: z.number().optional(),
  sessionPolicy: z.enum(["none", "optional", "required"]).optional()
});

interface AdapterLoadDiagnostic {
  adapterId: string;
  stage: "manifest" | "module" | "export";
  message: string;
}

export class AdapterRegistry {
  private diagnostics: AdapterLoadDiagnostic[] = [];

  constructor(
    private readonly runtime: BrowserRuntime,
    private readonly customAdaptersDir = getCustomAdaptersDir()
  ) {}

  async discover(): Promise<Adapter[]> {
    this.diagnostics = [];
    const builtIns = createBuiltInAdapters(this.runtime);
    const custom = await this.loadCustomAdapters();
    return [...builtIns, ...custom];
  }

  getLoadDiagnostics(): AdapterLoadDiagnostic[] {
    return [...this.diagnostics];
  }

  private async loadCustomAdapters(): Promise<Adapter[]> {
    try {
      const entries = await fs.readdir(this.customAdaptersDir, { withFileTypes: true });
      const adapters = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => this.loadCustomAdapter(path.join(this.customAdaptersDir, entry.name)))
      );
      return adapters.filter((value): value is Adapter => Boolean(value));
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async loadCustomAdapter(adapterDir: string): Promise<Adapter | null> {
    const fallbackAdapterId = path.basename(adapterDir);
    const manifestPath = path.join(adapterDir, "manifest.json");

    try {
      await fs.access(manifestPath);
    } catch {
      return null;
    }

    try {
      const manifestRaw = await fs.readFile(manifestPath, "utf8");
      const manifest = adapterManifestSchema.parse(JSON.parse(stripBom(manifestRaw)));
      const modulePath = await this.resolveAdapterModule(adapterDir);
      const imported = require(modulePath) as Record<string, unknown>;
      const adapter = unwrapAdapterExport(imported);
      if (!adapter) {
        this.diagnostics.push({
          adapterId: manifest.id,
          stage: "export",
          message: "Adapter module did not export a usable adapter object"
        });
        return null;
      }
      adapter.manifest = manifest;
      return adapter;
    } catch (error) {
      this.diagnostics.push(toDiagnostic(fallbackAdapterId, error));
      return null;
    }
  }

  private async resolveAdapterModule(adapterDir: string): Promise<string> {
    for (const candidate of ["index.ts", "index.js"]) {
      const filePath = path.join(adapterDir, candidate);
      try {
        await fs.access(filePath);
        return filePath;
      } catch {
        continue;
      }
    }
    throw new Error("Adapter entry file missing");
  }
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function toDiagnostic(adapterId: string, error: unknown): AdapterLoadDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("adapter entry file missing") || normalized.includes("cannot find module")) {
    return { adapterId, stage: "module", message };
  }
  if (normalized.includes("export")) {
    return { adapterId, stage: "export", message };
  }
  return { adapterId, stage: "manifest", message };
}

function unwrapAdapterExport(imported: Record<string, unknown>): Adapter | null {
  const candidates = [
    imported.adapter,
    imported.default,
    getNested(imported.default, "adapter"),
    getNested(imported.default, "default"),
    getNested(imported["module.exports"], "adapter"),
    getNested(imported["module.exports"], "default")
  ];

  for (const candidate of candidates) {
    if (isAdapter(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getNested(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function isAdapter(value: unknown): value is Adapter {
  return Boolean(value && typeof value === "object" && "execute" in value && typeof (value as { execute?: unknown }).execute === "function");
}
