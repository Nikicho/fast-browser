import type { Command } from "commander";

import { printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerHealthCommand(program: Command, deps: CliDependencies): void {
  program.command("health").argument("[adapter]").option("--json").action(async (adapter: string | undefined, options) => {
    const result = await deps.router.health(adapter);
    printOutput(result, options.json);
  });
}
