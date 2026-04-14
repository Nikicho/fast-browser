import type { Command } from "commander";

import { printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerInfoCommand(program: Command, deps: CliDependencies): void {
  program.command("info").argument("<adapter>").option("--json").action(async (adapter: string, options) => {
    const result = await deps.router.info(adapter);
    printOutput(result, options.json);
  });
}
