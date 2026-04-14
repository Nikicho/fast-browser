import fs from "node:fs/promises";
import path from "node:path";

import { getCaseFilePath, getCustomAdaptersDir } from "../shared/constants";
import { FastBrowserError } from "../shared/errors";
import type {
  AdapterArg,
  BrowserNetworkEntry,
  CaseDefinition,
  CaseListItem,
  CaseRunResult,
  CaseRunUseResult,
  CaseSaveResult,
  FlowAssertion,
  FlowAssertionResult,
  FlowRunResult
} from "../shared/types";

interface CaseBuiltinHandlers {
  getUrl(): Promise<string>;
  getTitle(): Promise<string>;
  waitForSelector(selector: string, options: { timeoutMs?: number; state?: "attached" | "visible" | "hidden" }): Promise<unknown>;
  getSnapshotText(): Promise<string>;
  getSelectorCount(selector: string): Promise<number>;
  getElementText(selector: string): Promise<string>;
  getStorageValue(kind: "localStorage" | "sessionStorage", key: string): Promise<string | null>;
  getNetworkEntries(): Promise<BrowserNetworkEntry[]>;
}

interface CaseServiceOptions {
  adaptersDir?: string;
  runFlow(target: string, params: Record<string, unknown>): Promise<FlowRunResult>;
  builtinHandlers: CaseBuiltinHandlers;
}

export function createCaseService(options: CaseServiceOptions) {
  const adaptersDir = options.adaptersDir ?? getCustomAdaptersDir();

  return {
    async saveCase(site: string, source: string | CaseDefinition): Promise<CaseSaveResult> {
      const definition = await loadCaseDefinition(source);
      validateCaseDefinition(definition);
      await validateCaseSaveSource(site, definition, source, adaptersDir);
      const outputPath = getCaseFilePath(site, definition.id, path.dirname(path.dirname(adaptersDir)));
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, formatJsonFile(definition), "utf8");
      return {
        ok: true,
        site,
        caseId: definition.id,
        path: outputPath
      };
    },

    async listCases(site?: string): Promise<CaseListItem[]> {
      if (site) {
        return listSiteCases(site, adaptersDir);
      }

      const sites = await listAdapterSites(adaptersDir);
      const cases = await Promise.all(sites.map((item) => listSiteCases(item, adaptersDir)));
      return cases.flat().sort((left, right) => left.path.localeCompare(right.path));
    },

    async runCase(target: string, params: Record<string, unknown> = {}): Promise<CaseRunResult> {
      const startedAt = Date.now();
      const { site, caseId } = parseCaseTarget(target);
      const caseFilePath = path.join(adaptersDir, site, "cases", `${caseId}.case.json`);
      const definition = await loadCaseDefinition(caseFilePath);
      validateCaseDefinition(definition);
      validateRequiredParams(definition.params, params);

      const uses: CaseRunUseResult[] = [];
      for (const [index, use] of definition.uses.entries()) {
        const input = resolveTemplates(use.with ?? {}, params) as Record<string, unknown>;
        const useStartedAt = Date.now();
        try {
          const result = await options.runFlow(`${site}/${use.flow}`, input);
          uses.push({
            index,
            flow: use.flow,
            input,
            result,
            durationMs: Date.now() - useStartedAt
          });
        } catch (error) {
          throw await buildAuthAwareCaseError(`Case flow failed: ${use.flow}`, options.builtinHandlers, error);
        }
      }

      const assertions = await executeAssertions(
        resolveTemplates(definition.assertions ?? [], params) as FlowAssertion[],
        options.builtinHandlers
      );

      return {
        ok: true,
        site,
        caseId,
        uses,
        assertions,
        durationMs: Date.now() - startedAt
      };
    }
  };
}

async function loadCaseDefinition(source: string | CaseDefinition): Promise<CaseDefinition> {
  if (typeof source !== "string") {
    return source;
  }
  const raw = await fs.readFile(source, "utf8");
  return JSON.parse(stripBom(raw)) as CaseDefinition;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function validateCaseDefinition(definition: CaseDefinition): void {
  if (definition.kind !== "case") {
    throw new FastBrowserError("FB_CASE_001", "Case kind must be 'case'", "case");
  }
  if (!definition.id) {
    throw new FastBrowserError("FB_CASE_001", "Case id is required", "case");
  }
  if (!definition.goal?.trim()) {
    throw new FastBrowserError("FB_CASE_001", "Case goal is required", "case");
  }
  validateAdapterArgs(definition.params ?? []);
  validateAssertionDefinitions(definition.assertions ?? []);
  if (!Array.isArray(definition.uses) || definition.uses.length === 0) {
    throw new FastBrowserError("FB_CASE_001", "Case must contain at least one flow reference", "case");
  }

  for (const use of definition.uses) {
    if (!use.flow || use.flow.includes("/")) {
      throw new FastBrowserError("FB_CASE_001", `Invalid case flow reference: ${use.flow ?? "unknown"}`, "case");
    }
    if (use.with !== undefined && (!use.with || typeof use.with !== "object" || Array.isArray(use.with))) {
      throw new FastBrowserError("FB_CASE_001", `Case use input must be an object for flow: ${use.flow}`, "case");
    }
  }
}

async function validateCaseSaveSource(site: string, definition: CaseDefinition, source: string | CaseDefinition, adaptersDir: string): Promise<void> {
  if (typeof source === "string") {
    const expectedFileName = `${definition.id}.case.json`;
    if (path.basename(source) !== expectedFileName) {
      throw new FastBrowserError("FB_CASE_001", `Case file name must match case id: ${expectedFileName}`, "case");
    }
    if (isSessionDraftAssetPath(source, adaptersDir)) {
      throw new FastBrowserError(
        "FB_CASE_001",
        `Session draft cases cannot be saved directly from ${source}. Move the asset into src/adapters/${site}/cases first.`,
        "case"
      );
    }
  }

  for (const use of definition.uses) {
    const flowPath = path.join(adaptersDir, site, "flows", `${use.flow}.flow.json`);
    let flowDefinition: { id?: string; kind?: string };
    try {
      const raw = await fs.readFile(flowPath, "utf8");
      flowDefinition = JSON.parse(stripBom(raw)) as { id?: string; kind?: string };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        throw new FastBrowserError("FB_CASE_001", `Case flow reference not found: ${site}/${use.flow}`, "case");
      }
      throw error;
    }

    if (flowDefinition.kind !== "flow" || flowDefinition.id !== use.flow) {
      throw new FastBrowserError("FB_CASE_001", `Referenced flow id does not match file name: ${site}/${use.flow}`, "case");
    }
  }
}

function isSessionDraftAssetPath(source: string, adaptersDir: string): boolean {
  const root = path.dirname(path.dirname(adaptersDir));
  const sessionRoot = path.join(root, ".fast-browser", "sessions");
  const relative = path.relative(sessionRoot, path.resolve(source));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function validateRequiredParams(paramsDefinition: AdapterArg[] | undefined, params: Record<string, unknown>): void {
  for (const arg of paramsDefinition ?? []) {
    if (arg.required && params[arg.name] === undefined) {
      throw new FastBrowserError("FB_CASE_001", `Missing required case param: ${arg.name}`, "case");
    }
  }
}

function validateAdapterArgs(args: AdapterArg[] | undefined): void {
  for (const arg of args ?? []) {
    if (!arg.name?.trim()) {
      throw new FastBrowserError("FB_CASE_001", "Case param name is required", "case");
    }
    if (!["string", "number", "boolean"].includes(arg.type)) {
      throw new FastBrowserError("FB_CASE_001", `Unsupported case param type: ${arg.type}`, "case");
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
        throw new FastBrowserError("FB_CASE_001", `Unsupported case assertion type: ${(assertion as { type?: string }).type ?? "unknown"}`, "case");
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

async function listSiteCases(site: string, adaptersDir: string): Promise<CaseListItem[]> {
  const caseDir = path.join(adaptersDir, site, "cases");
  try {
    const entries = await fs.readdir(caseDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".case.json"))
      .map((entry) => ({
        site,
        caseId: entry.name.replace(/\.case\.json$/i, ""),
        path: path.join(caseDir, entry.name)
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

function parseCaseTarget(target: string): { site: string; caseId: string } {
  const [site, caseId] = target.split("/");
  if (!site || !caseId) {
    throw new FastBrowserError("FB_CASE_001", `Invalid case target: ${target}`, "case");
  }
  return { site, caseId };
}

async function executeAssertions(assertions: FlowAssertion[], handlers: CaseBuiltinHandlers): Promise<FlowAssertionResult[]> {
  const results: FlowAssertionResult[] = [];

  for (const [index, assertion] of assertions.entries()) {
    const result = await executeAssertion(assertion, index, handlers);
    if (!result.ok) {
      throw await buildAuthAwareCaseError(`Case assertion failed: ${assertion.type}`, handlers);
    }
    results.push(result);
  }

  return results;
}

async function buildAuthAwareCaseError(message: string, handlers: CaseBuiltinHandlers, cause?: unknown): Promise<FastBrowserError> {
  const hint = await buildAuthRecoveryHint(handlers.getUrl, handlers.getTitle);
  return new FastBrowserError("FB_CASE_002", hint ? `${message} ${hint}` : message, "case", false, cause);
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
    return "Current page looks like a login/auth page. Restore login in a fixed --session-id session, run fast-browser auth sync, then rerun this case from a stable post-login page.";
  } catch {
    return undefined;
  }
}

function looksLikeAuthPage(url: string, title: string): boolean {
  return /(login|signin|sign-in|log-?in|auth)/i.test(url) || /(login|sign in|signin|authenticate|auth)/i.test(title);
}

async function executeAssertion(assertion: FlowAssertion, index: number, handlers: CaseBuiltinHandlers): Promise<FlowAssertionResult> {
  switch (assertion.type) {
    case "urlIncludes": {
      if (!assertion.value) {
        throw new FastBrowserError("FB_CASE_001", "urlIncludes assertion requires value", "case");
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
        throw new FastBrowserError("FB_CASE_001", "selectorVisible assertion requires value", "case");
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
        throw new FastBrowserError("FB_CASE_001", "textIncludes assertion requires value", "case");
      }
      const actual = await handlers.getSnapshotText();
      return { index, type: assertion.type, value: assertion.value, ok: actual.includes(assertion.value), actual };
    }
    case "textNotIncludes": {
      if (!assertion.value) {
        throw new FastBrowserError("FB_CASE_001", "textNotIncludes assertion requires value", "case");
      }
      const actual = await handlers.getSnapshotText();
      return { index, type: assertion.type, value: assertion.value, ok: !actual.includes(assertion.value), actual };
    }
    case "selectorCountAtLeast": {
      if (!assertion.selector || assertion.count === undefined) {
        throw new FastBrowserError("FB_CASE_001", "selectorCountAtLeast assertion requires selector and count", "case");
      }
      const actual = await handlers.getSelectorCount(assertion.selector);
      return { index, type: assertion.type, selector: assertion.selector, count: assertion.count, ok: actual >= assertion.count, actual };
    }
    case "selectorCountEquals": {
      if (!assertion.selector || assertion.count === undefined) {
        throw new FastBrowserError("FB_CASE_001", "selectorCountEquals assertion requires selector and count", "case");
      }
      const actual = await handlers.getSelectorCount(assertion.selector);
      return { index, type: assertion.type, selector: assertion.selector, count: assertion.count, ok: actual === assertion.count, actual };
    }
    case "elementTextIncludes": {
      if (!assertion.selector || !assertion.value) {
        throw new FastBrowserError("FB_CASE_001", "elementTextIncludes assertion requires selector and value", "case");
      }
      const actual = await handlers.getElementText(assertion.selector);
      return { index, type: assertion.type, selector: assertion.selector, value: assertion.value, ok: actual.includes(assertion.value), actual };
    }
    case "elementTextEquals": {
      if (!assertion.selector || !assertion.value) {
        throw new FastBrowserError("FB_CASE_001", "elementTextEquals assertion requires selector and value", "case");
      }
      const actual = await handlers.getElementText(assertion.selector);
      return { index, type: assertion.type, selector: assertion.selector, value: assertion.value, ok: actual === assertion.value, actual };
    }
    case "storageValueEquals": {
      if (!assertion.storage || !assertion.key || assertion.value === undefined) {
        throw new FastBrowserError("FB_CASE_001", "storageValueEquals assertion requires storage, key, and value", "case");
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
        throw new FastBrowserError("FB_CASE_001", "networkRequestSeen assertion requires urlIncludes", "case");
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
      throw new FastBrowserError("FB_CASE_001", `Unsupported case assertion type: ${(assertion as { type?: string }).type ?? "unknown"}`, "case");
  }
}

function extractSelectorActual(result: unknown, fallback: string): unknown {
  if (result && typeof result === "object" && "selector" in result) {
    return (result as { selector?: unknown }).selector ?? fallback;
  }
  return fallback;
}

function formatJsonFile(value: unknown): string {
  return `\uFEFF${JSON.stringify(value, null, 2)}\n`;
}

function resolveTemplates(value: unknown, params: Record<string, unknown>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplates(item, params));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveTemplates(entry, params)]));
  }
  if (typeof value !== "string") {
    return value;
  }

  const exactMatch = value.match(/^\$\{params\.([A-Za-z0-9_-]+)\}$/);
  if (exactMatch) {
    return params[exactMatch[1]];
  }

  return value.replace(/\$\{params\.([A-Za-z0-9_-]+)\}/g, (_, name: string) => String(params[name] ?? ""));
}




