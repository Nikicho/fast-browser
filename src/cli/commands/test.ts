import type { Command } from "commander";

import { printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerTestCommand(program: Command, deps: CliDependencies): void {
  program
    .command("test")
    .argument("<adapter>")
    .argument("[command]")
    .option("--json")
    .action(async (adapter: string, commandName: string | undefined, options) => {
      const result = await deps.router.test(adapter, commandName);
      printOutput(result, options.json);
    });
}
