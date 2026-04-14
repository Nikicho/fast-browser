import type { Command } from "commander";

import { collectUnknownOptions, parseJsonInput, printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerSiteCommand(program: Command, deps: CliDependencies): void {
  program
    .command("site")
    .argument("<target>")
    .argument("[args...]")
    .allowUnknownOption()
    .allowExcessArguments(true)
    .option("--json")
    .option("--input <json>")
    .option("--no-cache")
    .action(async (target: string, args: string[], options: { json?: boolean; input?: string; cache?: boolean }) => {
      const input = options.input ? parseJsonInput(options.input) : {};
      const params = {
        ...input,
        ...collectUnknownOptions(args)
      };
      const result = await deps.router.site(target, params, options.json ? "json" : "text", options.cache ?? true);
      printOutput(result, options.json ?? false);
    });
}
