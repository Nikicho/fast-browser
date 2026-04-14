import fs from "node:fs/promises";
import path from "node:path";

import { getCustomAdaptersDir, getFlowFilePath } from "../shared/constants";
import { FastBrowserError } from "../shared/errors";
import type {
  BrowserActionResult,
  BrowserNetworkEntry,
  FlowAssertion,
  FlowAssertionResult,
  FlowBuiltinCommand,
  FlowDefinition,
  FlowInteractionTarget,
  FlowListItem,
  FlowRunResult,
  FlowRunStepResult,
  FlowSaveResult
} from "../shared/types";

interface FlowBuiltinHandlers {
  open(url: string): Promise<BrowserActionResult | unknown>;
  wait(options: { ms?: number; text?: string; urlIncludes?: string; fn?: string }): Promise<BrowserActionResult | unknown>;
  waitForSelector(selector: string, options: { timeoutMs?: number; state?: "attached" | "visible" | "hidden" }): Promise<BrowserActionResult | unknown>;
  tabNew?(url?: string): Promise<BrowserActionResult | unknown>;
  tabSwitch?(target: string): Promise<BrowserActionResult | unknown>;
  click?(target: string, options?: { timeoutMs?: number; text?: string; placeholder?: string; role?: string; ariaLabel?: string }): Promise<BrowserActionResult | unknown>;
  fill?(target: string, text: string, options?: { timeoutMs?: number; text?: string; placeholder?: string; role?: string; ariaLabel?: string }): Promise<BrowserActionResult | unknown>;
  press?(key: string, options?: { target?: string }): Promise<BrowserActionResult | unknown>;
  getUrl(): Promise<string>;
  getTitle(): Promise<string>;
  getSnapshotText(): Promise<string>;
  getSelectorCount(selector: string): Promise<number>;
  getElementText(selector: string): Promise<string>;
  getStorageValue(kind: "localStorage" | "sessionStorage", key: string): Promise<string | null>;
  getNetworkEntries(): Promise<BrowserNetworkEntry[]>;
}

interface FlowServiceOptions {
  adaptersDir?: string;
  executeSite(target: string, params: Record<string, unknown>): Promise<unknown>;
  builtinHandlers: FlowBuiltinHandlers;
}

export function createFlowService(options: FlowServiceOptions) {
  const adaptersDir = options.adaptersDir ?? getCustomAdaptersDir();

  return {
    async saveFlow(site: string, source: string | FlowDefinition): Promise<FlowSaveResult> {
      const definition = await loadFlowDefinition(source);
      validateFlowDefinition(definition);
      await validateFlowSaveSource(site, definition, source, adaptersDir);
      const outputPath = getFlowFilePath(site, definition.id, path.dirname(path.dirname(adaptersDir)));
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, formatJsonFile(definition), "utf8");
      return {
        ok: true,
        site,
        flowId: definition.id,
        path: outputPath
      };
    },

    async listFlows(site?: string): Promise<FlowListItem[]> {
      if (site) {
        return listSiteFlows(site, adaptersDir);
      }

      const sites = await listAdapterSites(adaptersDir);
      const flows = await Promise.all(sites.map((item) => listSiteFlows(item, adaptersDir)));
      return flows.flat().sort((left, right) => left.path.localeCompare(right.path));
    },

    async runFlow(target: string, params: Record<string, unknown> = {}): Promise<FlowRunResult> {
      const { site, flowId } = parseFlowTarget(target);
      const flowFilePath = path.join(adaptersDir, site, "flows", `${flowId}.flow.json`);
      const definition = await loadFlowDefinition(flowFilePath);
      validateFlowDefinition(definition);
      validateRequiredParams(definition, params);

      const steps: FlowRunStepResult[] = [];
      for (const [index, step] of definition.steps.entries()) {
        const templateContext = buildTemplateContext(params, steps);
        const input = resolveTemplates(step.with ?? {}, templateContext) as Record<string, unknown>;
        let result: unknown;

        if (step.type === "site") {
          result = await options.executeSite(step.command, input);
          if (isFailedSiteStepResult(result)) {
            throw await buildAuthAwareFlowError(`Flow step failed: ${step.command}`, options.builtinHandlers);
          }
        } else {
          try {
            result = await executeBuiltinStep(step.command, input, options.builtinHandlers);
          } catch (error) {
            if (error instanceof FastBrowserError && error.stage === "flow") {
              throw error;
            }
            throw await buildAuthAwareFlowError(`Flow step failed: ${step.command}`, options.builtinHandlers);
          }
        }

        steps.push({
          index,
          type: step.type,
          command: step.command,
          input,
          result,
          data: extractStepData(result)
        });
      }

      const assertions = await executeAssertions(definition.success ?? [], options.builtinHandlers);

      return {
        ok: true,
        site,
        flowId,
        steps,
        assertions
      };
    }
  };
}

async function loadFlowDefinition(source: string | FlowDefinition): Promise<FlowDefinition> {
  if (typeof source !== "string") {
    return source;
  }
  const raw = await fs.readFile(source, "utf8");
  return JSON.parse(stripBom(raw)) as FlowDefinition;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function validateFlowDefinition(definition: FlowDefinition): void {
  if (definition.kind !== "flow") {
    throw new FastBrowserError("FB_FLOW_001", "Flow kind must be 'flow'", "flow");
  }
  if (!definition.id) {
    throw new FastBrowserError("FB_FLOW_001", "Flow id is required", "flow");
  }
  if (!definition.goal?.trim()) {
    throw new FastBrowserError("FB_FLOW_001", "Flow goal is required", "flow");
  }
  validateAdapterArgs(definition.params ?? []);
  validateAssertionDefinitions(definition.success ?? []);
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    throw new FastBrowserError("FB_FLOW_001", "Flow must contain at least one step", "flow");
  }

  for (const step of definition.steps) {
    if (step.with !== undefined && (!step.with || typeof step.with !== "object" || Array.isArray(step.with))) {
      throw new FastBrowserError("FB_FLOW_001", `Flow step with must be an object for command: ${step.command}`, "flow");
    }
    if (step.type === "site") {
      if (!step.command.includes("/")) {
        throw new FastBrowserError("FB_FLOW_001", `Invalid site step command: ${step.command}`, "flow");
      }
      continue;
    }
    if (step.type !== "builtin") {
      throw new FastBrowserError("FB_FLOW_001", `Unknown flow step type: ${(step as { type?: string }).type ?? "unknown"}`, "flow");
    }
    if (!["open", "wait", "waitForSelector", "tabNew", "tabSwitch", "click", "fill", "press"].includes(step.command)) {
      throw new FastBrowserError("FB_FLOW_001", `Unsupported builtin flow command: ${step.command}`, "flow");
    }
    if (step.command === "waitForSelector") {
      const state = step.with?.state;
      if (state !== undefined && state !== "attached" && state !== "visible" && state !== "hidden") {
        throw new FastBrowserError("FB_FLOW_001", "builtin waitForSelector state must be attached, visible, or hidden", "flow");
      }
    }
    if (step.command === "tabSwitch") {
      const target = asString(step.with?.target);
      if (!target || !["previous", "lastCreated"].includes(target)) {
        throw new FastBrowserError("FB_FLOW_001", "builtin tabSwitch target must be previous or lastCreated", "flow");
      }
    }
    if (step.command === "click" || step.command === "fill") {
      validateInteractionTarget(readInteractionTarget(step.with?.target));
      if (step.command === "fill" && typeof step.with?.value !== "string") {
        throw new FastBrowserError("FB_FLOW_001", "builtin fill requires with.value", "flow");
      }
    }
    if (step.command === "press") {
      validatePressInput(step.with ?? {});
      if (step.with?.target !== undefined) {
        validateInteractionTarget(readInteractionTarget(step.with.target));
      }
    }
  }
}

async function validateFlowSaveSource(site: string, definition: FlowDefinition, source: string | FlowDefinition, adaptersDir: string): Promise<void> {
  if (typeof source === "string") {
    const expectedFileName = `${definition.id}.flow.json`;
    if (path.basename(source) !== expectedFileName) {
      throw new FastBrowserError("FB_FLOW_001", `Flow file name must match flow id: ${expectedFileName}`, "flow");
    }
    if (isSessionDraftAssetPath(source, adaptersDir)) {
      throw new FastBrowserError(
        "FB_FLOW_001",
        `Session draft flows cannot be saved directly from ${source}. Move the asset into src/adapters/${site}/flows first.`,
        "flow"
      );
    }
  }

  const manifest = await loadAdapterManifest(site, adaptersDir);
  const commandNames = new Set((manifest.commands ?? []).map((command) => command.name));

  for (const step of definition.steps) {
    if (step.type !== "site") {
      continue;
    }
    const [stepSite, commandName] = step.command.split("/");
    if (stepSite !== site) {
      throw new FastBrowserError("FB_FLOW_001", `Flow site step must target the same site: ${site}`, "flow");
    }
    if (!commandName || !commandNames.has(commandName)) {
      throw new FastBrowserError("FB_FLOW_001", `Flow site step command not found in manifest: ${step.command}`, "flow");
    }
  }
}

async function loadAdapterManifest(site: string, adaptersDir: string): Promise<{ commands?: Array<{ name: string }> }> {
  const manifestPath = path.join(adaptersDir, site, "manifest.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(stripBom(raw)) as { commands?: Array<{ name: string }> };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      throw new FastBrowserError("FB_FLOW_001", `Adapter manifest not found for site: ${site}`, "flow");
    }
    throw error;
  }
}

function validateRequiredParams(definition: FlowDefinition, params: Record<string, unknown>): void {
  for (const arg of definition.params ?? []) {
    if (arg.required && params[arg.name] === undefined) {
      throw new FastBrowserError("FB_FLOW_001", `Missing required flow param: ${arg.name}`, "flow");
    }
  }
}

function validateAdapterArgs(args: FlowDefinition["params"]): void {
  for (const arg of args ?? []) {
    if (!arg.name?.trim()) {
      throw new FastBrowserError("FB_FLOW_001", "Flow param name is required", "flow");
    }
    if (!["string", "number", "boolean"].includes(arg.type)) {
      throw new FastBrowserError("FB_FLOW_001", `Unsupported flow param type: ${arg.type}`, "flow");
    }
  }
}

function validateAssertionDefinitions(assertions: FlowAssertion[]): void {
  for (const assertion of assertions) {
    switch (assertion.type) {
      case "urlIncludes":
      case "titleNotEmpty":
      case "selectorVisible":
      case "textIncludes":
      case "textNotIncludes":
      case "selectorCountAtLeast":
      case "selectorCountEquals":
      case "elementTextIncludes":
      case "elementTextEquals":
      case "storageValueEquals":
      case "networkRequestSeen":
        break;
      default:
        throw new FastBrowserError("FB_FLOW_001", `Unsupported flow assertion type: ${(assertion as { type?: string }).type ?? "unknown"}`, "flow");
    }
  }
}

async function listAdapterSites(adaptersDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(adaptersDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function listSiteFlows(site: string, adaptersDir: string): Promise<FlowListItem[]> {
  const flowDir = path.join(adaptersDir, site, "flows");
  try {
    const entries = await fs.readdir(flowDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".flow.json"))
      .map((entry) => ({
        site,
        flowId: entry.name.replace(/\.flow\.json$/i, ""),
        path: path.join(flowDir, entry.name)
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function isSessionDraftAssetPath(source: string, adaptersDir: string): boolean {
  const root = path.dirname(path.dirname(adaptersDir));
  const sessionRoot = path.join(root, ".fast-browser", "sessions");
  const relative = path.relative(sessionRoot, path.resolve(source));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function parseFlowTarget(target: string): { site: string; flowId: string } {
  const [site, flowId] = target.split("/");
  if (!site || !flowId) {
    throw new FastBrowserError("FB_FLOW_001", `Invalid flow target: ${target}`, "flow");
  }
  return { site, flowId };
}

async function executeAssertions(assertions: FlowAssertion[], handlers: FlowBuiltinHandlers): Promise<FlowAssertionResult[]> {
  const results: FlowAssertionResult[] = [];

  for (const [index, assertion] of assertions.entries()) {
    const result = await executeAssertion(assertion, index, handlers);
    if (!result.ok) {
      throw await buildAuthAwareFlowError(`Flow success assertion failed: ${assertion.type}`, handlers);
    }
    results.push(result);
  }

  return results;
}

async function buildAuthAwareFlowError(message: string, handlers: FlowBuiltinHandlers): Promise<FastBrowserError> {
  const hint = await buildAuthRecoveryHint(handlers.getUrl, handlers.getTitle);
  return new FastBrowserError("FB_FLOW_002", hint ? `${message} ${hint}` : message, "flow");
}

async function buildAuthRecoveryHint(
  getUrl: () => Promise<string>,
  getTitle: () => Promise<string>
): Promise<string | undefined> {
  try {
    const [url, title] = await Promise.all([getUrl(), getTitle()]);
    if (!looksLikeAuthPage(url, title)) {
      return undefined;
    }
    return "Current page looks like a login/auth page. Restore login in a fixed --session-id session, run fast-browser auth sync, then rerun this flow from a stable post-login page.";
  } catch {
    return undefined;
  }
}

function looksLikeAuthPage(url: string, title: string): boolean {
  return /(login|signin|sign-in|log-?in|auth)/i.test(url) || /(login|sign in|signin|authenticate|auth)/i.test(title);
}

async function executeAssertion(assertion: FlowAssertion, index: number, handlers: FlowBuiltinHandlers): Promise<FlowAssertionResult> {
  switch (assertion.type) {
    case "urlIncludes": {
      if (!assertion.value) {
        throw new FastBrowserError("FB_FLOW_001", "urlIncludes assertion requires value", "flow");
      }
      const actual = await handlers.getUrl();
      return { index, type: assertion.type, value: assertion.value, ok: actual.includes(assertion.value), actual };
    }
    case "titleNotEmpty": {
      const actual = await handlers.getTitle();
      return { index, type: assertion.type, ok: actual.trim().length > 0, actual };
    }
    case "selectorVisible": {
      if (!assertion.value) {
        throw new FastBrowserError("FB_FLOW_001", "selectorVisible assertion requires value", "flow");
      }
      try {
        const actual = await handlers.waitForSelector(assertion.value, { state: "visible", timeoutMs: undefined });
        return { index, type: assertion.type, value: assertion.value, ok: true, actual: extractSelectorActual(actual, assertion.value) };
      } catch {
        return { index, type: assertion.type, value: assertion.value, ok: false, actual: assertion.value };
      }
    }
    case "textIncludes": {
      if (!assertion.value) {
        throw new FastBrowserError("FB_FLOW_001", "textIncludes assertion requires value", "flow");
      }
      const actual = await handlers.getSnapshotText();
      return { index, type: assertion.type, value: assertion.value, ok: actual.includes(assertion.value), actual };
    }
    case "textNotIncludes": {
      if (!assertion.value) {
        throw new FastBrowserError("FB_FLOW_001", "textNotIncludes assertion requires value", "flow");
      }
      const actual = await handlers.getSnapshotText();
      return { index, type: assertion.type, value: assertion.value, ok: !actual.includes(assertion.value), actual };
    }
    case "selectorCountAtLeast": {
      if (!assertion.selector || assertion.count === undefined) {
        throw new FastBrowserError("FB_FLOW_001", "selectorCountAtLeast assertion requires selector and count", "flow");
      }
      const actual = await handlers.getSelectorCount(assertion.selector);
      return { index, type: assertion.type, selector: assertion.selector, count: assertion.count, ok: actual >= assertion.count, actual };
    }
    case "selectorCountEquals": {
      if (!assertion.selector || assertion.count === undefined) {
        throw new FastBrowserError("FB_FLOW_001", "selectorCountEquals assertion requires selector and count", "flow");
      }
      const actual = await handlers.getSelectorCount(assertion.selector);
      return { index, type: assertion.type, selector: assertion.selector, count: assertion.count, ok: actual === assertion.count, actual };
    }
    case "elementTextIncludes": {
      if (!assertion.selector || !assertion.value) {
        throw new FastBrowserError("FB_FLOW_001", "elementTextIncludes assertion requires selector and value", "flow");
      }
      const actual = await handlers.getElementText(assertion.selector);
      return { index, type: assertion.type, selector: assertion.selector, value: assertion.value, ok: actual.includes(assertion.value), actual };
    }
    case "elementTextEquals": {
      if (!assertion.selector || !assertion.value) {
        throw new FastBrowserError("FB_FLOW_001", "elementTextEquals assertion requires selector and value", "flow");
      }
      const actual = await handlers.getElementText(assertion.selector);
      return { index, type: assertion.type, selector: assertion.selector, value: assertion.value, ok: actual === assertion.value, actual };
    }
    case "storageValueEquals": {
      if (!assertion.storage || !assertion.key || assertion.value === undefined) {
        throw new FastBrowserError("FB_FLOW_001", "storageValueEquals assertion requires storage, key, and value", "flow");
      }
      const actual = await handlers.getStorageValue(assertion.storage, assertion.key);
      return {
        index,
        type: assertion.type,
        storage: assertion.storage,
        key: assertion.key,
        value: assertion.value,
        ok: actual === assertion.value,
        actual
      };
    }
    case "networkRequestSeen": {
      if (!assertion.urlIncludes) {
        throw new FastBrowserError("FB_FLOW_001", "networkRequestSeen assertion requires urlIncludes", "flow");
      }
      const entries = await handlers.getNetworkEntries();
      const matched = entries.find((entry) =>
        entry.url.includes(assertion.urlIncludes!)
        && (assertion.method === undefined || entry.method === assertion.method)
        && (assertion.status === undefined || entry.status === assertion.status)
        && (assertion.resourceType === undefined || entry.resourceType === assertion.resourceType)
      );
      return {
        index,
        type: assertion.type,
        urlIncludes: assertion.urlIncludes,
        method: assertion.method,
        status: assertion.status,
        resourceType: assertion.resourceType,
        ok: matched !== undefined,
        actual: matched?.url
      };
    }
    default:
      throw new FastBrowserError("FB_FLOW_001", `Unsupported flow assertion type: ${(assertion as { type?: string }).type ?? "unknown"}`, "flow");
  }
}

function extractSelectorActual(result: unknown, fallback: string): unknown {
  if (result && typeof result === "object" && "selector" in result) {
    return (result as { selector?: unknown }).selector ?? fallback;
  }
  return fallback;
}

async function executeBuiltinStep(command: FlowBuiltinCommand, input: Record<string, unknown>, handlers: FlowBuiltinHandlers): Promise<unknown> {
  switch (command) {
    case "open": {
      if (typeof input.url !== "string") {
        throw new FastBrowserError("FB_FLOW_001", "builtin open requires with.url", "flow");
      }
      return handlers.open(input.url);
    }
    case "wait": {
      return handlers.wait({
        ms: asNumber(input.ms),
        text: asString(input.text),
        urlIncludes: asString(input.urlIncludes),
        fn: asString(input.fn)
      });
    }
    case "waitForSelector": {
      if (typeof input.selector !== "string") {
        throw new FastBrowserError("FB_FLOW_001", "builtin waitForSelector requires with.selector", "flow");
      }
      const state = asState(input.state);
      if (input.state !== undefined && !state) {
        throw new FastBrowserError("FB_FLOW_001", "builtin waitForSelector state must be attached, visible, or hidden", "flow");
      }
      return handlers.waitForSelector(input.selector, {
        timeoutMs: asNumber(input.timeoutMs),
        state
      });
    }
    case "tabNew": {
      const url = asString(input.url);
      if (!handlers.tabNew) throw new FastBrowserError("FB_FLOW_001", "builtin tabNew handler is not configured", "flow");
      return handlers.tabNew(url);
    }
    case "tabSwitch": {
      const target = asString(input.target);
      if (!target || !["previous", "lastCreated"].includes(target)) {
        throw new FastBrowserError("FB_FLOW_001", "builtin tabSwitch target must be previous or lastCreated", "flow");
      }
      if (!handlers.tabSwitch) throw new FastBrowserError("FB_FLOW_001", "builtin tabSwitch handler is not configured", "flow");
      return handlers.tabSwitch(target);
    }
    case "click": {
      const target = validateInteractionTarget(readInteractionTarget(input.target));
      if (!handlers.click) throw new FastBrowserError("FB_FLOW_001", "builtin click handler is not configured", "flow");
      return handlers.click(target.selector, buildInteractionOptions(target, asNumber(input.timeoutMs)));
    }
    case "fill": {
      const target = validateInteractionTarget(readInteractionTarget(input.target));
      if (typeof input.value !== "string") {
        throw new FastBrowserError("FB_FLOW_001", "builtin fill requires with.value", "flow");
      }
      if (!handlers.fill) throw new FastBrowserError("FB_FLOW_001", "builtin fill handler is not configured", "flow");
      return handlers.fill(target.selector, input.value, buildInteractionOptions(target, asNumber(input.timeoutMs)));
    }
    case "press": {
      const press = validatePressInput(input);
      const key = press.key ?? press.keys!.join("+");
      const target = input.target !== undefined ? validateInteractionTarget(readInteractionTarget(input.target)) : undefined;
      if (!handlers.press) throw new FastBrowserError("FB_FLOW_001", "builtin press handler is not configured", "flow");
      return handlers.press(key, target ? { target: target.selector } : undefined);
    }
    default:
      throw new FastBrowserError("FB_FLOW_001", `Unsupported builtin flow command: ${String(command)}`, "flow");
  }
}

function resolveTemplates(value: unknown, context: FlowTemplateContext): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplates(item, context));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveTemplates(entry, context)]));
  }
  if (typeof value !== "string") {
    return value;
  }

  const exactMatch = value.match(/^\$\{([^}]+)\}$/);
  if (exactMatch) {
    return resolveTemplateExpression(exactMatch[1], context);
  }

  return value.replace(/\$\{([^}]+)\}/g, (_, expression: string) => {
    const resolved = resolveTemplateExpression(expression, context);
    return resolved === undefined || resolved === null ? "" : String(resolved);
  });
}

interface FlowTemplateContext {
  params: Record<string, unknown>;
  steps: Array<FlowRunStepResult & { data?: unknown }>;
}

function buildTemplateContext(params: Record<string, unknown>, steps: FlowRunStepResult[]): FlowTemplateContext {
  return {
    params,
    steps: steps.map((step) => ({
      ...step,
      data: step.data ?? extractStepData(step.result)
    }))
  };
}

function resolveTemplateExpression(expression: string, context: FlowTemplateContext): unknown {
  const normalized = expression.replace(/\[(\d+)\]/g, ".$1");
  const segments = normalized.split(".").filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }

  let current: unknown;
  if (segments[0] === "params") {
    current = context.params;
  } else if (segments[0] === "steps") {
    current = context.steps;
  } else {
    return undefined;
  }

  for (const segment of segments.slice(1)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function extractStepData(result: unknown): unknown {
  if (result && typeof result === "object" && "data" in result) {
    return (result as { data?: unknown }).data;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asState(value: unknown): "attached" | "visible" | "hidden" | undefined {
  return value === "attached" || value === "visible" || value === "hidden" ? value : undefined;
}

function readInteractionTarget(value: unknown): FlowInteractionTarget | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as FlowInteractionTarget;
}

function validateInteractionTarget(target: FlowInteractionTarget | undefined): FlowInteractionTarget {
  if (!target || typeof target.selector !== "string" || target.selector.trim().length === 0) {
    throw new FastBrowserError("FB_FLOW_001", "Flow interaction target requires a stable selector", "flow");
  }
  if (target.selector.startsWith("@")) {
    throw new FastBrowserError("FB_FLOW_001", "Flow interaction target must not store snapshot refs", "flow");
  }
  for (const key of ["text", "placeholder", "role", "ariaLabel"] as const) {
    const value = target[key];
    if (value !== undefined && typeof value !== "string") {
      throw new FastBrowserError("FB_FLOW_001", `Flow interaction target ${key} must be a string`, "flow");
    }
  }
  return target;
}

function formatJsonFile(value: unknown): string {
  return `\uFEFF${JSON.stringify(value, null, 2)}\n`;
}

function buildInteractionOptions(target: FlowInteractionTarget, timeoutMs?: number) {
  return {
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(target.text ? { text: target.text } : {}),
    ...(target.placeholder ? { placeholder: target.placeholder } : {}),
    ...(target.role ? { role: target.role } : {}),
    ...(target.ariaLabel ? { ariaLabel: target.ariaLabel } : {})
  };
}

function validatePressInput(input: Record<string, unknown>): { key?: string; keys?: string[] } {
  const key = asString(input.key);
  const keys = Array.isArray(input.keys) ? input.keys.filter((value): value is string => typeof value === "string") : undefined;
  if (key && keys) {
    throw new FastBrowserError("FB_FLOW_001", "builtin press accepts either key or keys, not both", "flow");
  }
  if (key) {
    return { key };
  }
  if (!keys || keys.length < 1 || keys.length > 2) {
    throw new FastBrowserError("FB_FLOW_001", "builtin press keys must contain one or two keys", "flow");
  }
  return { keys };
}

function isFailedSiteStepResult(result: unknown): boolean {
  return Boolean(result && typeof result === "object" && "success" in result && (result as { success?: unknown }).success === false);
}




