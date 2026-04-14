import type { Command } from "commander";

import { FastBrowserError } from "../../shared/errors";
import { collectUnknownOptions, parseJsonInput, printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerFlowCommands(program: Command, deps: CliDependencies): void {
  const flow = program.command("flow");

  flow
    .command("save")
    .requiredOption("--site <site>")
    .option("--file <path>")
    .option("--id <id>")
    .option("--goal <goal>")
    .option("--from-trace")
    .option("--json")
    .action(async (options) => {
      if (options.file) {
        printOutput(await deps.router.flowSave(options.site, options.file), options.json);
        return;
      }
      if (options.fromTrace && options.id && options.goal) {
        printOutput(await deps.router.flowSaveFromTrace(options.site, { id: options.id, goal: options.goal }), options.json);
        return;
      }
      throw new FastBrowserError(
        "FB_FLOW_001",
        "flow save requires either --file <path> or --from-trace --id <id> --goal <goal>.",
        "flow"
      );
    });

  flow
    .command("list")
    .argument("[site]")
    .option("--json")
    .action(async (site: string | undefined, options) => {
      printOutput(await deps.router.flowList(site), options.json);
    });

  flow
    .command("run")
    .argument("<target>")
    .argument("[args...]")
    .allowUnknownOption()
    .allowExcessArguments(true)
    .option("--input <json>")
    .option("--json")
    .action(async (target: string, args: string[], options) => {
      const input = options.input ? parseJsonInput(options.input) : {};
      const params = { ...input, ...collectUnknownOptions(args) };
      printOutput(await deps.router.flowRun(target, params), options.json);
    });
}
