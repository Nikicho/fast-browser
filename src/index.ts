import fs from "node:fs/promises";
import { spawn } from "node:child_process";

import { registerAuthCommands } from "./cli/commands/auth";
import { registerBrowserCommands } from "./cli/commands/browser";
import { registerCacheCommand } from "./cli/commands/cache";
import { registerCommandCommands } from "./cli/commands/command";
import { registerCaseCommands } from "./cli/commands/case";
import { registerFlowCommands } from "./cli/commands/flow";
import { registerGuideCommand } from "./cli/commands/guide";
import { registerHealthCommand } from "./cli/commands/health";
import { registerInfoCommand } from "./cli/commands/info";
import { registerListCommand } from "./cli/commands/list";
import { registerSessionCommands } from "./cli/commands/session";
import { registerSiteCommand } from "./cli/commands/site";
import { registerTestCommand } from "./cli/commands/test";
import { registerTraceCommands } from "./cli/commands/trace";
import { registerWorkspaceCommand } from "./cli/commands/workspace";
import { applyGlobalSessionIdArg, createProgram } from "./cli/parser";
import { MemoryLruTtlCache } from "./cache/memory-lru-ttl-cache";
import { createCaseService } from "./case/case-service";
import { createCommandDraftService } from "./command/command-draft-service";
import { createCommandMaterializeService } from "./command/command-materialize-service";
import { AdapterManager } from "./core/adapter-manager";
import { CommandRouter } from "./core/command-router";
import { AdapterRegistry } from "./core/adapter-registry";
import { createTracedRouter } from "./core/traced-router";
import { createFlowService } from "./flow/flow-service";
import { createGuideService } from "./guide/guide-service";
import { BrowserRuntimeFacade } from "./runtime/browser-runtime";
import { ExecutionTraceStore } from "./runtime/execution-trace";
import { FileSessionStore } from "./runtime/session-store";
import { getAppDir, getCacheFilePath, getExecutionTraceFilePath, getSessionFilePath } from "./shared/constants";
import { toErrorShape } from "./shared/errors";
import { createLogger } from "./shared/logger";

async function ensureRuntimeDirs(): Promise<void> {
  await fs.mkdir(getAppDir(), { recursive: true });
}

async function runShellCommand(command: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: process.cwd(), shell: true });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, output: output.trim() });
    });
  });
}

export async function main(argv = process.argv): Promise<void> {
  const normalizedArgv = applyGlobalSessionIdArg(argv);
  await ensureRuntimeDirs();
  const logger = createLogger(process.env.FAST_BROWSER_LOG_LEVEL === "debug" ? "debug" : "info");
  const runtime = new BrowserRuntimeFacade();
  const cache = new MemoryLruTtlCache({ filePath: getCacheFilePath() });
  const sessionStore = new FileSessionStore(getSessionFilePath());
  const registry = new AdapterRegistry(runtime);
  const traceStore = new ExecutionTraceStore(getExecutionTraceFilePath());
  const adapters = await registry.discover();
  const adapterDiagnostics = registry.getLoadDiagnostics();
  for (const diagnostic of adapterDiagnostics) {
    console.error(`[adapter:${diagnostic.stage}] ${diagnostic.adapterId}: ${diagnostic.message}`);
  }
  const manager = new AdapterManager({ adapters, cache, runtime, logger, sessionStore });
  const guideService = createGuideService({
    inspectSite: (url) => runtime.inspectSite(url),
    runSmokeTest: (command) => runShellCommand(command)
  });
  const builtinHandlers = {
    open: (url: string) => runtime.open(url),
    wait: (options: { ms?: number; text?: string; urlIncludes?: string; fn?: string }) => runtime.wait(options),
    waitForSelector: (selector: string, options: { timeoutMs?: number; state?: "attached" | "visible" | "hidden" }) => runtime.waitForSelector(selector, options),
    tabNew: (url?: string) => runtime.tabNew(url),
    tabSwitch: (target: string) => runtime.tabSwitch(target),
    click: (target: string, options?: { timeoutMs?: number }) => runtime.click(target, { timeoutMs: options?.timeoutMs }),
    fill: (target: string, text: string, options?: { timeoutMs?: number }) => runtime.fill(target, text, { timeoutMs: options?.timeoutMs }),
    press: (key: string, options?: { target?: string }) => runtime.press(key, options),
    getUrl: () => runtime.getUrl(),
    getTitle: () => runtime.getTitle(),
    getSnapshotText: async () => (await runtime.snapshot({ interactiveOnly: false, maxItems: 200 })).text,
    getSelectorCount: async (selector: string) => {
      const result = await runtime.evalExpression(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
      return typeof result.value === "number" ? result.value : Number(result.value ?? 0);
    },
    getElementText: async (selector: string) => {
      const result = await runtime.evalExpression(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); return (node?.innerText ?? node?.textContent ?? '').trim(); })()`);
      return typeof result.value === "string" ? result.value : String(result.value ?? "");
    },
    getStorageValue: async (kind: "localStorage" | "sessionStorage", key: string) => {
      const result = await runtime.storage(kind, "get", key) as { value?: unknown } | null;
      if (result?.value === null || result?.value === undefined) {
        return null;
      }
      return typeof result.value === "string" ? result.value : String(result.value);
    },
    getNetworkEntries: async () => (await runtime.networkEntries()).entries,
    getConsoleLogs: async () => (await runtime.consoleLogs()).logs,
    captureSnapshot: async () => runtime.snapshot({ interactiveOnly: false, maxItems: 100 }),
    captureScreenshot: async () => runtime.screenshot(undefined, { fullPage: true }),
    resetDiagnostics: async () => {
      await runtime.consoleLogs({ clear: true });
      await runtime.networkEntries({ clear: true });
    }
  };
  const flowService = createFlowService({
    executeSite: async (target, params) => {
      const [adapterId, commandName] = target.split("/");
      return manager.execute({ adapterId, commandName, params, output: "json", useCache: false });
    },
    builtinHandlers
  });
  const commandDraftService = createCommandDraftService();
  const commandMaterializeService = createCommandMaterializeService();
  const caseService = createCaseService({
    runFlow: (target, params, runOptions) => flowService.runFlow(target, params, runOptions),
    builtinHandlers
  });
  const router = new CommandRouter({
    adapterManager: manager,
    adapterRegistry: registry,
    cache,
    runtime,
    guideService,
    flowService,
    caseService,
    commandDraftService,
    commandMaterializeService,
    traceStore,
    sessionStore
  });
  const tracedRouter = createTracedRouter(router, traceStore);

  const program = createProgram();
  registerBrowserCommands(program, { router: tracedRouter });
  registerCaseCommands(program, { router: tracedRouter });
  registerCommandCommands(program, { router: tracedRouter });
  registerFlowCommands(program, { router: tracedRouter });
  registerSiteCommand(program, { router: tracedRouter });
  registerListCommand(program, { router: tracedRouter });
  registerAuthCommands(program, { router: tracedRouter });
  registerSessionCommands(program, { router: tracedRouter });
  registerInfoCommand(program, { router: tracedRouter });
  registerHealthCommand(program, { router: tracedRouter });
  registerCacheCommand(program, { router: tracedRouter });
  registerGuideCommand(program, { router: tracedRouter });
  registerTestCommand(program, { router: tracedRouter });
  registerTraceCommands(program, { router: tracedRouter });
  registerWorkspaceCommand(program, { router: tracedRouter });

  await program.parseAsync(normalizedArgv);
}
