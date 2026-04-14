import fs from "node:fs/promises";
import path from "node:path";

import { getCommandDraftFilePath } from "../shared/constants";
import { FastBrowserError } from "../shared/errors";
import type { CommandDraftDefinition, CommandDraftSaveResult } from "../shared/types";

interface CommandDraftServiceOptions {
  root?: string;
  sessionId?: string;
}

export function createCommandDraftService(options: CommandDraftServiceOptions = {}) {
  return {
    async saveCommandDraft(site: string, definition: CommandDraftDefinition): Promise<CommandDraftSaveResult> {
      validateCommandDraftDefinition(site, definition);
      const outputPath = getCommandDraftFilePath(site, definition.id, options.root, options.sessionId);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, `${JSON.stringify(definition, null, 2)}
`, "utf8");
      return {
        ok: true,
        site,
        commandId: definition.id,
        path: outputPath,
        nextSuggestedCommand: `fast-browser command materialize --draft ${JSON.stringify(outputPath)}`
      };
    }
  };
}

function validateCommandDraftDefinition(site: string, definition: CommandDraftDefinition): void {
  if (definition.kind !== "command-draft") {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft kind must be 'command-draft'", "command");
  }
  if (!definition.id?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft id is required", "command");
  }
  if (definition.site !== site) {
    throw new FastBrowserError("FB_COMMAND_001", `Command draft site must match save site: ${site}`, "command");
  }
  if (!definition.goal?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft goal is required", "command");
  }
  if (!definition.command.name?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft name is required", "command");
  }
  if (!definition.command.description?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft description is required", "command");
  }
  if (!definition.command.example?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft example is required", "command");
  }
  if (!definition.source.tracePath?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft tracePath is required", "command");
  }
  if (!definition.source.entry?.entryId) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft source entry is required", "command");
  }
  if (!definition.implementation.suggestedFile?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft suggestedFile is required", "command");
  }
  if (!definition.implementation.suggestedExport?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft suggestedExport is required", "command");
  }
  if (!definition.implementation.suggestedManifestCommand?.name?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft suggestedManifestCommand is required", "command");
  }
  if (!definition.implementation.suggestedSource?.path?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft suggestedSource.path is required", "command");
  }
  if (!definition.implementation.suggestedSource?.content?.trim()) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft suggestedSource.content is required", "command");
  }
  if (!Array.isArray(definition.implementation.wiringNotes) || definition.implementation.wiringNotes.length === 0) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft wiringNotes are required", "command");
  }
  if (!Array.isArray(definition.implementation.notes) || definition.implementation.notes.length === 0) {
    throw new FastBrowserError("FB_COMMAND_001", "Command draft notes are required", "command");
  }
}
