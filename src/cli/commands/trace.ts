import type { Command } from "commander";

import { parseJsonInput, printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerTraceCommands(program: Command, deps: CliDependencies): void {
  const trace = program.command("trace");

  trace.command("latest").argument("[limit]").option("--json").action(async (limit: string | undefined, options) => {
    printOutput(await deps.router.traceLatest(limit ? Number(limit) : 20), options.json);
  });

  trace.command("mark")
    .requiredOption("--type <type>")
    .requiredOption("--label <text>")
    .option("--data <json>")
    .option("--json")
    .action(async (options) => {
      printOutput(await deps.router.traceMark(options.type, options.label, options.data ? parseJsonInput(options.data) : undefined), options.json);
    });

  trace.command("current").option("--json").action(async (options) => {
    printOutput(await deps.router.traceCurrent(), options.json);
  });
}
