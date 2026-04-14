import type { Command } from "commander";

import { printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerAuthCommands(program: Command, deps: CliDependencies): void {
  const auth = program.command("auth");

  auth.command("sync").option("--json").action(async (options) => {
    const result = await deps.router.authSync();
    printOutput(result, options.json);
  });
}
