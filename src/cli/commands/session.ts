import type { Command } from "commander";

import { printOutput } from "../parser";
import type { CliDependencies } from "../parser";
import { FastBrowserError } from "../../shared/errors";

function parseCleanupHours(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new FastBrowserError("FB_CLI_001", "session cleanup --max-age-hours must be a valid positive number", "cli");
  }
  return parsed;
}

export function registerSessionCommands(program: Command, deps: CliDependencies): void {
  const session = program.command("session");

  session.command("pin").option("--json").action(async (options) => {
    const result = await deps.router.sessionPin();
    printOutput(result, options.json);
  });

  session.command("unpin").option("--json").action(async (options) => {
    const result = await deps.router.sessionUnpin();
    printOutput(result, options.json);
  });

  session.command("status").option("--json").action(async (options) => {
    const result = await deps.router.sessionStatus();
    printOutput(result, options.json);
  });

  session.command("list").option("--json").action(async (options) => {
    const result = await deps.router.sessionList();
    printOutput(result, options.json);
  });

  session.command("cleanup").option("--max-age-hours <hours>").option("--json").action(async (options) => {
    const result = await deps.router.sessionCleanup({
      maxAgeHours: parseCleanupHours(options.maxAgeHours)
    });
    printOutput(result, options.json);
  });
}

