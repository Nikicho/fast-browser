import fs from "node:fs/promises";
import path from "node:path";

import { getCustomAdaptersDir } from "../shared/constants";
import { FastBrowserError } from "../shared/errors";
import type { AdapterArg, BrowserRuntimeInspectResult, GuideAnswers, GuidePlan, GuideScaffoldResult } from "../shared/types";
import { chooseStrategy } from "./steps/choose-strategy";
import { enrichInspection } from "./steps/enrich-inspection";
import { collectMeta } from "./steps/collect-meta";
import { scaffoldFiles } from "./steps/scaffold-files";
import { runSmokeTestCommand } from "./steps/run-smoke-test";

interface SmokeTestResult {
  ok: boolean;
  output?: string;
}

interface GuideServiceOptions {
  prompt?: (initial?: Partial<GuideAnswers>) => Promise<GuideAnswers>;
  inspectSite?: (url: string) => Promise<BrowserRuntimeInspectResult>;
  writeFile?: (filePath: string, content: string) => Promise<void>;
  adaptersDir?: string;
  runSmokeTest?: (command: string) => Promise<SmokeTestResult>;
}

const GUIDE_STRATEGIES = ["auto", "network", "dom"] as const;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function isCompleteAnswers(initial: Partial<GuideAnswers>): initial is GuideAnswers {
  return Boolean(
    initial.platform &&
      initial.url &&
      initial.capability &&
      typeof initial.requiresLogin === "boolean" &&
      initial.strategy &&
      initial.commandName &&
      typeof initial.cacheable === "boolean" &&
      typeof initial.ttlSeconds === "number" &&
      typeof initial.runTest === "boolean"
  );
}

async function resolveAnswers(prompt: (initial?: Partial<GuideAnswers>) => Promise<GuideAnswers>, initial: Partial<GuideAnswers>): Promise<GuideAnswers> {
  return isCompleteAnswers(initial) ? initial : prompt(initial);
}

function validateIdentifier(name: string, value: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new FastBrowserError("FB_GUIDE_001", `${name} must use only letters, numbers, underscore, or hyphen`, "guide");
  }
}

function validateAnswers(answers: GuideAnswers): void {
  if (!answers.platform.trim()) {
    throw new FastBrowserError("FB_GUIDE_001", "Guide platform is required", "guide");
  }
  if (!answers.commandName.trim()) {
    throw new FastBrowserError("FB_GUIDE_001", "Guide commandName is required", "guide");
  }
  if (!answers.capability.trim()) {
    throw new FastBrowserError("FB_GUIDE_001", "Guide capability is required", "guide");
  }
  validateIdentifier("Guide platform", answers.platform);
  validateIdentifier("Guide commandName", answers.commandName);

  try {
    new URL(answers.url);
  } catch {
    throw new FastBrowserError("FB_GUIDE_001", "Guide url must be a valid URL", "guide");
  }

  if (!GUIDE_STRATEGIES.includes(answers.strategy)) {
    throw new FastBrowserError("FB_GUIDE_001", `Guide strategy must be one of: ${GUIDE_STRATEGIES.join(", ")}`, "guide");
  }
  if (!Number.isInteger(answers.ttlSeconds) || answers.ttlSeconds <= 0) {
    throw new FastBrowserError("FB_GUIDE_001", "Guide ttlSeconds must be a positive integer", "guide");
  }
}

export function createGuideService(options: GuideServiceOptions) {
  const prompt = options.prompt ?? collectMeta;
  const inspect = options.inspectSite ?? (async () => ({
    suggestedEndpoints: [],
    resourceUrls: [],
    interactiveSelectors: [],
    formSelectors: [],
    notes: []
  }));
  const writeFile = options.writeFile ?? defaultWriteFile;
  const adaptersDir = options.adaptersDir ?? getCustomAdaptersDir();
  const runSmokeTest = options.runSmokeTest;

  return {
    async inspect(url: string): Promise<BrowserRuntimeInspectResult> {
      return enrichInspection(await inspect(url));
    },

    async plan(initial: Partial<GuideAnswers> = {}): Promise<GuidePlan> {
      const answers = await resolveAnswers(prompt, initial);
      validateAnswers(answers);
      const inspection = enrichInspection(await inspect(answers.url));
      const strategy = chooseStrategy(answers, inspection);
      const commandArgs = resolveCommandArgs(strategy.source, inspection.suggestedArgs);
      const manifest = {
        id: answers.platform,
        displayName: answers.platform,
        version: "0.1.0",
        platform: answers.platform,
        description: answers.capability,
        homepage: answers.url,
        defaultTtlMs: answers.ttlSeconds * 1000,
        sessionPolicy: answers.requiresLogin ? ("required" as const) : ("none" as const),
        commands: [
          {
            name: answers.commandName,
            description: answers.capability,
            args: commandArgs,
            example: runSmokeTestCommand(answers.platform, answers.commandName),
            cacheable: answers.cacheable
          }
        ]
      };
      const sourceFiles = scaffoldFiles(manifest, answers.commandName, strategy.endpoint, commandArgs, inspection);

      return {
        platform: answers.platform,
        files: Object.keys(sourceFiles),
        testCommand: runSmokeTestCommand(answers.platform, answers.commandName),
        strategy,
        manifest,
        sourceFiles,
        inspection
      };
    },

    async scaffold(initial: Partial<GuideAnswers> = {}): Promise<GuideScaffoldResult> {
      const answers = await resolveAnswers(prompt, initial);
      validateAnswers(answers);
      const plan = await this.plan(answers);
      const adapterRootDir = path.join(adaptersDir, plan.platform);
      const workspaceRoot = path.dirname(path.dirname(adaptersDir));
      if (await pathExists(adapterRootDir)) {
        throw new FastBrowserError("FB_GUIDE_001", `Adapter ${plan.platform} already exists at ${adapterRootDir}`, "guide");
      }

      for (const [relativePath, content] of Object.entries(plan.sourceFiles)) {
        await writeFile(path.join(workspaceRoot, relativePath), content);
      }

      const smokeTest = answers.runTest
        ? runSmokeTest
          ? await runSmokeTest(plan.testCommand)
          : { ok: false, output: "Smoke test runner not configured" }
        : undefined;

      return {
        ...plan,
        rootDir: adapterRootDir,
        smokeTest
      };
    }
  };
}

function resolveCommandArgs(strategySource: "network" | "dom", suggestedArgs: AdapterArg[] | undefined): AdapterArg[] {
  if (suggestedArgs && suggestedArgs.length > 0) {
    return suggestedArgs;
  }
  if (strategySource === "dom") {
    return [{ name: "url", type: "string", required: false, description: "Optional override URL." }];
  }
  return [];
}

async function defaultWriteFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export type ReturnTypeGuideService = ReturnType<typeof createGuideService>;
