import type {
  BrowserActionResult,
  ExecutionTraceCurrentResult,
  ExecutionTraceCurrentSegment,
  ExecutionTraceCurrentStep,
  ExecutionTraceDiscardedEntry,
  ExecutionTraceEntry,
  ExecutionTraceMarker,
  ExecutionTraceTargetResolution
} from "../shared/types";

const FLOW_SAFE_COMMANDS = new Set(["site", "open", "wait", "waitForSelector", "tabNew", "tabSwitch", "click", "fill", "press"]);
const COMMAND_CANDIDATE_COMMANDS = new Set(["click", "fill", "type", "press", "hover", "scroll", "gate", "collect", "extractBlocks"]);
const EXPLORATION_ONLY_COMMANDS = new Set(["snapshot", "evalExpression", "getUrl", "getTitle", "consoleLogs", "networkEntries"]);
const TERMINAL_MARKER_TYPES = new Set<ExecutionTraceMarker["type"]>(["goal_success", "goal_failed"]);

export function distillCurrentTraceSegment(segment: ExecutionTraceCurrentSegment): Omit<ExecutionTraceCurrentResult, "path"> {
  const boundedEntries = trimToTerminalMarker(segment.entries);
  const startMarker = boundedEntries.find((entry) => entry.kind === "marker" && entry.marker?.type === "goal_start") ?? segment.startMarker;
  const endMarker = [...boundedEntries].reverse().find((entry) => entry.kind === "marker" && entry.marker && TERMINAL_MARKER_TYPES.has(entry.marker.type)) ?? null;
  const checkpoints = boundedEntries.filter((entry) => entry.kind === "marker" && (entry.marker?.type === "checkpoint" || entry.marker?.type === "note"));
  const discarded: ExecutionTraceDiscardedEntry[] = [];
  const steps: ExecutionTraceCurrentStep[] = [];

  for (const entry of boundedEntries) {
    if (entry.kind !== "command") {
      continue;
    }
    if (!entry.ok) {
      discarded.push({ entryId: entry.id, command: entry.command, reason: "failed" });
      continue;
    }
    steps.push(distillCommandEntry(entry, steps.length));
  }

  return {
    startMarker,
    endMarker,
    status: deriveStatus(startMarker, endMarker),
    rawEntryCount: boundedEntries.length,
    checkpoints,
    discarded,
    entries: steps
  };
}

function trimToTerminalMarker(entries: ExecutionTraceEntry[]): ExecutionTraceEntry[] {
  let terminalIndex = -1;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.kind === "marker" && entry.marker && TERMINAL_MARKER_TYPES.has(entry.marker.type)) {
      terminalIndex = index;
      break;
    }
  }
  if (terminalIndex < 0) {
    return entries;
  }
  return entries.slice(0, terminalIndex + 1);
}

function deriveStatus(startMarker: ExecutionTraceEntry | null, endMarker: ExecutionTraceEntry | null): ExecutionTraceCurrentResult["status"] {
  if (!startMarker) {
    return "idle";
  }
  if (!endMarker?.marker) {
    return "in_progress";
  }
  if (endMarker.marker.type === "goal_success") {
    return "success";
  }
  if (endMarker.marker.type === "goal_failed") {
    return "failed";
  }
  return "in_progress";
}

function distillCommandEntry(entry: ExecutionTraceEntry, index: number): ExecutionTraceCurrentStep {
  const locator = extractLocator(entry);
  const notes = buildNotes(entry);
  return {
    index,
    entryId: entry.id,
    at: entry.at,
    command: entry.command,
    durationMs: entry.durationMs,
    summary: buildSummary(entry, locator),
    flowSafe: FLOW_SAFE_COMMANDS.has(entry.command),
    commandCandidate: COMMAND_CANDIDATE_COMMANDS.has(entry.command),
    input: entry.input,
    output: entry.output,
    ...(locator ? { locator } : {}),
    ...(notes.length > 0 ? { notes } : {})
  };
}

function extractLocator(entry: ExecutionTraceEntry): ExecutionTraceTargetResolution | undefined {
  const output = isBrowserActionResult(entry.output) ? entry.output : undefined;
  switch (entry.command) {
    case "click":
    case "type":
    case "fill":
    case "hover": {
      return createLocator(entry.input[0], output);
    }
    case "press": {
      const options = entry.input[1];
      if (!isRecord(options) || typeof options.target !== "string") {
        return undefined;
      }
      return createLocator(options.target, output);
    }
    case "scroll": {
      const target = entry.input[0];
      if (typeof target !== "string" || ["up", "down", "left", "right"].includes(target)) {
        return undefined;
      }
      return createLocator(target, output);
    }
    case "waitForSelector": {
      const target = entry.input[0];
      if (typeof target !== "string") {
        return undefined;
      }
      return {
        rawTarget: target,
        strategy: "selector",
        resolvedSelector: output?.selector ?? target,
        selectorCandidates: dedupeStrings(output?.selectorCandidates ?? [output?.selector ?? target])
      };
    }
    default:
      return undefined;
  }
}

function createLocator(target: unknown, output?: BrowserActionResult): ExecutionTraceTargetResolution | undefined {
  if (typeof target !== "string") {
    return undefined;
  }
  const resolvedSelector = output?.selector ?? (target.startsWith("@") ? undefined : target);
  const selectorCandidates = dedupeStrings(output?.selectorCandidates ?? (resolvedSelector ? [resolvedSelector] : []));
  return {
    rawTarget: target,
    strategy: target.startsWith("@") ? "snapshot_ref" : "selector",
    ...(resolvedSelector ? { resolvedSelector } : {}),
    ...(selectorCandidates.length > 0 ? { selectorCandidates } : {}),
    ...(output?.text ? { text: output.text } : {}),
    ...(output?.placeholder ? { placeholder: output.placeholder } : {}),
    ...(output?.role ? { role: output.role } : {}),
    ...(output?.ariaLabel ? { ariaLabel: output.ariaLabel } : {})
  };
}

function buildSummary(entry: ExecutionTraceEntry, locator?: ExecutionTraceTargetResolution): string {
  switch (entry.command) {
    case "site":
      return `执行站点命令 ${String(entry.input[0] ?? "")}`.trim();
    case "open":
      return `打开 ${String(entry.input[0] ?? "")}`.trim();
    case "wait":
      return `等待页面条件满足`;
    case "waitForSelector":
      return `等待元素 ${locator?.resolvedSelector ?? String(entry.input[0] ?? "")}`.trim();
    case "click":
      return `点击 ${describeLocator(locator)}`;
    case "type":
      return `输入 ${describeLocator(locator)}`;
    case "fill":
      return `填充 ${describeLocator(locator)}`;
    case "press":
      return `按键 ${String(entry.input[0] ?? "")}${locator ? ` -> ${describeLocator(locator)}` : ""}`.trim();
    case "hover":
      return `悬停 ${describeLocator(locator)}`;
    case "scroll":
      return locator ? `滚动到 ${describeLocator(locator)}` : `滚动页面 ${String(entry.input[0] ?? "")}`.trim();
    case "snapshot":
      return "采集页面快照（探索证据）";
    case "evalExpression":
      return "执行页面表达式（探索证据）";
    default:
      return `${entry.command}`;
  }
}

function describeLocator(locator?: ExecutionTraceTargetResolution): string {
  if (!locator) {
    return "目标元素";
  }
  if (locator.strategy === "snapshot_ref") {
    return `${locator.rawTarget}${locator.resolvedSelector ? ` -> ${locator.resolvedSelector}` : ""}`;
  }
  return locator.resolvedSelector ?? locator.rawTarget;
}

function buildNotes(entry: ExecutionTraceEntry): string[] {
  if (FLOW_SAFE_COMMANDS.has(entry.command)) {
    return [];
  }
  if (EXPLORATION_ONLY_COMMANDS.has(entry.command)) {
    return ["探索命令，不应直接进入已保存的 flow/case。"];
  }

  const notes: string[] = [];
  const output = isBrowserActionResult(entry.output) ? entry.output : undefined;
  if (COMMAND_CANDIDATE_COMMANDS.has(entry.command)) {
    notes.push("低层成功步骤；若稳定重复出现，应优先提升为 adapter command，再由 flow 复用。");
    if (output?.signal && !output.signal.urlChanged && !output.signal.titleChanged) {
      notes.push("未观测到明确页面级成功信号；提升前请确认这是稳定业务动作，而不只是一次 DOM 动作。");
    }
    return notes;
  }

  return ["非 flow 安全步骤；保存前请确认是否需要先提升为 command。"];
}

function isBrowserActionResult(value: unknown): value is BrowserActionResult {
  return isRecord(value) && value.ok === true && typeof value.url === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}



