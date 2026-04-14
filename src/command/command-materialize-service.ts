import fs from "node:fs/promises";
import path from "node:path";

import { getCustomAdaptersDir } from "../shared/constants";
import { FastBrowserError } from "../shared/errors";
import type { CommandDraftDefinition, CommandMaterializePatch, CommandMaterializeResult } from "../shared/types";

interface CommandMaterializeServiceOptions {
  root?: string;
  adaptersDir?: string;
}

export function createCommandMaterializeService(options: CommandMaterializeServiceOptions = {}) {
  const adaptersDir = options.adaptersDir ?? getCustomAdaptersDir(options.root);

  return {
    async materializeDraft(draftPath: string): Promise<CommandMaterializeResult> {
      const definition = await loadDraftDefinition(draftPath);
      validateDraftForMaterialize(definition);

      const adapterDir = path.join(adaptersDir, definition.site);
      const manifestPath = path.join(adapterDir, "manifest.json");
      const indexPath = path.join(adapterDir, "index.ts");
      const sourcePath = resolveTargetPath(definition.implementation.suggestedSource.path, options.root, adapterDir);

      const warnings: string[] = [];
      const patches: CommandMaterializePatch[] = [];

      patches.push(await buildManifestPatch(manifestPath, definition, warnings));
      patches.push(await buildSourcePatch(sourcePath, definition));
      patches.push(await buildIndexPatch(indexPath, definition));

      return {
        ok: true,
        site: definition.site,
        commandId: definition.id,
        draftPath: path.resolve(draftPath),
        patches,
        warnings
      };
    }
  };
}

async function loadDraftDefinition(draftPath: string): Promise<CommandDraftDefinition> {
  const raw = await fs.readFile(draftPath, "utf8");
  return JSON.parse(stripBom(raw)) as CommandDraftDefinition;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function validateDraftForMaterialize(definition: CommandDraftDefinition): void {
  if (definition.kind !== "command-draft") {
    throw new FastBrowserError("FB_COMMAND_001", "Only command-draft assets can be materialized", "command");
  }
  if (!definition.site?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft site is required", "command");
  }
  if (!definition.id?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft id is required", "command");
  }
}

function resolveTargetPath(candidate: string, root: string | undefined, adapterDir: string): string {
  if (path.isAbsolute(candidate)) {
    return candidate;
  }
  if (root) {
    return path.join(root, candidate);
  }
  if (candidate.startsWith("src" + path.sep) || candidate.startsWith("src/")) {
    return path.resolve(candidate);
  }
  return path.join(adapterDir, candidate);
}

async function buildManifestPatch(
  manifestPath: string,
  definition: CommandDraftDefinition,
  warnings: string[]
): Promise<CommandMaterializePatch> {
  const raw = await safeReadFile(manifestPath);
  if (!raw) {
    throw new FastBrowserError("FB_COMMAND_001", `Adapter manifest not found for site: ${definition.site}`, "command");
  }

  const manifest = JSON.parse(stripBom(raw)) as { commands?: Array<{ name?: string }> } & Record<string, unknown>;
  const commands = Array.isArray(manifest.commands) ? [...manifest.commands] : [];
  const existingIndex = commands.findIndex((item) => item?.name === definition.command.name);
  if (existingIndex >= 0) {
    warnings.push(`Manifest already contains command ${definition.command.name}; patch suggestion will replace that entry.`);
    commands.splice(existingIndex, 1, definition.implementation.suggestedManifestCommand);
  } else {
    commands.push(definition.implementation.suggestedManifestCommand);
  }

  return {
    kind: "manifest",
    path: manifestPath,
    status: "update",
    summary: existingIndex >= 0 ? `Replace command entry ${definition.command.name} in manifest.json.` : `Append command entry ${definition.command.name} to manifest.json.`,
    content: `${JSON.stringify({ ...manifest, commands }, null, 2)}
`
  };
}

async function buildSourcePatch(sourcePath: string, definition: CommandDraftDefinition): Promise<CommandMaterializePatch> {
  const exists = await fileExists(sourcePath);
  return {
    kind: "source",
    path: sourcePath,
    status: exists ? "update" : "create",
    summary: exists ? `Replace ${path.basename(sourcePath)} with the draft source skeleton.` : `Create ${path.basename(sourcePath)} from the draft source skeleton.`,
    content: definition.implementation.suggestedSource.content
  };
}

async function buildIndexPatch(indexPath: string, definition: CommandDraftDefinition): Promise<CommandMaterializePatch> {
  const exists = await fileExists(indexPath);
  const importSnippet = `import { ${definition.implementation.suggestedExport} } from "./commands/${definition.id}";`;
  const dispatchSnippet = [
    `if (commandName === ${JSON.stringify(definition.id)}) {`,
    `  return successResult(${JSON.stringify(definition.site)}, commandName, await ${definition.implementation.suggestedExport}(params, context), Date.now() - startedAt);`,
    `}`
  ].join("\n");
  const noteBlock = definition.implementation.wiringNotes.map((note) => `// ${note}`).join("\n");

  return {
    kind: "index",
    path: indexPath,
    status: exists ? "update" : "create",
    summary: exists ? `Add import and dispatch branch for ${definition.id} in index.ts.` : `Create an index.ts wiring skeleton for ${definition.id}.`,
    content: `${noteBlock}
${importSnippet}

${dispatchSnippet}
`
  };
}

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
