import type { Command } from "commander";

import { printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerWorkspaceCommand(program: Command, deps: CliDependencies): void {
  program.command("workspace").option("--json").action(async (options) => {
    const result = await deps.router.workspace();
    printOutput(result, options.json);
  });
}
