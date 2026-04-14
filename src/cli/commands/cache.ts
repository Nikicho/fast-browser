import type { Command } from "commander";

import { printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerCacheCommand(program: Command, deps: CliDependencies): void {
  const cache = program.command("cache");

  cache.command("stats").option("--json").action(async (options) => {
    const result = await deps.router.cacheStats();
    printOutput(result, options.json);
  });

  cache
    .command("clear")
    .argument("[adapter]")
    .option("--all")
    .option("--json")
    .action(async (adapter: string | undefined, options) => {
      const result = await deps.router.cacheClear({ adapterId: adapter, all: options.all });
      printOutput(result, options.json);
    });
}
