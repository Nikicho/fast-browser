import fs from "node:fs/promises";

import type { Command } from "commander";



import { printOutput } from "../parser";

import type { CliDependencies } from "../parser";
import type { BrowserActionResult } from "../../shared/types";

import { FastBrowserError } from "../../shared/errors";



const WAIT_FOR_SELECTOR_STATES = ["attached", "visible", "hidden"] as const;



type WaitForSelectorState = (typeof WAIT_FOR_SELECTOR_STATES)[number];



function resolveTargetInput(

  commandName: string,

  positionalTarget: string | undefined,

  optionTarget: string | undefined

): string {

  const target = optionTarget ?? positionalTarget;

  if (target && target.trim() !== "") {

    return target;

  }

  throw new FastBrowserError(

    "FB_CLI_001",

    `${commandName} target is required. On PowerShell, quote snapshot refs like \"@e1\" or use --target \"@e1\".`,

    "cli"

  );

}



function resolveScrollTarget(

  positionalTargetOrDirection: string | undefined,

  optionTarget: string | undefined

): string {

  return resolveTargetInput("scroll", positionalTargetOrDirection, optionTarget);

}



function resolveOptionalInput(

  commandName: string,

  positionalValue: string | undefined,

  optionValue: string | undefined

): string | undefined {

  if (positionalValue && optionValue && positionalValue !== optionValue) {

    throw new FastBrowserError(

      "FB_CLI_001",

      `${commandName} received conflicting targets. Use either the positional argument or the named option, not both.`,

      "cli"

    );

  }

  return optionValue ?? positionalValue;

}

async function resolveExpressionInput(
  positionalExpression: string | undefined,
  optionExpression: string | undefined,
  filePath: string | undefined
): Promise<string> {
  const provided = [
    positionalExpression !== undefined ? "positional" : null,
    optionExpression !== undefined ? "option" : null,
    filePath !== undefined ? "file" : null
  ].filter(Boolean);

  if (provided.length > 1) {
    throw new FastBrowserError(
      "FB_CLI_001",
      "eval accepts exactly one source: positional expression, --expr, or --file.",
      "cli"
    );
  }

  if (filePath) {
    const source = await fs.readFile(filePath, "utf8");
    if (!source.trim()) {
      throw new FastBrowserError("FB_CLI_001", "eval --file must not be empty", "cli");
    }
    return source;
  }

  const expression = optionExpression ?? positionalExpression;
  if (expression && expression.trim() !== "") {
    return expression;
  }

  throw new FastBrowserError(
    "FB_CLI_001",
    "eval expression is required. Use a positional expression, --expr, or --file.",
    "cli"
  );
}



function resolveLaunchOptions(options: { headed?: boolean; headless?: boolean }): { headless?: boolean } {

  if (options.headed && options.headless) {

    throw new Error("--headed and --headless cannot be used together");

  }

  if (options.headed) {

    return { headless: false };

  }

  if (options.headless) {

    return { headless: true };

  }

  return {};

}



function parseOptionalNumber(value: string | undefined, name: string, options: { integer?: boolean; min?: number } = {}): number | undefined {

  if (value === undefined) {

    return undefined;

  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {

    throw new FastBrowserError("FB_CLI_001", `${name} must be a valid number`, "cli");

  }

  if (options.integer && !Number.isInteger(parsed)) {

    throw new FastBrowserError("FB_CLI_001", `${name} must be an integer`, "cli");

  }

  if (options.min !== undefined && parsed < options.min) {

    throw new FastBrowserError("FB_CLI_001", `${name} must be greater than or equal to ${options.min}`, "cli");

  }

  return parsed;

}



function parseWaitForSelectorState(value: string | undefined): WaitForSelectorState | undefined {

  if (value === undefined) {

    return undefined;

  }

  if (WAIT_FOR_SELECTOR_STATES.includes(value as WaitForSelectorState)) {

    return value as WaitForSelectorState;

  }

  throw new FastBrowserError("FB_CLI_001", `waitForSelector --state must be one of: ${WAIT_FOR_SELECTOR_STATES.join(", ")}`, "cli");

}



function emitOpenProgress(message: string): void {

  console.error(`[open] ${message}`);

}



function formatOpenResult(result: BrowserActionResult): string {

  const lines = ["Open succeeded", `URL: ${result.url}`];

  if (result.title) {

    lines.push(`Title: ${result.title}`);

  }

  if (result.notice) {

    lines.push(`Notice: ${result.notice}`);

  }

  return lines.join("\n");

}

type BrowserScriptStep = {
  command: string;
  args?: unknown[];
};

async function runBrowserScript(router: CliDependencies["router"], filePath: string) {
  const definition = await loadBrowserScriptDefinition(filePath);
  const steps: Array<{ index: number; command: string; args: unknown[]; ok: boolean; result?: unknown; error?: string }> = [];

  for (const [index, step] of definition.steps.entries()) {
    const args = Array.isArray(step.args) ? step.args : [];
    try {
      const result = await executeBrowserScriptStep(router, step.command, args);
      steps.push({ index, command: step.command, args, ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ index, command: step.command, args, ok: false, error: message });
      if (!definition.continueOnError) {
        return { ok: false, path: filePath, continueOnError: false, failedStepIndex: index, steps };
      }
    }
  }

  return { ok: true, path: filePath, continueOnError: definition.continueOnError, steps };
}

async function loadBrowserScriptDefinition(filePath: string): Promise<{ continueOnError: boolean; steps: BrowserScriptStep[] }> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    return {
      continueOnError: false,
      steps: parsed.map((item) => normalizeBrowserScriptStep(item))
    };
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { steps?: unknown[] }).steps)) {
    throw new FastBrowserError("FB_CLI_001", "run-script expects a JSON file containing an array of steps or an object with steps.", "cli");
  }
  return {
    continueOnError: Boolean((parsed as { continueOnError?: boolean }).continueOnError),
    steps: ((parsed as { steps: unknown[] }).steps).map((item) => normalizeBrowserScriptStep(item))
  };
}

function normalizeBrowserScriptStep(value: unknown): BrowserScriptStep {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FastBrowserError("FB_CLI_001", "run-script step must be an object.", "cli");
  }
  const command = (value as { command?: unknown }).command;
  const args = (value as { args?: unknown }).args;
  if (typeof command !== "string" || command.trim() === "") {
    throw new FastBrowserError("FB_CLI_001", "run-script step.command is required.", "cli");
  }
  if (args !== undefined && !Array.isArray(args)) {
    throw new FastBrowserError("FB_CLI_001", `run-script step.args must be an array for command ${command}.`, "cli");
  }
  return { command, args: (args as unknown[] | undefined) ?? [] };
}

async function executeBrowserScriptStep(router: CliDependencies["router"], command: string, args: unknown[]): Promise<unknown> {
  switch (command) {
    case "open":
      return await router.open(requireStringArg(command, args[0], 0), asObjectArg(args[1]) as { headless?: boolean } | undefined ?? {});
    case "snapshot":
      return await router.snapshot(asObjectArg(args[0]) as { interactiveOnly?: boolean; selector?: string; maxItems?: number } | undefined ?? {});
    case "click":
      return await router.click(requireStringArg(command, args[0], 0), asObjectArg(args[1]) as { timeoutMs?: number } | undefined ?? {});
    case "type":
      return await router.type(requireStringArg(command, args[0], 0), requireStringArg(command, args[1], 1), asObjectArg(args[2]) as { delayMs?: number } | undefined ?? {});
    case "fill":
      return await router.fill(requireStringArg(command, args[0], 0), requireStringArg(command, args[1], 1), asObjectArg(args[2]) as { timeoutMs?: number } | undefined ?? {});
    case "press":
      return await router.press(requireStringArg(command, args[0], 0), asObjectArg(args[1]) as { target?: string } | undefined ?? {});
    case "hover":
      return await router.hover(requireStringArg(command, args[0], 0), asObjectArg(args[1]) as { timeoutMs?: number } | undefined ?? {});
    case "scroll":
      return await router.scroll(requireStringArg(command, args[0], 0), typeof args[1] === "number" ? args[1] : undefined);
    case "screenshot":
      return await router.screenshot(typeof args[0] === "string" ? args[0] : undefined, asObjectArg(args[1]) as { fullPage?: boolean } | undefined ?? {});
    case "eval":
      return await router.evalExpression(requireStringArg(command, args[0], 0));
    case "goback":
    case "goBack":
      return await router.goBack();
    case "goforward":
    case "goForward":
      return await router.goForward();
    case "reload":
      return await router.reload();
    case "getUrl":
      return await router.getUrl();
    case "getTitle":
      return await router.getTitle();
    case "wait":
      return await router.wait(asObjectArg(args[0]) as { ms?: number; text?: string; urlIncludes?: string; fn?: string } | undefined ?? {});
    case "waitForSelector":
      return await router.waitForSelector(requireStringArg(command, args[0], 0), asObjectArg(args[1]) as { timeoutMs?: number; state?: "attached" | "visible" | "hidden" } | undefined ?? {});
    case "site":
      return await router.site(
        requireStringArg(command, args[0], 0),
        asObjectArg(args[1]) ?? {},
        args[2] === "text" ? "text" : "json",
        args[3] === undefined ? false : Boolean(args[3])
      );
    case "tab.list":
      return await router.tabList();
    case "tab.new":
      return await router.tabNew(typeof args[0] === "string" ? args[0] : undefined);
    case "tab.switch":
      return await router.tabSwitch(requireStringArg(command, args[0], 0));
    case "tab.close":
      return await router.tabClose(typeof args[0] === "string" ? args[0] : undefined);
    default:
      throw new FastBrowserError("FB_CLI_001", `Unsupported run-script command: ${command}`, "cli");
  }
}

function requireStringArg(command: string, value: unknown, index: number): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  throw new FastBrowserError("FB_CLI_001", `run-script command ${command} requires args[${index}] to be a non-empty string.`, "cli");
}

function asObjectArg(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new FastBrowserError("FB_CLI_001", "run-script object argument must be a JSON object.", "cli");
}



export function registerBrowserCommands(program: Command, deps: CliDependencies): void {

  program.command("open").argument("<url>").option("--headed").option("--headless").option("--json").action(async (url: string, options) => {

    const launchOptions = resolveLaunchOptions(options);

    emitOpenProgress("starting");

    const result = await deps.router.open(url, {

      ...launchOptions,

      onProgress: emitOpenProgress

    });

    if (options.json) {

      printOutput(result, true);

      return;

    }

    console.log(formatOpenResult(result));

  });



  const browser = program.command("browser");

  browser.command("status").option("--json").action(async (options) => {

    printOutput(await deps.router.browserStatus(), options.json);

  });

  browser.command("close").option("--json").action(async (options) => {

    printOutput(await deps.router.browserClose(), options.json);

  });



  program.command("snapshot").option("-i, --interactive-only").option("--selector <selector>").option("--max-items <number>").option("--json").action(async (options) => {

    printOutput(await deps.router.snapshot({

      interactiveOnly: options.interactiveOnly,

      selector: options.selector,

      maxItems: parseOptionalNumber(options.maxItems, "snapshot --max-items", { integer: true, min: 1 })

    }), options.json);

  });



  program.command("click").argument("[target]").option("--target <target>").option("--timeout <ms>").option("--json").action(async (target: string | undefined, options) => {

    printOutput(await deps.router.click(resolveTargetInput("click", target, options.target), { timeoutMs: parseOptionalNumber(options.timeout, "click --timeout", { min: 0 }) }), options.json);

  });



  program.command("type").argument("[target]").argument("<text>").option("--target <target>").option("--delay <ms>").option("--json").action(async (target: string | undefined, text: string, options) => {

    printOutput(await deps.router.type(resolveTargetInput("type", target, options.target), text, { delayMs: parseOptionalNumber(options.delay, "type --delay", { min: 0 }) }), options.json);

  });



  program.command("fill").argument("[target]").argument("<text>").option("--target <target>").option("--timeout <ms>").option("--json").action(async (target: string | undefined, text: string, options) => {

    printOutput(await deps.router.fill(resolveTargetInput("fill", target, options.target), text, { timeoutMs: parseOptionalNumber(options.timeout, "fill --timeout", { min: 0 }) }), options.json);

  });



  program.command("press").argument("<key>").option("--target <target>").option("--json").action(async (key: string, options) => {

    printOutput(await deps.router.press(key, { target: options.target }), options.json);

  });



  program.command("hover").argument("[target]").option("--target <target>").option("--timeout <ms>").option("--json").action(async (target: string | undefined, options) => {

    printOutput(await deps.router.hover(resolveTargetInput("hover", target, options.target), { timeoutMs: parseOptionalNumber(options.timeout, "hover --timeout", { min: 0 }) }), options.json);

  });



  program.command("scroll").argument("[targetOrDirection]").argument("[amount]").option("--target <target>").option("--json").action(async (targetOrDirection: string | undefined, amount: string | undefined, options) => {

    printOutput(await deps.router.scroll(resolveScrollTarget(targetOrDirection, options.target), parseOptionalNumber(amount, "scroll [amount]")), options.json);

  });



  program.command("screenshot").argument("[path]").option("--full-page").option("--json").action(async (filePath: string | undefined, options) => {

    printOutput(await deps.router.screenshot(filePath, { fullPage: options.fullPage }), options.json);

  });



  program.command("eval").argument("[expression]").option("--expr <expression>").option("--file <path>").option("--json").action(async (expression: string | undefined, options) => {

    printOutput(await deps.router.evalExpression(await resolveExpressionInput(expression, options.expr, options.file)), options.json);

  });

  program.command("run-script").argument("<path>").option("--json").action(async (filePath: string, options) => {

    printOutput(await runBrowserScript(deps.router, filePath), options.json);

  });



  program.command("goback").option("--json").action(async (options) => { printOutput(await deps.router.goBack(), options.json); });

  program.command("goforward").option("--json").action(async (options) => { printOutput(await deps.router.goForward(), options.json); });

  program.command("reload").option("--json").action(async (options) => { printOutput(await deps.router.reload(), options.json); });

  program.command("getUrl").option("--json").action(async (options) => { printOutput(await deps.router.getUrl(), options.json); });

  program.command("getTitle").option("--json").action(async (options) => { printOutput(await deps.router.getTitle(), options.json); });



  program.command("wait").argument("[ms]").option("--text <text>").option("--url <substring>").option("--fn <expression>").option("--json").action(async (ms: string | undefined, options) => {

    printOutput(await deps.router.wait({ ms: parseOptionalNumber(ms, "wait [ms]", { min: 0 }), text: options.text, urlIncludes: options.url, fn: options.fn }), options.json);

  });



  program.command("waitForSelector").argument("<selector>").option("--state <state>").option("--timeout <ms>").option("--json").action(async (selector: string, options) => {

    printOutput(await deps.router.waitForSelector(selector, {

      state: parseWaitForSelectorState(options.state),

      timeoutMs: parseOptionalNumber(options.timeout, "waitForSelector --timeout", { min: 0 })

    }), options.json);

  });



  program.command("gate").option("--text <text>").option("--json").action(async (options) => {

    printOutput(await deps.router.gate({ text: options.text }), options.json);

  });



  program.command("collect").argument("<selector>").option("--limit <number>").option("--scroll-step <number>").option("--max-rounds <number>").option("--json").action(async (selector: string, options) => {

    printOutput(await deps.router.collect(selector, {

      limit: parseOptionalNumber(options.limit, "collect --limit", { integer: true, min: 1 }),

      scrollStep: parseOptionalNumber(options.scrollStep, "collect --scroll-step", { min: 1 }),

      maxRounds: parseOptionalNumber(options.maxRounds, "collect --max-rounds", { integer: true, min: 1 })

    }), options.json);

  });



  program.command("extract-blocks").option("--selector <selector>").option("--limit <number>").option("--json").action(async (options) => {

    printOutput(await deps.router.extractBlocks({

      selector: options.selector,

      limit: parseOptionalNumber(options.limit, "extract-blocks --limit", { integer: true, min: 1 })

    }), options.json);

  });



  const tab = program.command("tab");

  tab.command("list").option("--json").action(async (options) => {

    printOutput(await deps.router.tabList(), options.json);

  });

  tab.command("new").argument("[url]").option("--url <url>").option("--json").action(async (url: string | undefined, options) => {

    printOutput(await deps.router.tabNew(resolveOptionalInput("tab new", url, options.url)), options.json);

  });

  tab.command("switch").argument("[target]").option("--id <id>").option("--json").action(async (target: string | undefined, options) => {

    printOutput(await deps.router.tabSwitch(resolveTargetInput("tab switch", undefined, resolveOptionalInput("tab switch", target, options.id))), options.json);

  });

  tab.command("close").argument("[target]").option("--id <id>").option("--json").action(async (target: string | undefined, options) => {

    printOutput(await deps.router.tabClose(resolveOptionalInput("tab close", target, options.id)), options.json);

  });



  program.command("console").option("--type <type>").option("--text <substring>").option("--clear").option("--json").action(async (options) => {

    printOutput(await deps.router.consoleLogs({ clear: options.clear, type: options.type, text: options.text }), options.json);

  });



  program.command("network").option("--url <substring>").option("--method <method>").option("--status <code>").option("--resource-type <type>").option("--clear").option("--json").action(async (options) => {

    printOutput(await deps.router.networkEntries({

      clear: options.clear,

      urlIncludes: options.url,

      method: options.method,

      status: parseOptionalNumber(options.status, "network --status", { integer: true, min: 0 }),

      resourceType: options.resourceType

    }), options.json);

  });



  program.command("cookies").argument("[action]").option("--name <name>").option("--value <value>").option("--url <url>").option("--json").action(async (action: "list" | "set" | "clear" | undefined, options) => {

    printOutput(await deps.router.cookies(action ?? "list", { name: options.name, value: options.value, url: options.url }), options.json);

  });



  program.command("localStorage").argument("[action]").argument("[key]").argument("[value]").option("--json").action(async (action: "list" | "get" | "set" | "remove" | "clear" | undefined, key: string | undefined, value: string | undefined, options) => {

    printOutput(await deps.router.storage("localStorage", action ?? "list", key, value), options.json);

  });



  program.command("sessionStorage").argument("[action]").argument("[key]").argument("[value]").option("--json").action(async (action: "list" | "get" | "set" | "remove" | "clear" | undefined, key: string | undefined, value: string | undefined, options) => {

    printOutput(await deps.router.storage("sessionStorage", action ?? "list", key, value), options.json);

  });



  program.command("performance").option("--json").action(async (options) => {

    printOutput(await deps.router.performanceMetrics(), options.json);

  });

}





