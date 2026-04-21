import type { Logger } from "pino";

export type OutputMode = "text" | "json";
export type AdapterArgType = "string" | "number" | "boolean";
export type SessionPolicy = "none" | "optional" | "required";
export type GuidePageKind = "search" | "listing" | "detail" | "form" | "generic";
export type ErrorStage = "cli" | "registry" | "cache" | "runtime" | "adapter" | "guide" | "command" | "flow" | "case";
export type FlowBuiltinCommand = "open" | "wait" | "waitForSelector" | "tabNew" | "tabSwitch" | "click" | "fill" | "press";
export type SessionIdentitySource = "explicit" | "tool-env" | "generic-env" | "windows-host-shell" | "windows-shell" | "ppid";
export type BrowserIsolationMode = "shared" | "session-clone";
export type BrowserProfileKind = "base" | "session-clone";
export type BrowserLifecycleStatus = "active" | "idle" | "expired";
export type FlowAssertionType =
  | "urlIncludes"
  | "titleNotEmpty"
  | "selectorVisible"
  | "textIncludes"
  | "textNotIncludes"
  | "selectorCountAtLeast"
  | "selectorCountEquals"
  | "elementTextIncludes"
  | "elementTextEquals"
  | "storageValueEquals"
  | "networkRequestSeen";

export interface FastBrowserErrorShape {
  code: string;
  message: string;
  stage: ErrorStage;
  retryable: boolean;
  cause?: unknown;
  details?: unknown;
}

export type RunDiagnosticArtifact = "console" | "network" | "snapshot" | "screenshot" | "trace";

export interface RunDiagnosticsSummary {
  capturedAt: string;
  available: RunDiagnosticArtifact[];
  consoleCount?: number;
  networkCount?: number;
  snapshot?: {
    url: string;
    title: string;
    interactiveCount: number;
    textLength: number;
  };
  screenshotPath?: string;
  tracePath?: string;
}

export interface FlowFailureDetails {
  stage: "flow";
  site: string;
  flowId: string;
  failureType: "step" | "assertion";
  stepIndex?: number;
  stepType?: FlowStep["type"];
  command?: string;
  assertionIndex?: number;
  assertionType?: FlowAssertionType;
  diagnostics?: RunDiagnosticsSummary;
  cause?: FastBrowserErrorShape;
}

export interface CaseFailureDetails {
  stage: "case";
  site: string;
  caseId: string;
  failureType: "flow" | "assertion";
  useIndex?: number;
  useFlowId?: string;
  assertionIndex?: number;
  assertionType?: FlowAssertionType;
  flowFailure?: FlowFailureDetails;
  diagnostics?: RunDiagnosticsSummary;
  cause?: FastBrowserErrorShape;
}

export interface AdapterArg {
  name: string;
  type: AdapterArgType;
  required?: boolean;
  description?: string;
  defaultValue?: unknown;
}

export interface AdapterCommand {
  name: string;
  description: string;
  args: AdapterArg[];
  example: string;
  cacheable?: boolean;
}

export interface AdapterManifest {
  id: string;
  displayName: string;
  version: string;
  platform: string;
  description: string;
  homepage?: string;
  commands: AdapterCommand[];
  defaultTtlMs?: number;
  sessionPolicy?: SessionPolicy;
}

export interface AdapterResultMeta {
  adapterId: string;
  commandName: string;
  cached: boolean;
  timingMs: number;
}

export interface AdapterResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: FastBrowserErrorShape;
  meta: AdapterResultMeta;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expired: number;
  keys: number;
}

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ttlMs?: number; size?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  clear(namespace?: string): Promise<void>;
  stats(): Promise<CacheStats>;
}

export interface SessionStore {
  get<T>(namespace: string): Promise<T | null>;
  set<T>(namespace: string, value: T): Promise<void>;
  delete(namespace: string): Promise<void>;
}

export interface BrowserRuntimeInspectResult {
  finalUrl?: string;
  homepageTitle?: string;
  suggestedEndpoints: string[];
  resourceUrls: string[];
  interactiveSelectors: string[];
  formSelectors: string[];
  notes: string[];
  pageKind?: GuidePageKind;
  suggestedCommandName?: string;
  suggestedArgs?: AdapterArg[];
}

export interface BrowserSnapshotInput {
  tag: string;
  text: string;
  selector: string;
  interactive: boolean;
  className?: string;
  selectors?: string[];
  attributes?: Record<string, string>;
  placeholder?: string;
  role?: string;
  ariaLabel?: string;
  href?: string;
  name?: string;
  inputType?: string;
}

export interface BrowserSnapshotRef {
  ref: string;
  tag: string;
  text: string;
  selector: string;
  selectors?: string[];
  placeholder?: string;
  role?: string;
  ariaLabel?: string;
  href?: string;
  name?: string;
  inputType?: string;
}

export interface BrowserSnapshotResult {
  url: string;
  title: string;
  text: string;
  interactive: BrowserSnapshotRef[];
}

export interface BrowserConsoleEntry {
  type: string;
  text: string;
  time: number;
}

export interface BrowserNetworkEntry {
  url: string;
  method: string;
  status?: number;
  resourceType?: string;
  time: number;
}

export interface BrowserGateMatch {
  text: string;
  selector: string;
}

export interface BrowserGateResult {
  ok: true;
  handled: number;
  matches: BrowserGateMatch[];
  url: string;
  title?: string;
}

export interface BrowserCollectedItem {
  text: string;
  href?: string;
  selector?: string;
}

export interface BrowserCollectResult {
  ok: true;
  selector: string;
  items: BrowserCollectedItem[];
  rounds: number;
  url: string;
  title?: string;
}

export interface BrowserExtractedBlock {
  heading?: string;
  text: string;
  hrefs: string[];
}

export interface BrowserExtractBlocksResult {
  ok: true;
  blocks: BrowserExtractedBlock[];
  url: string;
  title?: string;
}

export interface BrowserTabEntry {
  id: string;
  url: string;
  title?: string;
  active: boolean;
}

export interface BrowserTabListResult {
  ok: true;
  tabs: BrowserTabEntry[];
}

export interface BrowserTabActionResult {
  ok: true;
  tab?: BrowserTabEntry;
  closed?: BrowserTabEntry;
  tabs?: BrowserTabEntry[];
}

export interface BrowserSessionState {
  updatedAt?: number;
  pageTargetId?: string;
  pageUrl?: string;
  pageTitle?: string;
  previousPageTargetId?: string;
  lastCreatedPageTargetId?: string;
  refs?: Array<{
    ref: string;
    selector: string;
    selectors?: string[];
    text?: string;
    tag?: string;
    placeholder?: string;
    role?: string;
    ariaLabel?: string;
    href?: string;
    name?: string;
    inputType?: string;
  }>;
  consoleLogs?: BrowserConsoleEntry[];
  networkEntries?: BrowserNetworkEntry[];
}

export interface BrowserState {
  debugPort?: number;
  lastUsedAt?: number;
  authSyncedAt?: number;
  authHydratedAt?: number;
  pinned?: boolean;
  pinnedAt?: number;
  wsEndpoint?: string;
  headless?: boolean;
  launchedAt?: number;
  lastNonBlankPageTargetId?: string;
  lastNonBlankPageUrl?: string;
  lastNonBlankPageTitle?: string;
  sessions?: Record<string, BrowserSessionState>;
  pageTargetId?: string;
  refs?: Array<{
    ref: string;
    selector: string;
    selectors?: string[];
    text?: string;
    tag?: string;
    placeholder?: string;
    role?: string;
    ariaLabel?: string;
    href?: string;
    name?: string;
    inputType?: string;
  }>;
  consoleLogs?: BrowserConsoleEntry[];
  networkEntries?: BrowserNetworkEntry[];
}

export interface BrowserActionSignal {
  settled: true;
  urlChanged: boolean;
  titleChanged: boolean;
}

export interface BrowserActionResult {
  ok: true;
  url: string;
  title?: string;
  selector?: string;
  selectorCandidates?: string[];
  text?: string;
  placeholder?: string;
  role?: string;
  ariaLabel?: string;
  signal?: BrowserActionSignal;
  isolationMode?: BrowserIsolationMode;
  sessionIdentitySource?: SessionIdentitySource;
  sessionIdentityReliable?: boolean;
  notice?: string;
  path?: string;
  value?: unknown;
}

export interface BrowserLaunchOptions {
  headless?: boolean;
  onProgress?: (message: string) => void;
}

export interface BrowserStatusResult {
  ok: true;
  running: boolean;
  mode: "headed" | "headless";
  profileDir: string;
  profileKind?: BrowserProfileKind;
  lastUsedAt?: string;
  authSyncedAt?: string;
  pinned?: boolean;
  pinnedAt?: string;
  lifecycleStatus?: BrowserLifecycleStatus;
  cleanupEligibleAt?: string;
  isolationMode?: BrowserIsolationMode;
  sessionIdentitySource?: SessionIdentitySource;
  sessionIdentityReliable?: boolean;
  notice?: string;
  sessionId?: string;
  debugPort?: number;
  wsEndpoint?: string;
  pageTargetId?: string;
  url?: string;
  title?: string;
}

export interface BrowserCloseResult {
  ok: true;
  closed: boolean;
}

export interface BrowserAuthSyncResult {
  ok: true;
  mode: BrowserIsolationMode;
  profileKind: BrowserProfileKind;
  profileDir: string;
  baseProfileDir: string;
  synced: boolean;
  authSyncedAt?: string;
  authSnapshotFilePath?: string;
  exportedCookies?: number;
  notice?: string;
}

export interface BrowserSessionCleanupResult {
  ok: true;
  ttlHours: number;
  removed: string[];
  kept: Array<{ sessionId: string; reason: string }>;
}

export interface BrowserSessionPinResult {
  ok: true;
  pinned: boolean;
  pinnedAt?: string;
  profileKind: BrowserProfileKind;
  profileDir: string;
}

export interface BrowserSessionStatusEntry {
  sessionId: string;
  sessionScope: string;
  current: boolean;
  running: boolean;
  profileKind: BrowserProfileKind;
  profileDir: string;
  browserStateFilePath: string;
  sessionStateFilePath: string;
  lastUsedAt?: string;
  authSyncedAt?: string;
  pinned?: boolean;
  pinnedAt?: string;
  lifecycleStatus: BrowserLifecycleStatus;
  cleanupEligibleAt?: string;
  isolationMode?: BrowserIsolationMode;
  sessionIdentitySource?: SessionIdentitySource;
  sessionIdentityReliable?: boolean;
  notice?: string;
  pageTargetId?: string;
  url?: string;
  title?: string;
}

export interface BrowserSessionStatusResult {
  ok: true;
  session: BrowserSessionStatusEntry;
}

export interface BrowserSessionListResult {
  ok: true;
  sessions: BrowserSessionStatusEntry[];
}

export interface BrowserRuntime {
  fetchJson<T>(url: string, init?: RequestInit): Promise<T>;
  fetchHtml(url: string, init?: RequestInit): Promise<string>;
  inspectSite(url: string): Promise<BrowserRuntimeInspectResult>;
  healthCheck(): Promise<{ ok: boolean; mode: string }>;
  open(url: string, options?: BrowserLaunchOptions): Promise<BrowserActionResult>;
  browserStatus(): Promise<BrowserStatusResult>;
  browserClose(): Promise<BrowserCloseResult>;
  authSync(): Promise<BrowserAuthSyncResult>;
  sessionPin(): Promise<BrowserSessionPinResult>;
  sessionUnpin(): Promise<BrowserSessionPinResult>;
  sessionStatus(): Promise<BrowserSessionStatusResult>;
  sessionList(): Promise<BrowserSessionListResult>;
  sessionCleanup(options?: { maxAgeHours?: number }): Promise<BrowserSessionCleanupResult>;
  snapshot(options?: { interactiveOnly?: boolean; selector?: string; maxItems?: number }): Promise<BrowserSnapshotResult>;
  click(target: string, options?: { timeoutMs?: number }): Promise<BrowserActionResult>;
  type(target: string, text: string, options?: { delayMs?: number }): Promise<BrowserActionResult>;
  fill(target: string, text: string, options?: { timeoutMs?: number }): Promise<BrowserActionResult>;
  press(key: string, options?: { target?: string }): Promise<BrowserActionResult>;
  hover(target: string, options?: { timeoutMs?: number }): Promise<BrowserActionResult>;
  scroll(targetOrDirection: string, amount?: number): Promise<BrowserActionResult>;
  screenshot(filePath?: string, options?: { fullPage?: boolean }): Promise<BrowserActionResult>;
  evalExpression(expression: string): Promise<BrowserActionResult>;
  goBack(): Promise<BrowserActionResult>;
  goForward(): Promise<BrowserActionResult>;
  reload(): Promise<BrowserActionResult>;
  getUrl(): Promise<string>;
  getTitle(): Promise<string>;
  wait(options: { ms?: number; text?: string; urlIncludes?: string; fn?: string }): Promise<BrowserActionResult>;
  waitUntilUrlContains(urlPart: string, options?: { timeoutMs?: number }): Promise<BrowserActionResult>;
  waitForSelector(selector: string, options?: { timeoutMs?: number; state?: "attached" | "visible" | "hidden" }): Promise<BrowserActionResult>;
  handleGate(options?: { text?: string }): Promise<BrowserGateResult>;
  collect(selector: string, options?: { limit?: number; scrollStep?: number; maxRounds?: number }): Promise<BrowserCollectResult>;
  extractBlocks(options?: { selector?: string; limit?: number }): Promise<BrowserExtractBlocksResult>;
  tabList(): Promise<BrowserTabListResult>;
  tabNew(url?: string): Promise<BrowserTabActionResult>;
  tabSwitch(target: string): Promise<BrowserTabActionResult>;
  tabClose(target?: string): Promise<BrowserTabActionResult>;
  consoleLogs(options?: { clear?: boolean }): Promise<{ logs: BrowserConsoleEntry[] }>;
  networkEntries(options?: { clear?: boolean }): Promise<{ entries: BrowserNetworkEntry[] }>;
  cookies(action?: "list" | "set" | "clear", options?: { name?: string; value?: string; url?: string }): Promise<unknown>;
  storage(kind: "localStorage" | "sessionStorage", action?: "list" | "get" | "set" | "remove" | "clear", key?: string, value?: string): Promise<unknown>;
  performanceMetrics(): Promise<unknown>;
}

export interface AdapterContext {
  runtime: BrowserRuntime;
  cache: CacheStore;
  logger: Logger;
  sessionStore: SessionStore;
  signal?: AbortSignal;
}

export interface Adapter {
  manifest: AdapterManifest;
  execute(commandName: string, params: Record<string, unknown>, context: AdapterContext): Promise<AdapterResult>;
  healthCheck?(context: AdapterContext): Promise<boolean>;
}

export interface SiteRequest {
  adapterId: string;
  commandName: string;
  params: Record<string, unknown>;
  useCache: boolean;
  output: OutputMode;
}

export interface FlowSiteStep {
  type: "site";
  command: string;
  with?: Record<string, unknown>;
}

export interface FlowInteractionTarget {
  selector: string;
  text?: string;
  placeholder?: string;
  role?: string;
  ariaLabel?: string;
}

export interface FlowBuiltinStep {
  type: "builtin";
  command: FlowBuiltinCommand;
  with?: Record<string, unknown>;
}

export type FlowStep = FlowSiteStep | FlowBuiltinStep;

export interface FlowAssertion {
  type: FlowAssertionType;
  value?: string;
  selector?: string;
  count?: number;
  storage?: "localStorage" | "sessionStorage";
  key?: string;
  urlIncludes?: string;
  method?: string;
  status?: number;
  resourceType?: string;
}

export interface FlowAssertionResult {
  index: number;
  type: FlowAssertionType;
  value?: string;
  selector?: string;
  count?: number;
  storage?: "localStorage" | "sessionStorage";
  key?: string;
  urlIncludes?: string;
  method?: string;
  status?: number;
  resourceType?: string;
  ok: boolean;
  actual?: unknown;
}

export interface FlowDefinition {
  id: string;
  kind: "flow";
  goal: string;
  params?: AdapterArg[];
  steps: FlowStep[];
  success?: FlowAssertion[];
}

export interface FlowListItem {
  site: string;
  flowId: string;
  path: string;
}

export interface FlowSaveResult {
  ok: true;
  site: string;
  flowId: string;
  path: string;
}

export interface FlowRunStepResult {
  index: number;
  type: FlowStep["type"];
  command: string;
  input: Record<string, unknown>;
  result: unknown;
  data?: unknown;
}

export interface FlowRunResult {
  ok: true;
  site: string;
  flowId: string;
  steps: FlowRunStepResult[];
  assertions?: FlowAssertionResult[];
}

export interface CaseUse {
  flow: string;
  with?: Record<string, unknown>;
}

export interface CaseDefinition {
  id: string;
  kind: "case";
  goal: string;
  params?: AdapterArg[];
  uses: CaseUse[];
  assertions?: FlowAssertion[];
}

export interface CaseListItem {
  site: string;
  caseId: string;
  path: string;
}

export interface CaseSaveResult {
  ok: true;
  site: string;
  caseId: string;
  path: string;
}

export interface CommandDraftDefinition {
  id: string;
  kind: "command-draft";
  site: string;
  goal: string;
  command: AdapterCommand;
  source: {
    tracePath: string;
    startMarkerId?: string;
    endMarkerId?: string;
    entry: ExecutionTraceCurrentStep;
  };
  implementation: {
    suggestedFile: string;
    suggestedExport: string;
    suggestedManifestCommand: AdapterCommand;
    suggestedSource: {
      path: string;
      content: string;
    };
    selector?: string;
    inputTemplate?: Record<string, unknown>;
    wiringNotes: string[];
    notes: string[];
  };
}

export interface CommandDraftSaveResult {
  ok: true;
  site: string;
  commandId: string;
  path: string;
  nextSuggestedCommand: string;
}

export interface CommandMaterializePatch {
  kind: "manifest" | "source" | "index";
  path: string;
  status: "create" | "update";
  summary: string;
  content: string;
}

export interface CommandMaterializeResult {
  ok: true;
  site: string;
  commandId: string;
  draftPath: string;
  patches: CommandMaterializePatch[];
  warnings: string[];
}

export interface CaseRunUseResult {
  index: number;
  flow: string;
  input: Record<string, unknown>;
  result: FlowRunResult;
  durationMs: number;
}

export interface CaseRunResult {
  ok: true;
  site: string;
  caseId: string;
  uses: CaseRunUseResult[];
  assertions?: FlowAssertionResult[];
  durationMs: number;
}

export interface ExecutionTraceEntry {
  id: string;
  at: string;
  kind: "command" | "marker";
  command: string;
  input: unknown[];
  ok: boolean;
  durationMs: number;
  output?: unknown;
  error?: FastBrowserErrorShape;
  marker?: ExecutionTraceMarker;
}

export interface ExecutionTraceLatestResult {
  path: string;
  entries: ExecutionTraceEntry[];
}

export interface ExecutionTraceMarker {
  type: "goal_start" | "goal_success" | "goal_failed" | "checkpoint" | "note";
  label: string;
  data?: Record<string, unknown>;
}

export interface ExecutionTraceTargetResolution {
  rawTarget: string;
  strategy: "snapshot_ref" | "selector";
  resolvedSelector?: string;
  selectorCandidates?: string[];
  text?: string;
  placeholder?: string;
  role?: string;
  ariaLabel?: string;
}

export interface ExecutionTraceCurrentStep {
  index: number;
  entryId: string;
  at: string;
  command: string;
  durationMs: number;
  summary: string;
  flowSafe: boolean;
  commandCandidate: boolean;
  input: unknown[];
  output?: unknown;
  locator?: ExecutionTraceTargetResolution;
  notes?: string[];
}

export interface ExecutionTraceDiscardedEntry {
  entryId: string;
  command: string;
  reason: "failed";
}

export interface ExecutionTraceCurrentSegment {
  startMarker: ExecutionTraceEntry | null;
  entries: ExecutionTraceEntry[];
}

export interface ExecutionTraceCurrentResult {
  path: string;
  startMarker: ExecutionTraceEntry | null;
  endMarker: ExecutionTraceEntry | null;
  status: "idle" | "in_progress" | "success" | "failed";
  rawEntryCount: number;
  checkpoints: ExecutionTraceEntry[];
  discarded: ExecutionTraceDiscardedEntry[];
  entries: ExecutionTraceCurrentStep[];
}

export interface TraceCurrentSaveContext {
  at: string;
  path: string;
  status: ExecutionTraceCurrentResult["status"];
  rawEntryCount: number;
  startMarkerId?: string;
  endMarkerId?: string;
}

export interface GuideAnswers {
  platform: string;
  url: string;
  capability: string;
  requiresLogin: boolean;
  strategy: "auto" | "network" | "dom";
  commandName: string;
  cacheable: boolean;
  ttlSeconds: number;
  runTest: boolean;
}

export interface GuidePlan {
  platform: string;
  files: string[];
  testCommand: string;
  strategy: {
    source: "network" | "dom";
    endpoint?: string;
  };
  manifest: AdapterManifest;
  sourceFiles: Record<string, string>;
  inspection: BrowserRuntimeInspectResult;
}

export interface GuideScaffoldResult extends GuidePlan {
  rootDir: string;
  smokeTest?: {
    ok: boolean;
    output?: string;
  };
}

export interface GuidePromptDependencies {
  prompt(initial?: Partial<GuideAnswers>): Promise<GuideAnswers>;
  inspectSite(url: string): Promise<BrowserRuntimeInspectResult>;
}

















