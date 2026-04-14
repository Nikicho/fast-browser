import type { Command } from "commander";

import { printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerListCommand(program: Command, deps: CliDependencies): void {
  program.command("list").option("--json").action(async (options) => {
    const result = await deps.router.list();
    printOutput(result, options.json);
  });
}
