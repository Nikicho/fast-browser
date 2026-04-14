import type { Command } from "commander";

import { FastBrowserError } from "../../shared/errors";
import type { CommandDraftSaveResult, CommandMaterializeResult } from "../../shared/types";
import { printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerCommandCommands(program: Command, deps: CliDependencies): void {
  const command = program.command("command");

  command
    .command("materialize")
    .requiredOption("--draft <path>")
    .option("--json")
    .action(async (options) => {
      const result = await deps.router.commandMaterialize(options.draft) as CommandMaterializeResult;
      if (options.json) {
        printOutput(result, true);
        return;
      }
      console.log(formatCommandMaterializeResult(result));
    });

  command
    .command("save")
    .requiredOption("--site <site>")
    .option("--from-trace")
    .option("--id <id>")
    .option("--goal <goal>")
    .option("--json")
    .action(async (options) => {
      if (options.fromTrace && options.id && options.goal) {
        const result = await deps.router.commandSaveFromTrace(options.site, {
          id: options.id,
          goal: options.goal
        }) as CommandDraftSaveResult;
        if (options.json) {
          printOutput(result, true);
          return;
        }
        console.log(formatCommandSaveResult(result));
        return;
      }

      throw new FastBrowserError(
        "FB_COMMAND_001",
        "command save requires --from-trace --id <id> --goal <goal>.",
        "command"
      );
    });
}

function formatCommandSaveResult(result: CommandDraftSaveResult): string {
  return [
    "Command draft saved",
    `Site: ${result.site}`,
    `Command: ${result.commandId}`,
    `Draft: ${result.path}`,
    `Next: ${result.nextSuggestedCommand}`
  ].join("\n");
}

function formatCommandMaterializeResult(result: CommandMaterializeResult): string {
  return [
    "Command draft materialized",
    `Site: ${result.site}`,
    `Command: ${result.commandId}`,
    `Draft: ${result.draftPath}`,
    `Patches: ${result.patches.length}`,
    `Warnings: ${result.warnings.length}`
  ].join("\n");
}
