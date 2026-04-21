import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const APP_DIR_NAME = ".fast-browser";
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_CACHE_MAX_ENTRIES = 1_000;
export const DEFAULT_LOG_LEVEL = "info";

const FAST_BROWSER_ROOT_ENV = "FAST_BROWSER_ROOT";
const FAST_BROWSER_HOME_ENV = "FAST_BROWSER_HOME";
const FAST_BROWSER_SESSION_ENV = "FAST_BROWSER_SESSION_ID";
const CLI_ROOT = resolveCliRoot();
const MAX_SESSION_SCOPE_LENGTH = 80;
const KNOWN_SESSION_ENV_SOURCES: Array<{ prefix: string; names: string[] }> = [
  { prefix: "codex", names: ["CODEX_THREAD_ID", "CODEX_SESSION_ID"] },
  { prefix: "opencode", names: ["OPENCODE_SESSION_ID", "OPENCODE_THREAD_ID"] },
  { prefix: "claude", names: ["CLAUDE_SESSION_ID", "CLAUDE_THREAD_ID"] },
  { prefix: "gemini", names: ["GEMINI_SESSION_ID", "GEMINI_THREAD_ID"] }
];
const GENERIC_SESSION_ENV_PATTERNS = [/(?:^|_)THREAD_ID$/i, /(?:^|_)SESSION_ID$/i, /^TERM_SESSION_ID$/i, /^WT_SESSION$/i];
const GENERIC_SESSION_ENV_IGNORE = new Set([
  FAST_BROWSER_SESSION_ENV,
  FAST_BROWSER_ROOT_ENV,
  FAST_BROWSER_HOME_ENV,
  "FAST_BROWSER_SESSION_SCOPE"
]);
const WINDOWS_SESSION_CACHE = new Map<string, string | null>();
const SHELL_PROCESS_NAMES = new Set(["powershell.exe", "pwsh.exe", "cmd.exe", "bash.exe", "sh.exe", "zsh.exe"]);
const WINDOWS_HOST_PROCESS_NAMES: Array<{ prefix: string; names: string[] }> = [
  { prefix: "opencode", names: ["opencode-cli.exe", "opencode.exe"] },
  { prefix: "codex", names: ["codex.exe"] },
  { prefix: "claude", names: ["claude.exe"] }
];

export function getProjectRoot(): string {
  return resolveProjectRoot(process.cwd(), process.env[FAST_BROWSER_ROOT_ENV]);
}

export function resolveProjectRoot(_startDir: string, envRoot?: string): string {
  return resolveProjectRootInfo(envRoot).root;
}

export function resolveSessionId(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    platform?: NodeJS.Platform;
    ppid?: number;
    windowsSessionIdResolver?: (ppid: number) => string | undefined;
    shellSessionIdResolver?: (ppid: number) => string | undefined;
  } = {}
): string {
  const platform = options.platform ?? process.platform;
  const ppid = options.ppid ?? process.ppid;
  const explicit = normalizeSessionIdValue(env[FAST_BROWSER_SESSION_ENV]);
  if (explicit) {
    return explicit;
  }

  for (const source of KNOWN_SESSION_ENV_SOURCES) {
    for (const name of source.names) {
      const value = normalizeSessionIdValue(env[name]);
      if (value) {
        return `${source.prefix}:${value}`;
      }
    }
  }

  for (const [name, rawValue] of Object.entries(env)) {
    if (GENERIC_SESSION_ENV_IGNORE.has(name)) {
      continue;
    }
    if (!GENERIC_SESSION_ENV_PATTERNS.some((pattern) => pattern.test(name))) {
      continue;
    }
    const value = normalizeSessionIdValue(rawValue);
    if (!value) {
      continue;
    }
    const derivedPrefix = name.toLowerCase().replace(/_(thread|session)_id$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session";
    return `${derivedPrefix}:${value}`;
  }

  if (platform === "win32") {
    const hasInjectedResolver = typeof options.windowsSessionIdResolver === "function" || typeof options.shellSessionIdResolver === "function";
    const windowsSessionId = options.windowsSessionIdResolver?.(ppid)
      ?? options.shellSessionIdResolver?.(ppid)
      ?? (hasInjectedResolver ? undefined : detectWindowsProcessSessionId(ppid));
    if (windowsSessionId) {
      const colonIndex = windowsSessionId.indexOf(":");
      if (colonIndex > 0) {
        return windowsSessionId;
      }
      return `shell:${windowsSessionId}`;
    }
  }

  return `ppid:${ppid}`;
}

export function getWorkspaceInfo(_startDir = process.cwd(), envRoot = process.env[FAST_BROWSER_ROOT_ENV], env = process.env) {
  const resolution = resolveProjectRootInfo(envRoot);
  const root = resolution.root;
  const globalAppDir = getGlobalAppDir(env[FAST_BROWSER_HOME_ENV]);
  const sessionId = resolveSessionId(env);

  return {
    projectRoot: root,
    resolutionSource: resolution.source,
    sessionId,
    appDir: getAppDir(root, env[FAST_BROWSER_HOME_ENV]),
    sessionScopeDir: getSessionScopeDir(root, sessionId, env[FAST_BROWSER_HOME_ENV]),
    adaptersDir: getCustomAdaptersDir(root),
    cacheFilePath: getCacheFilePath(root, env[FAST_BROWSER_HOME_ENV]),
    sessionFilePath: getSessionFilePath(root, sessionId, env[FAST_BROWSER_HOME_ENV]),
    traceFilePath: getExecutionTraceFilePath(root, sessionId, env[FAST_BROWSER_HOME_ENV]),
    browserProfileDir: getBrowserProfileDir(globalAppDir),
    browserStateFilePath: getBrowserStateFilePath(globalAppDir),
    browserSessionStateFilePath: getBrowserSessionStateFilePath(globalAppDir, sessionId),
    globalAppDir
  };
}

export function getAppDir(_root = getProjectRoot(), home = process.env[FAST_BROWSER_HOME_ENV]): string {
  return getGlobalAppDir(home);
}

export function getGlobalAppDir(home = process.env[FAST_BROWSER_HOME_ENV]): string {
  const candidate = normalizeRootCandidate(home);
  if (candidate) {
    return candidate;
  }
  return path.join(os.homedir(), APP_DIR_NAME);
}

export function getCacheFilePath(root = getProjectRoot(), home = process.env[FAST_BROWSER_HOME_ENV]): string {
  return path.join(getAppDir(root, home), "cache", "memory-cache.json");
}

export function getSessionScopeDir(root = getProjectRoot(), sessionId = resolveSessionId(), home = process.env[FAST_BROWSER_HOME_ENV]): string {
  return path.join(getAppDir(root, home), "sessions", getSessionScopeName(sessionId));
}

export function getSessionFilePath(root = getProjectRoot(), sessionId = resolveSessionId(), home = process.env[FAST_BROWSER_HOME_ENV]): string {
  return path.join(getSessionScopeDir(root, sessionId, home), "store.json");
}

export function getBrowserStateFilePath(appDir = getGlobalAppDir()): string {
  return path.join(appDir, "sessions", "browser-state.json");
}

export function getBrowserSessionMetaStateFilePath(appDir = getGlobalAppDir(), sessionId = resolveSessionId()): string {
  return path.join(appDir, "sessions", "browser-meta", `${getSessionScopeName(sessionId)}.json`);
}

export function getBrowserSessionStateFilePath(appDir = getGlobalAppDir(), sessionId = resolveSessionId()): string {
  return path.join(appDir, "sessions", "browser", `${getSessionScopeName(sessionId)}.json`);
}

export function getExecutionTraceFilePath(root = getProjectRoot(), sessionId = resolveSessionId(), home = process.env[FAST_BROWSER_HOME_ENV]): string {
  return path.join(getSessionScopeDir(root, sessionId, home), "events.jsonl");
}

export function getBrowserProfileDir(appDir = getGlobalAppDir()): string {
  return path.join(appDir, "chrome-profile");
}

export function getBrowserSessionProfileDir(appDir = getGlobalAppDir(), sessionId = resolveSessionId()): string {
  return path.join(appDir, "chrome-profiles", getSessionScopeName(sessionId));
}

export function getScreenshotsDir(root = getProjectRoot(), home = process.env[FAST_BROWSER_HOME_ENV]): string {
  return path.join(getAppDir(root, home), "screenshots");
}

export function getCustomAdaptersDir(root = getProjectRoot()): string {
  return path.join(root, "src", "adapters");
}

export function getAdapterFlowsDir(site: string, root = getProjectRoot()): string {
  return path.join(getCustomAdaptersDir(root), site, "flows");
}

export function getFlowFilePath(site: string, flowId: string, root = getProjectRoot()): string {
  return path.join(getAdapterFlowsDir(site, root), `${flowId}.flow.json`);
}

export function getAdapterCasesDir(site: string, root = getProjectRoot()): string {
  return path.join(getCustomAdaptersDir(root), site, "cases");
}

export function getCaseFilePath(site: string, caseId: string, root = getProjectRoot()): string {
  return path.join(getAdapterCasesDir(site, root), `${caseId}.case.json`);
}

export function getSessionDraftCommandsDir(site: string, root = getProjectRoot(), sessionId = resolveSessionId(), home = process.env[FAST_BROWSER_HOME_ENV]): string {
  return path.join(getSessionScopeDir(root, sessionId, home), "drafts", "commands", site);
}

export function getCommandDraftFilePath(site: string, commandId: string, root = getProjectRoot(), sessionId = resolveSessionId(), home = process.env[FAST_BROWSER_HOME_ENV]): string {
  return path.join(getSessionDraftCommandsDir(site, root, sessionId, home), `${commandId}.command.draft.json`);
}

function resolveProjectRootInfo(envRoot?: string): { root: string; source: "env" | "package" } {
  const envCandidate = normalizeRootCandidate(envRoot);
  if (envCandidate) {
    return { root: envCandidate, source: "env" };
  }

  return { root: CLI_ROOT, source: "package" };
}

function resolveCliRoot(): string {
  let current = path.resolve(__dirname);
  while (true) {
    if (isFastBrowserPackageRoot(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Unable to resolve fast-browser package root");
    }
    current = parent;
  }
}

function normalizeRootCandidate(value: string | undefined): string | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  const msysMatch = trimmed.match(/^\/([a-zA-Z])\/(.*)$/);
  if (msysMatch) {
    const [, drive, rest] = msysMatch;
    return path.resolve(`${drive.toUpperCase()}:\\${rest.replace(/\//g, "\\")}`);
  }
  return path.resolve(trimmed);
}

function normalizeSessionIdValue(value: string | undefined): string | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }
  return value.trim();
}

function detectWindowsProcessSessionId(ppid: number): string | undefined {
  const cacheKey = String(ppid);
  if (WINDOWS_SESSION_CACHE.has(cacheKey)) {
    return WINDOWS_SESSION_CACHE.get(cacheKey) ?? undefined;
  }

  const chain = readWindowsProcessChain(ppid);
  for (const source of WINDOWS_HOST_PROCESS_NAMES) {
    const host = chain.find((processInfo) => source.names.includes(processInfo.name.toLowerCase()));
    if (host) {
      const shell = findDeepestShellProcess(chain, host.pid);
      const hostToken = `${normalizeProcessName(host.name)}-${host.pid}`;
      const shellToken = shell ? `${normalizeProcessName(shell.name)}-${shell.pid}` : undefined;
      const result = shellToken ? `${source.prefix}:${hostToken}-${shellToken}` : `${source.prefix}:${hostToken}`;
      WINDOWS_SESSION_CACHE.set(cacheKey, result);
      return result;
    }
  }

  const shell = findDeepestShellProcess(chain);
  const result = shell ? `${normalizeProcessName(shell.name)}-${shell.pid}` : null;
  WINDOWS_SESSION_CACHE.set(cacheKey, result);
  return result ?? undefined;
}

function readWindowsProcessChain(ppid: number): Array<{ pid: number; parentPid: number; name: string }> {
  if (!Number.isFinite(ppid) || ppid <= 0) {
    return [];
  }

  try {
    const script = [
      "$ErrorActionPreference='Stop'",
      `$pidValue=${Math.trunc(ppid)}`,
      "$items=@()",
      "while ($pidValue -gt 0) {",
      '  $process = Get-CimInstance Win32_Process -Filter ("ProcessId=$pidValue") | Select-Object ProcessId,ParentProcessId,Name',
      "  if (-not $process) { break }",
      "  $items += [PSCustomObject]@{ pid = [int]$process.ProcessId; parentPid = [int]$process.ParentProcessId; name = [string]$process.Name }",
      "  if ($process.ParentProcessId -eq $process.ProcessId) { break }",
      "  $pidValue = [int]$process.ParentProcessId",
      "}",
      "$items | ConvertTo-Json -Compress"
    ].join("; ");
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    }).trim();
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as { pid: number; parentPid: number; name: string } | Array<{ pid: number; parentPid: number; name: string }>;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function normalizeProcessName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "shell";
}

function findDeepestShellProcess(
  chain: Array<{ pid: number; parentPid: number; name: string }>,
  hostPid?: number
): { pid: number; parentPid: number; name: string } | undefined {
  return [...chain]
    .reverse()
    .find((processInfo) => SHELL_PROCESS_NAMES.has(processInfo.name.toLowerCase()) && processInfo.pid !== hostPid);
}

export function getSessionScopeName(sessionId: string): string {
  const normalized = sessionId
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "session";
  if (normalized.length <= MAX_SESSION_SCOPE_LENGTH) {
    return normalized;
  }
  const hash = crypto.createHash("sha1").update(sessionId).digest("hex").slice(0, 10);
  return `${normalized.slice(0, MAX_SESSION_SCOPE_LENGTH - hash.length - 1)}-${hash}`;
}

function isFastBrowserPackageRoot(candidate: string): boolean {
  const packageJsonPath = path.join(candidate, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { name?: string; bin?: Record<string, string> | string };
    if (parsed.name === "fast-browser") {
      return true;
    }
    if (typeof parsed.bin === "string") {
      return true;
    }
    return Boolean(parsed.bin && typeof parsed.bin === "object" && "fast-browser" in parsed.bin);
  } catch {
    return false;
  }
}







