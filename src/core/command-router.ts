import crypto from "node:crypto";

import type {
  BrowserConsoleEntry,
  BrowserNetworkEntry,
  CacheStore,
  CaseDefinition,
  ExecutionTraceCurrentStep,
  ExecutionTraceCurrentResult,
  ExecutionTraceLatestResult,
  ExecutionTraceMarker,
  FlowDefinition,
  FlowAssertion,
  FlowInteractionTarget,
  GuideAnswers,
  OutputMode,
  SessionStore,
  SiteRequest,
  TraceCurrentSaveContext
} from "../shared/types";
import type { BrowserLaunchOptions, BrowserRuntime } from "../shared/types";
import { getBrowserSessionMetaStateFilePath, getBrowserSessionProfileDir, getWorkspaceInfo } from "../shared/constants";
import { inferSessionIsolation } from "../shared/session-isolation";
import { buildCommandDraftFromTrace } from "../command/trace-to-command-draft";
import { distillCurrentTraceSegment } from "./trace-distill";
import { FastBrowserError, withErrorDetails } from "../shared/errors";
import { withTracePath } from "../shared/run-diagnostics";
import type { ReturnTypeGuideService } from "../guide/guide-service";
import type { createCaseService } from "../case/case-service";
import type { createCommandDraftService } from "../command/command-draft-service";
import type { createCommandMaterializeService } from "../command/command-materialize-service";
import type { createFlowService } from "../flow/flow-service";
import type { ExecutionTraceStore } from "../runtime/execution-trace";
import type { AdapterManager } from "./adapter-manager";
import type { AdapterRegistry } from "./adapter-registry";

const TRACE_SAVE_CONTEXT_NAMESPACE = "trace.lastCurrent";
const TRACE_SAVE_CONTEXT_MAX_AGE_MS = 30 * 60 * 1000;

interface RouterOptions {
  adapterManager: AdapterManager;
  adapterRegistry: AdapterRegistry;
  cache: CacheStore;
  runtime: BrowserRuntime;
  guideService: ReturnTypeGuideService;
  flowService: ReturnType<typeof createFlowService>;
  caseService?: ReturnType<typeof createCaseService>;
  commandDraftService?: ReturnType<typeof createCommandDraftService>;
  commandMaterializeService?: ReturnType<typeof createCommandMaterializeService>;
  traceStore: ExecutionTraceStore;
  sessionStore?: SessionStore;
}

export class CommandRouter {
  constructor(private readonly options: RouterOptions) {}

  async site(target: string, params: Record<string, unknown>, output: OutputMode, useCache: boolean) {
    const [adapterId, commandName] = target.split("/");
    const request: SiteRequest = { adapterId, commandName, params, output, useCache };
    return this.options.adapterManager.execute(request);
  }

  async list() {
    return this.options.adapterManager.listAdapters().map((adapter) => ({
      id: adapter.manifest.id,
      description: adapter.manifest.description,
      commands: adapter.manifest.commands.map((command) => command.name)
    }));
  }

  async info(target: string) {
    const [adapterId, commandName] = target.split("/");
    const adapter = this.options.adapterManager.getAdapter(adapterId);
    if (!adapter) {
      return null;
    }
    if (!commandName) {
      return adapter.manifest;
    }
    const command = adapter.manifest.commands.find((item) => item.name === commandName);
    if (!command) {
      return null;
    }
    return {
      adapterId: adapter.manifest.id,
      displayName: adapter.manifest.displayName,
      platform: adapter.manifest.platform,
      command
    };
  }

  async health(adapterId?: string) {
    return {
      runtime: await this.options.runtime.healthCheck(),
      adapters: await this.options.adapterManager.health(adapterId)
    };
  }

  async workspace() {
    const info = getWorkspaceInfo();
    const isolation = inferSessionIsolation(info.sessionId);
    const base = {
      ...info,
      browserProfileDir: isolation.mode === "session-clone"
        ? getBrowserSessionProfileDir(info.globalAppDir, info.sessionId)
        : info.browserProfileDir,
      browserStateFilePath: isolation.mode === "session-clone"
        ? getBrowserSessionMetaStateFilePath(info.globalAppDir, info.sessionId)
        : info.browserStateFilePath,
      browserProfileKind: isolation.mode === "session-clone" ? "session-clone" : "base",
      browserIsolationMode: isolation.mode,
      sessionIdentitySource: isolation.source,
      sessionIdentityReliable: isolation.reliable,
      notice: isolation.notice
    };
    try {
      const status = await this.options.runtime.browserStatus();
      return {
        ...base,
        ...(status.pinned ? { browserPinned: true } : {}),
        ...(status.pinnedAt ? { browserPinnedAt: status.pinnedAt } : {})
      };
    } catch {
      return base;
    }
  }

  async cacheStats() {
    return this.options.cache.stats();
  }

  async cacheClear(options: { adapterId?: string; all?: boolean }) {
    if (options.all) {
      await this.options.cache.clear();
      return { cleared: "all" };
    }
    if (options.adapterId) {
      const namespace = `fast-browser:${options.adapterId}:`;
      await this.options.cache.clear(namespace);
      return { cleared: options.adapterId };
    }
    return { cleared: "none" };
  }

  async guideInspect(url: string) {
    const inspection = await this.options.guideService.inspect(url);
    return {
      url,
      recommendedStrategy: inspection.suggestedEndpoints.length > 0 ? "network" : "dom",
      inspection
    };
  }

  async guidePlan(initial: Partial<GuideAnswers>) {
    return this.options.guideService.plan(initial);
  }

  async guideScaffold(initial: Partial<GuideAnswers>) {
    return this.options.guideService.scaffold(initial);
  }

  async guide(initial: Partial<GuideAnswers>) {
    return this.guideScaffold(initial);
  }

  async test(adapterId: string, commandName?: string) {
    const adapter = this.options.adapterManager.getAdapter(adapterId);
    if (!adapter) {
      return null;
    }
    if (!commandName) {
      return { adapterId, ok: true, commands: adapter.manifest.commands.map((command) => command.name) };
    }
    const command = adapter.manifest.commands.find((item) => item.name === commandName);
    if (!command) {
      return { adapterId, ok: false, error: `Command ${commandName} not found` };
    }
    const params = Object.fromEntries(command.args.map((arg) => [arg.name, arg.defaultValue ?? (arg.type === "number" ? 1 : arg.type === "boolean" ? true : "test")]));
    return this.options.adapterManager.execute({ adapterId, commandName, params, output: "json", useCache: false });
  }

  async flowSave(site: string, source: string | FlowDefinition) {
    await this.assertTraceSaveContext("flow");
    return this.options.flowService.saveFlow(site, source);
  }

  async flowSaveFromTrace(site: string, options: { id: string; goal: string }) {
    await this.assertTraceSaveContext("flow");
    const current = await this.getSuccessfulCurrentTrace();
    const definition = buildFlowDefinitionFromTrace(site, options.id, options.goal, current.entries);
    return this.options.flowService.saveFlow(site, definition);
  }

  async flowList(site?: string) {
    return this.options.flowService.listFlows(site);
  }

  async flowRun(target: string, input?: Record<string, unknown>) {
    try {
      return await this.options.flowService.runFlow(target, input ?? {});
    } catch (error) {
      throw this.attachTraceToRunError(error);
    }
  }

  async caseSave(site: string, source: string | CaseDefinition) {
    await this.assertTraceSaveContext("case");
    return this.getCaseService().saveCase(site, source);
  }

  async caseSaveFromFlow(
    site: string,
    options: { id: string; goal: string; flowId: string; urlIncludes?: string; textIncludes?: string; selectorVisible?: string; titleNotEmpty?: boolean }
  ) {
    await this.assertTraceSaveContext("case");
    return this.getCaseService().saveCase(site, buildCaseDefinitionFromFlow(options));
  }

  async caseList(site?: string) {
    return this.getCaseService().listCases(site);
  }

  async caseRun(target: string, input?: Record<string, unknown>) {
    try {
      return await this.getCaseService().runCase(target, input ?? {});
    } catch (error) {
      throw this.attachTraceToRunError(error);
    }
  }

  async commandSaveFromTrace(site: string, options: { id: string; goal: string }) {
    await this.assertTraceSaveContext("command");
    const current = await this.getSuccessfulCurrentTrace();
    const definition = buildCommandDraftFromTrace(site, options.id, options.goal, current);
    return this.getCommandDraftService().saveCommandDraft(site, definition);
  }

  async commandMaterialize(draftPath: string) {
    return this.getCommandMaterializeService().materializeDraft(draftPath);
  }

  async traceLatest(limit = 20): Promise<ExecutionTraceLatestResult> {
    return {
      path: this.options.traceStore.getPath(),
      entries: await this.options.traceStore.latest(limit)
    };
  }

  async traceMark(type: ExecutionTraceMarker["type"], label: string, data?: Record<string, unknown>) {
    const marker: ExecutionTraceMarker = { type, label, ...(data ? { data } : {}) };
    const entry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      kind: "marker" as const,
      command: "trace.mark",
      input: [marker],
      ok: true,
      durationMs: 0,
      marker
    };
    await this.options.traceStore.append(entry);
    return { ok: true, marker, entry };
  }

  async traceCurrent(): Promise<ExecutionTraceCurrentResult> {
    const current = await this.options.traceStore.current();
    const result = {
      path: this.options.traceStore.getPath(),
      ...distillCurrentTraceSegment(current)
    };
    await this.persistTraceSaveContext(result);
    return result;
  }

  async open(url: string, options?: BrowserLaunchOptions) { return this.options.runtime.open(url, options); }
  async browserStatus() { return this.options.runtime.browserStatus(); }
  async browserClose() { return this.options.runtime.browserClose(); }
  async authSync() { return this.options.runtime.authSync(); }
  async sessionPin() { return this.options.runtime.sessionPin(); }
  async sessionUnpin() { return this.options.runtime.sessionUnpin(); }
  async sessionStatus() { return this.options.runtime.sessionStatus(); }
  async sessionList() { return this.options.runtime.sessionList(); }
  async sessionCleanup(options: { maxAgeHours?: number } = {}) { return this.options.runtime.sessionCleanup(options); }
  async snapshot(options: { interactiveOnly?: boolean; selector?: string; maxItems?: number }) { return this.options.runtime.snapshot(options); }
  async click(target: string, options?: { timeoutMs?: number }) { return this.options.runtime.click(target, options); }
  async type(target: string, text: string, options?: { delayMs?: number }) { return this.options.runtime.type(target, text, options); }
  async fill(target: string, text: string, options?: { timeoutMs?: number }) { return this.options.runtime.fill(target, text, options); }
  async press(key: string, options?: { target?: string }) { return this.options.runtime.press(key, options); }
  async hover(target: string, options?: { timeoutMs?: number }) { return this.options.runtime.hover(target, options); }
  async scroll(targetOrDirection: string, amount?: number) { return this.options.runtime.scroll(targetOrDirection, amount); }
  async screenshot(filePath?: string, options?: { fullPage?: boolean }) { return this.options.runtime.screenshot(filePath, options); }
  async evalExpression(expression: string) { return this.options.runtime.evalExpression(expression); }
  async goBack() { return this.options.runtime.goBack(); }
  async goForward() { return this.options.runtime.goForward(); }
  async reload() { return this.options.runtime.reload(); }
  async getUrl() { return this.options.runtime.getUrl(); }
  async getTitle() { return this.options.runtime.getTitle(); }
  async wait(options: { ms?: number; text?: string; urlIncludes?: string; fn?: string }) { return this.options.runtime.wait(options); }
  async waitForSelector(selector: string, options?: { timeoutMs?: number; state?: "attached" | "visible" | "hidden" }) { return this.options.runtime.waitForSelector(selector, options); }
  async gate(options?: { text?: string }) { return this.options.runtime.handleGate(options); }
  async collect(selector: string, options?: { limit?: number; scrollStep?: number; maxRounds?: number }) { return this.options.runtime.collect(selector, options); }
  async extractBlocks(options?: { selector?: string; limit?: number }) { return this.options.runtime.extractBlocks(options); }
  async tabList() { return this.options.runtime.tabList(); }
  async tabNew(url?: string) { return this.options.runtime.tabNew(url); }
  async tabSwitch(target: string) { return this.options.runtime.tabSwitch(target); }
  async tabClose(target?: string) { return this.options.runtime.tabClose(target); }
  async consoleLogs(options?: { clear?: boolean; type?: string; text?: string }) {
    const result = await this.options.runtime.consoleLogs({ clear: options?.clear });
    return {
      logs: filterConsoleLogs(result.logs, options)
    };
  }
  async networkEntries(options?: { clear?: boolean; urlIncludes?: string; method?: string; status?: number; resourceType?: string }) {
    const result = await this.options.runtime.networkEntries({ clear: options?.clear });
    return {
      entries: filterNetworkEntries(result.entries, options)
    };
  }
  async cookies(action?: "list" | "set" | "clear", options?: { name?: string; value?: string; url?: string }) { return this.options.runtime.cookies(action, options); }
  async storage(kind: "localStorage" | "sessionStorage", action?: "list" | "get" | "set" | "remove" | "clear", key?: string, value?: string) { return this.options.runtime.storage(kind, action, key, value); }
  async performanceMetrics() { return this.options.runtime.performanceMetrics(); }

  private async persistTraceSaveContext(result: ExecutionTraceCurrentResult): Promise<void> {
    if (!this.options.sessionStore) {
      return;
    }

    const context: TraceCurrentSaveContext = {
      at: new Date().toISOString(),
      path: result.path,
      status: result.status,
      rawEntryCount: result.rawEntryCount,
      ...(result.startMarker ? { startMarkerId: result.startMarker.id } : {}),
      ...(result.endMarker ? { endMarkerId: result.endMarker.id } : {})
    };
    await this.options.sessionStore.set(TRACE_SAVE_CONTEXT_NAMESPACE, context);
  }

  private async getSuccessfulCurrentTrace(): Promise<ExecutionTraceCurrentResult> {
    const current = {
      path: this.options.traceStore.getPath(),
      ...distillCurrentTraceSegment(await this.options.traceStore.current())
    };
    if (current.status !== "success") {
      throw new FastBrowserError("FB_FLOW_001", "Latest trace current must be successful before generating a flow draft.", "flow");
    }
    return current;
  }

  private attachTraceToRunError(error: unknown): unknown {
    if (!(error instanceof FastBrowserError) || (error.stage !== "flow" && error.stage !== "case")) {
      return error;
    }
    const currentDetails = error.details && typeof error.details === "object"
      ? error.details as Record<string, unknown>
      : {};
    const currentDiagnostics = currentDetails.diagnostics && typeof currentDetails.diagnostics === "object"
      ? currentDetails.diagnostics as Parameters<typeof withTracePath>[0]
      : undefined;
    return withErrorDetails(error, {
      ...currentDetails,
      diagnostics: withTracePath(currentDiagnostics, this.options.traceStore.getPath())
    });
  }

  private async assertTraceSaveContext(stage: "command" | "flow" | "case"): Promise<void> {
    if (!this.options.sessionStore) {
      return;
    }

    const context = await this.options.sessionStore.get<TraceCurrentSaveContext>(TRACE_SAVE_CONTEXT_NAMESPACE);
    if (!context) {
      throw new FastBrowserError(
        stage === "flow" ? "FB_FLOW_001" : stage === "case" ? "FB_CASE_001" : "FB_COMMAND_001",
        `Run fast-browser trace current --json after a successful goal before saving ${stage}.`,
        stage
      );
    }

    if (context.status !== "success") {
      throw new FastBrowserError(
        stage === "flow" ? "FB_FLOW_001" : stage === "case" ? "FB_CASE_001" : "FB_COMMAND_001",
        `Latest trace current is ${context.status}; only successful traces can be saved as ${stage}.`,
        stage
      );
    }

    const ageMs = Date.now() - Date.parse(context.at);
    if (!Number.isFinite(ageMs) || ageMs > TRACE_SAVE_CONTEXT_MAX_AGE_MS) {
      throw new FastBrowserError(
        stage === "flow" ? "FB_FLOW_001" : stage === "case" ? "FB_CASE_001" : "FB_COMMAND_001",
        `Latest trace current is stale; rerun fast-browser trace current --json before saving ${stage}.`,
        stage
      );
    }
  }
  private getCaseService() {
    if (!this.options.caseService) {
      throw new FastBrowserError("FB_CASE_001", "Case service is not configured", "case");
    }
    return this.options.caseService;
  }

  private getCommandDraftService() {
    if (!this.options.commandDraftService) {
      throw new FastBrowserError("FB_COMMAND_001", "Command draft service is not configured", "command");
    }
    return this.options.commandDraftService;
  }

  private getCommandMaterializeService() {
    if (!this.options.commandMaterializeService) {
      throw new FastBrowserError("FB_COMMAND_001", "Command materialize service is not configured", "command");
    }
    return this.options.commandMaterializeService;
  }
}

function filterConsoleLogs(logs: BrowserConsoleEntry[], options?: { type?: string; text?: string }): BrowserConsoleEntry[] {
  return logs.filter((entry) => {
    const typeMatches = !options?.type || entry.type.toLowerCase() === options.type.toLowerCase();
    const textMatches = !options?.text || entry.text.includes(options.text);
    return typeMatches && textMatches;
  });
}

function filterNetworkEntries(entries: BrowserNetworkEntry[], options?: { urlIncludes?: string; method?: string; status?: number; resourceType?: string }): BrowserNetworkEntry[] {
  return entries.filter((entry) => {
    const urlMatches = !options?.urlIncludes || entry.url.includes(options.urlIncludes);
    const methodMatches = !options?.method || entry.method === options.method;
    const statusMatches = options?.status === undefined || entry.status === options.status;
    const resourceTypeMatches = !options?.resourceType || entry.resourceType === options.resourceType;
    return urlMatches && methodMatches && statusMatches && resourceTypeMatches;
  });
}

function buildFlowDefinitionFromTrace(
  site: string,
  id: string,
  goal: string,
  entries: ExecutionTraceCurrentStep[]
): FlowDefinition {
  const flowEntries = entries.filter((entry) => entry.flowSafe);
  assertNoLoginStateBoundaryCrossing(site, flowEntries);
  const steps = dedupeConsecutiveEntrySteps(flowEntries.map((entry, index) => toFlowStep(site, entry, flowEntries, index)));

  if (steps.length === 0) {
    throw new FastBrowserError("FB_FLOW_001", `No flow-safe steps were found in the latest successful trace for ${site}.`, "flow");
  }

  assertStableFlowEntryStep(site, steps);

  return {
    id,
    kind: "flow",
    goal,
    steps,
    success: [{ type: "titleNotEmpty" }]
  };
}

function dedupeConsecutiveEntrySteps(steps: FlowDefinition["steps"]): FlowDefinition["steps"] {
  const result: FlowDefinition["steps"] = [];
  for (const step of steps) {
    const previous = result.at(-1);
    if (previous && areEquivalentEntrySteps(previous, step)) {
      continue;
    }
    result.push(step);
  }
  return result;
}

function areEquivalentEntrySteps(
  left: FlowDefinition["steps"][number],
  right: FlowDefinition["steps"][number]
): boolean {
  if (left.type === "site" && right.type === "site") {
    return left.command === right.command && JSON.stringify(left.with ?? {}) === JSON.stringify(right.with ?? {});
  }

  if (left.type === "builtin" && right.type === "builtin" && left.command === "open" && right.command === "open") {
    return JSON.stringify(left.with ?? {}) === JSON.stringify(right.with ?? {});
  }

  return false;
}

function toFlowStep(site: string, entry: ExecutionTraceCurrentStep, flowEntries: ExecutionTraceCurrentStep[], index: number): FlowDefinition["steps"][number] {
  if (entry.command === "site") {
    const target = String(entry.input[0] ?? "");
    const withInput = isRecord(entry.input[1]) ? entry.input[1] : {};
    const [entrySite] = target.split("/");
    if (entrySite !== site) {
      throw new FastBrowserError("FB_FLOW_001", `Latest trace mixes sites (${target}); save the flow under the matching site.`, "flow");
    }
    return { type: "site", command: target, with: withInput };
  }

  if (entry.command === "open") {
    return { type: "builtin", command: "open", with: { url: sanitizeFlowUrl(String(entry.input[0] ?? "")) } };
  }

  if (entry.command === "wait") {
    return { type: "builtin", command: "wait", with: isRecord(entry.input[0]) ? entry.input[0] : {} };
  }

  if (entry.command === "waitForSelector") {
    const selector = String(entry.input[0] ?? "");
    const waitOptions = isRecord(entry.input[1]) ? entry.input[1] : {};
    return { type: "builtin", command: "waitForSelector", with: { selector, ...waitOptions } };
  }

  if (entry.command === "tabNew") {
    return { type: "builtin", command: "tabNew", with: { url: sanitizeOptionalFlowUrl(asOptionalString(entry.input[0])) } };
  }

  if (entry.command === "tabSwitch") {
    return { type: "builtin", command: "tabSwitch", with: { target: deriveTabSwitchTarget(flowEntries, index) } };
  }

  if (entry.command === "click") {
    return { type: "builtin", command: "click", with: { target: buildStableInteractionTarget(entry, "click") } };
  }

  if (entry.command === "fill") {
    return {
      type: "builtin",
      command: "fill",
      with: {
        target: buildStableInteractionTarget(entry, "fill"),
        value: String(entry.input[1] ?? "")
      }
    };
  }

  if (entry.command === "press") {
    return { type: "builtin", command: "press", with: buildPressWith(entry) };
  }

  throw new FastBrowserError("FB_FLOW_001", `Unsupported trace step for flow draft: ${entry.command}`, "flow");
}

function assertStableFlowEntryStep(site: string, steps: FlowDefinition["steps"]): void {
  const hasEntryStep = steps.some((step) => step.type === "site" || (step.type === "builtin" && step.command === "open"));
  const needsEntryStep = steps.some((step) => {
    if (step.type === "site") {
      return false;
    }
    if (step.type !== "builtin") {
      return false;
    }
    return ["tabSwitch", "click", "fill", "press"].includes(step.command);
  });

  if (!hasEntryStep && needsEntryStep) {
    throw new FastBrowserError(
      "FB_FLOW_001",
      `Latest trace for ${site} does not include a stable entry step (site/open). Rerun the task from a stable start page before saving the flow.`,
      "flow"
    );
  }
}

function buildStableInteractionTarget(entry: ExecutionTraceCurrentStep, command: "click" | "fill" | "press"): FlowInteractionTarget {
  const text = entry.locator?.text ?? readStringField(entry.output, "text");
  const placeholder = entry.locator?.placeholder ?? readStringField(entry.output, "placeholder");
  const role = entry.locator?.role ?? readStringField(entry.output, "role");
  const ariaLabel = entry.locator?.ariaLabel ?? readStringField(entry.output, "ariaLabel");
  const selector = selectStableInteractionSelector(entry, command, { text, placeholder, role, ariaLabel });
  if (!selector || selector.startsWith("@")) {
    throw new FastBrowserError("FB_FLOW_001", `Trace step ${command} cannot be converted into a stable flow target`, "flow");
  }
  const target: FlowInteractionTarget = { selector };
  if (text) target.text = text;
  if (placeholder) target.placeholder = placeholder;
  if (role) target.role = role;
  if (ariaLabel) target.ariaLabel = ariaLabel;
  if (command === "click" && !isReliableAutoClickTarget(entry, target)) {
    throw new FastBrowserError("FB_FLOW_001", "Trace step click cannot be converted into a stable flow target", "flow");
  }
  if (command === "fill" && !isReliableAutoFillTarget(entry, target)) {
    throw new FastBrowserError("FB_FLOW_001", "Trace step fill cannot be converted into a stable flow target", "flow");
  }
  return target;
}

function isReliableAutoClickTarget(entry: ExecutionTraceCurrentStep, target: FlowInteractionTarget): boolean {
  const signal = readActionSignal(entry.output);
  const hasPageSignal = Boolean(signal?.urlChanged || signal?.titleChanged);
  const hasSemanticHint = Boolean(target.text || target.placeholder || target.role || target.ariaLabel);
  const hasStructuredSelector = !/nth-of-type\(/.test(target.selector)
    || target.selector.includes("#")
    || target.selector.includes(".")
    || target.selector.includes("[")
    || /data-|aria-|name=|role=/.test(target.selector);
  return hasPageSignal || hasSemanticHint || hasStructuredSelector;
}

function isReliableAutoFillTarget(entry: ExecutionTraceCurrentStep, target: FlowInteractionTarget): boolean {
  const selector = target.selector.toLowerCase();
  const role = target.role?.toLowerCase();
  const hasFillableSelector = /\b(input|textarea|select)\b/.test(selector)
    || selector.includes("contenteditable")
    || selector.includes("[type=")
    || selector.includes("[name=")
    || selector.includes("[placeholder")
    || selector.includes("[role=")
    || selector.includes("#input-");
  const hasFillableRole = role !== undefined && ["textbox", "searchbox", "combobox", "spinbutton"].includes(role);
  const hasPlaceholder = Boolean(target.placeholder);
  const signal = readActionSignal(entry.output);
  const hasPageSignal = Boolean(signal?.urlChanged || signal?.titleChanged);
  return hasFillableSelector || hasFillableRole || hasPlaceholder || hasPageSignal;
}

function selectStableInteractionSelector(
  entry: ExecutionTraceCurrentStep,
  command: "click" | "fill" | "press",
  hints: { text?: string; placeholder?: string; role?: string; ariaLabel?: string }
): string | undefined {
  const candidates = readSelectorCandidates(entry);
  if (candidates.length === 0) {
    return undefined;
  }

  const scored = candidates
    .filter((selector) => !selector.startsWith("@"))
    .map((selector) => ({ selector, score: scoreInteractionSelector(selector, command, hints) }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.selector.length - right.selector.length;
    });

  return scored[0]?.selector;
}

function readSelectorCandidates(entry: ExecutionTraceCurrentStep): string[] {
  const outputCandidates = readStringArrayField(entry.output, "selectorCandidates");
  const locatorCandidates = Array.isArray(entry.locator?.selectorCandidates)
    ? entry.locator.selectorCandidates.filter((value): value is string => typeof value === "string")
    : [];
  const values = [
    entry.locator?.resolvedSelector,
    readStringField(entry.output, "selector"),
    ...locatorCandidates,
    ...outputCandidates
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return Array.from(new Set(values));
}

function scoreInteractionSelector(
  selector: string,
  command: "click" | "fill" | "press",
  hints: { text?: string; placeholder?: string; role?: string; ariaLabel?: string }
): number {
  const normalized = selector.toLowerCase();
  let score = 0;

  if (command === "fill") {
    if (/\b(input|textarea|select)\b/.test(normalized)) score += 120;
    if (normalized.includes("contenteditable")) score += 90;
    if (normalized.includes("[name=")) score += 40;
    if (normalized.includes("[placeholder")) score += 40;
    if (normalized.includes("[type=")) score += 30;
    if (normalized.includes("[role=")) score += 20;
    if (/\bbutton\b/.test(normalized) || normalized.includes("show password")) score -= 120;
  } else {
    if (/\bbutton\b/.test(normalized)) score += 80;
    if (/\ba\b/.test(normalized) || normalized.includes("href")) score += 40;
    if (normalized.includes("[role=")) score += 30;
    if (normalized.includes("[aria-label")) score += 30;
  }

  if (normalized.includes("#")) score += 30;
  if (normalized.includes("[data-testid") || normalized.includes("[data-test") || normalized.includes("[data-qa")) score += 35;
  if (normalized.includes("[aria-label")) score += 25;
  if (normalized.includes("[name=")) score += 20;
  if (normalized.includes("[placeholder")) score += 20;
  if (normalized.includes("[role=")) score += 15;
  if (!normalized.includes(">")) score += 10;
  if (/nth-(child|of-type)\(/.test(normalized)) score -= 50;
  if (normalized.includes(":nth-child")) score -= 30;
  if (normalized.includes(">")) score -= Math.min(30, (normalized.match(/>/g) ?? []).length * 6);
  if (normalized.startsWith("html") || normalized.startsWith("body")) score -= 20;
  if (normalized.length > 120) score -= 20;

  if (hints.placeholder && normalized.includes("placeholder")) score += 20;
  if (hints.ariaLabel && normalized.includes("aria-label")) score += 15;
  if (hints.role && normalized.includes("role")) score += 10;

  return score;
}

function readActionSignal(value: unknown): { urlChanged?: boolean; titleChanged?: boolean } | undefined {
  if (!isRecord(value) || !isRecord(value.signal)) {
    return undefined;
  }
  return value.signal as { urlChanged?: boolean; titleChanged?: boolean };
}

function deriveTabSwitchTarget(entries: ExecutionTraceCurrentStep[], index: number): "previous" | "lastCreated" {
  const previousEntries = entries.slice(0, index).reverse();
  const lastTabSwitch = previousEntries.find((item) => item.command === "tabSwitch");
  if (lastTabSwitch) {
    return "lastCreated";
  }
  const lastTabNew = previousEntries.find((item) => item.command === "tabNew");
  if (lastTabNew) {
    return "previous";
  }
  return "previous";
}

function assertNoLoginStateBoundaryCrossing(site: string, entries: ExecutionTraceCurrentStep[]): void {
  const firstCredentialIndex = entries.findIndex((entry) => isCredentialFillStep(entry));
  if (firstCredentialIndex < 0) {
    return;
  }

  const crossed = entries.slice(firstCredentialIndex + 1).some((entry) => {
    if (entry.command === "site") {
      return true;
    }
    if (entry.command !== "open" && entry.command !== "tabNew") {
      return false;
    }
    const url = asOptionalString(entry.input[0]);
    return Boolean(url && !isLikelyLoginUrl(url));
  });

  if (!crossed) {
    return;
  }

  throw new FastBrowserError(
    "FB_FLOW_001",
    `Latest trace for ${site} crosses the login-state boundary; rerun flow save from a stable post-login entry before saving the flow.`,
    "flow"
  );
}

function isCredentialFillStep(entry: ExecutionTraceCurrentStep): boolean {
  if (entry.command !== "fill") {
    return false;
  }
  const target = readFillTarget(entry);
  if (!target) {
    return false;
  }
  const haystacks = [
    target.selector,
    target.placeholder,
    target.text,
    target.ariaLabel,
    target.role
  ].filter((value): value is string => typeof value === "string");
  return haystacks.some((value) => /(username|user|email|password|passwd|signin|sign-in|login|log-in)/i.test(value));
}

function readFillTarget(entry: ExecutionTraceCurrentStep): FlowInteractionTarget | undefined {
  if (entry.command !== "fill") {
    return undefined;
  }
  const selector = selectStableInteractionSelector(entry, "fill", {
    text: entry.locator?.text ?? readStringField(entry.output, "text"),
    placeholder: entry.locator?.placeholder ?? readStringField(entry.output, "placeholder"),
    role: entry.locator?.role ?? readStringField(entry.output, "role"),
    ariaLabel: entry.locator?.ariaLabel ?? readStringField(entry.output, "ariaLabel")
  });
  if (!selector) {
    return undefined;
  }
  return {
    selector,
    ...(entry.locator?.placeholder ? { placeholder: entry.locator.placeholder } : {}),
    ...(entry.locator?.text ? { text: entry.locator.text } : {}),
    ...(entry.locator?.ariaLabel ? { ariaLabel: entry.locator.ariaLabel } : {}),
    ...(entry.locator?.role ? { role: entry.locator.role } : {})
  };
}

function sanitizeOptionalFlowUrl(url?: string): string | undefined {
  return url ? sanitizeFlowUrl(url) : undefined;
}

function sanitizeFlowUrl(url: string): string {
  try {
    const parsed = new URL(url);
    stripVolatileParams(parsed.searchParams);
    if (parsed.hash.includes("?")) {
      const [hashPath, hashQuery] = parsed.hash.slice(1).split("?", 2);
      const hashParams = new URLSearchParams(hashQuery);
      stripVolatileParams(hashParams);
      const rendered = hashParams.toString();
      parsed.hash = rendered ? `#${hashPath}?${rendered}` : `#${hashPath}`;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function stripVolatileParams(params: URLSearchParams): void {
  for (const key of ["user_token", "token", "access_token", "refresh_token", "session", "sessionid", "sid", "code", "state"]) {
    params.delete(key);
  }
}

function isLikelyLoginUrl(url: string): boolean {
  return /(login|signin|sign-in|log-in|auth)/i.test(url);
}

function buildPressWith(entry: ExecutionTraceCurrentStep): Record<string, unknown> {
  const raw = entry.input[0];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new FastBrowserError("FB_FLOW_001", "Trace step press cannot be converted into a stable flow key", "flow");
  }
  const keys = raw.split("+").map((part) => part.trim()).filter(Boolean);
  const withValue: Record<string, unknown> = keys.length > 1 ? { keys } : { key: raw };
  const target = entry.locator ? buildStableInteractionTarget(entry, "press") : undefined;
  if (target) {
    withValue.target = target;
  }
  return withValue;
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return typeof value[key] === "string" ? value[key] as string : undefined;
}

function readStringArrayField(value: unknown, key: string): string[] {
  if (!isRecord(value) || !Array.isArray(value[key])) {
    return [];
  }
  return (value[key] as unknown[]).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function buildCaseDefinitionFromFlow(options: {
  id: string;
  goal: string;
  flowId: string;
  urlIncludes?: string;
  textIncludes?: string;
  selectorVisible?: string;
  titleNotEmpty?: boolean;
}): CaseDefinition {
  const assertions: FlowAssertion[] = [];
  if (options.urlIncludes) {
    assertions.push({ type: "urlIncludes", value: options.urlIncludes });
  }
  if (options.textIncludes) {
    assertions.push({ type: "textIncludes", value: options.textIncludes });
  }
  if (options.selectorVisible) {
    assertions.push({ type: "selectorVisible", value: options.selectorVisible });
  }
  if (options.titleNotEmpty || assertions.length === 0) {
    assertions.push({ type: "titleNotEmpty" });
  }
  return {
    id: options.id,
    kind: "case",
    goal: options.goal,
    uses: [{ flow: options.flowId, with: {} }],
    assertions
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
