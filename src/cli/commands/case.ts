import type { Command } from "commander";

import { FastBrowserError } from "../../shared/errors";
import { collectUnknownOptions, parseJsonInput, printOutput } from "../parser";
import type { CliDependencies } from "../parser";

export function registerCaseCommands(program: Command, deps: CliDependencies): void {
  const caseCommand = program.command("case");

  caseCommand
    .command("save")
    .requiredOption("--site <site>")
    .option("--file <path>")
    .option("--id <id>")
    .option("--goal <goal>")
    .option("--flow <flowId>")
    .option("--url-includes <value>")
    .option("--text-includes <value>")
    .option("--selector-visible <selector>")
    .option("--title-not-empty")
    .option("--json")
    .action(async (options) => {
      if (options.file) {
        printOutput(await deps.router.caseSave(options.site, options.file), options.json);
        return;
      }
      if (options.id && options.goal && options.flow) {
        printOutput(await deps.router.caseSaveFromFlow(options.site, {
          id: options.id,
          goal: options.goal,
          flowId: options.flow,
          urlIncludes: options.urlIncludes,
          textIncludes: options.textIncludes,
          selectorVisible: options.selectorVisible,
          titleNotEmpty: options.titleNotEmpty
        }), options.json);
        return;
      }
      throw new FastBrowserError(
        "FB_CASE_001",
        "case save requires either --file <path> or --id <id> --goal <goal> --flow <flowId>.",
        "case"
      );
    });

  caseCommand
    .command("list")
    .argument("[site]")
    .option("--json")
    .action(async (site: string | undefined, options) => {
      printOutput(await deps.router.caseList(site), options.json);
    });

  caseCommand
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
      printOutput(await deps.router.caseRun(target, params), options.json);
    });
}
