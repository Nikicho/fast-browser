import type { Command } from "commander";

import { printOutput } from "../parser";
import type { CliDependencies, GuideCommandOptions } from "../parser";
import { FastBrowserError } from "../../shared/errors";

const GUIDE_MODES = ["inspect", "plan", "scaffold"] as const;
const GUIDE_STRATEGIES = ["auto", "network", "dom"] as const;
const REQUIRED_NON_INTERACTIVE_GUIDE_FIELDS = [
  ["platform", "--platform"],
  ["url", "--url"],
  ["capability", "--capability"]
] as const;

function normalizePositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new FastBrowserError("FB_CLI_001", `${name} must be a positive integer`, "cli");
  }
  return parsed;
}

function normalizeGuideStrategy(value: unknown): GuideCommandOptions["strategy"] {
  if (value === undefined) {
    return "auto";
  }
  if (typeof value === "string" && GUIDE_STRATEGIES.some((item) => item === value)) {
    return value as GuideCommandOptions["strategy"];
  }
  throw new FastBrowserError("FB_CLI_001", `guide --strategy must be one of: ${GUIDE_STRATEGIES.join(", ")}`, "cli");
}

function normalizeGuideOptions(options: Record<string, unknown>): GuideCommandOptions {
  return {
    platform: options.platform as string | undefined,
    url: options.url as string | undefined,
    capability: options.capability as string | undefined,
    strategy: normalizeGuideStrategy(options.strategy),
    commandName: (options.command as string | undefined) ?? "search",
    ttlSeconds: normalizePositiveInteger(options.ttlSeconds, "guide --ttl-seconds") ?? 300,
    requiresLogin: typeof options.requiresLogin === "boolean" ? options.requiresLogin : false,
    cacheable: typeof options.cacheable === "boolean" ? options.cacheable : true,
    runTest: typeof options.runTest === "boolean" ? options.runTest : false
  };
}

function assertNonInteractiveGuideOptions(mode: "plan" | "scaffold", options: GuideCommandOptions): void {
  const missingFlags = REQUIRED_NON_INTERACTIVE_GUIDE_FIELDS
    .filter(([field]) => options[field as keyof GuideCommandOptions] === undefined || options[field as keyof GuideCommandOptions] === "")
    .map(([, flag]) => flag);

  if (missingFlags.length > 0) {
    throw new FastBrowserError(
      "FB_CLI_001",
      `guide ${mode} requires non-interactive flags: ${missingFlags.join(", ")}`,
      "cli"
    );
  }
}

function normalizeGuideMode(mode: string): (typeof GUIDE_MODES)[number] {
  if (GUIDE_MODES.includes(mode as (typeof GUIDE_MODES)[number])) {
    return mode as (typeof GUIDE_MODES)[number];
  }
  throw new FastBrowserError("FB_CLI_001", `Unknown guide mode: ${mode}`, "cli");
}

export function registerGuideCommand(program: Command, deps: CliDependencies): void {
  program
    .command("guide")
    .description("Inspect, plan, or scaffold a new adapter")
    .argument("[mode]", "inspect | plan | scaffold", "scaffold")
    .option("--platform <name>")
    .option("--url <url>")
    .option("--capability <text>")
    .option("--strategy <auto|network|dom>")
    .option("--command <name>")
    .option("--ttl-seconds <number>")
    .option("--requires-login")
    .option("--no-requires-login")
    .option("--cacheable")
    .option("--no-cacheable")
    .option("--run-test")
    .option("--no-run-test")
    .option("--json")
    .action(async (mode: string, options) => {
      const normalizedMode = normalizeGuideMode(mode);

      if (normalizedMode === "inspect") {
        if (!options.url) {
          throw new FastBrowserError("FB_CLI_001", "guide inspect requires --url", "cli");
        }
        printOutput(await deps.router.guideInspect(options.url), options.json);
        return;
      }

      const normalizedOptions = normalizeGuideOptions(options);

      if (normalizedMode === "plan") {
        assertNonInteractiveGuideOptions("plan", normalizedOptions);
        printOutput(await deps.router.guidePlan(normalizedOptions), options.json);
        return;
      }

      assertNonInteractiveGuideOptions("scaffold", normalizedOptions);
      printOutput(await deps.router.guideScaffold(normalizedOptions), options.json);
    });
}

