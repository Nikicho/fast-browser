import { Command } from "commander";

import { FastBrowserError } from "../shared/errors";
import type { GuideAnswers } from "../shared/types";
import type { CommandRouter } from "../core/command-router";

export function parseSiteTarget(value: string): { adapterId: string; commandName: string } {
  const [adapterId, commandName] = value.split("/");
  return { adapterId, commandName };
}

export function parseValue(value: string): string | number | boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && value.trim() !== "") {
    return asNumber;
  }
  return value;
}

export function parseJsonInput(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Flow input must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new FastBrowserError("FB_CLI_001", `Invalid JSON input: ${(error as Error).message}`, "cli");
  }
}

export function collectUnknownOptions(args: string[]): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      params[key] = true;
      continue;
    }
    params[key] = parseValue(next);
    index += 1;
  }
  return params;
}

export function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.name("fast-browser").description("Fast-Browser CLI");
  return program;
}

export function applyGlobalSessionIdArg(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const normalized = [...argv];

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    if (current === "--session-id") {
      const value = normalized[index + 1];
      if (!value || value.startsWith("--")) {
        throw new FastBrowserError("FB_CLI_001", "Missing value for --session-id", "cli");
      }
      env.FAST_BROWSER_SESSION_ID = value;
      normalized.splice(index, 2);
      index -= 1;
      continue;
    }
    if (current.startsWith("--session-id=")) {
      const value = current.slice("--session-id=".length);
      if (!value.trim()) {
        throw new FastBrowserError("FB_CLI_001", "Missing value for --session-id", "cli");
      }
      env.FAST_BROWSER_SESSION_ID = value;
      normalized.splice(index, 1);
      index -= 1;
    }
  }

  return normalized;
}

export function formatOutput(payload: unknown, asJson: boolean): string {
  if (typeof payload === "string") {
    return payload;
  }
  const json = JSON.stringify(payload, null, 2);
  return asJson ? escapeNonAsciiJson(json) : json;
}

function escapeNonAsciiJson(value: string): string {
  return value.replace(/[\u0080-\uFFFF]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function printOutput(payload: unknown, asJson: boolean): void {
  console.log(formatOutput(payload, asJson));
}

export type CliDependencies = {
  router: CommandRouter;
};

export type GuideCommandOptions = Partial<GuideAnswers>;

