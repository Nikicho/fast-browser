import type {
  BrowserActionResult,
  BrowserConsoleEntry,
  BrowserNetworkEntry,
  BrowserSnapshotResult,
  RunDiagnosticsSummary
} from "./types";

export interface DiagnosticHandlers {
  resetDiagnostics?(): Promise<void>;
  getConsoleLogs?(): Promise<BrowserConsoleEntry[]>;
  getNetworkEntries?(): Promise<BrowserNetworkEntry[]>;
  captureSnapshot?(): Promise<BrowserSnapshotResult>;
  captureScreenshot?(): Promise<BrowserActionResult | { path?: string }>;
}

export async function resetRunDiagnostics(handlers: DiagnosticHandlers): Promise<void> {
  try {
    await handlers.resetDiagnostics?.();
  } catch {}
}

export async function collectRunDiagnostics(handlers: DiagnosticHandlers): Promise<RunDiagnosticsSummary | undefined> {
  const available: RunDiagnosticsSummary["available"] = [];
  let consoleLogs: BrowserConsoleEntry[] = [];
  let networkEntries: BrowserNetworkEntry[] = [];
  let snapshot: BrowserSnapshotResult | undefined;
  let screenshotPath: string | undefined;

  try {
    consoleLogs = await handlers.getConsoleLogs?.() ?? [];
    if (consoleLogs.length > 0) {
      available.push("console");
    }
  } catch {}

  try {
    networkEntries = await handlers.getNetworkEntries?.() ?? [];
    if (networkEntries.length > 0) {
      available.push("network");
    }
  } catch {}

  try {
    snapshot = await handlers.captureSnapshot?.();
    if (snapshot) {
      available.push("snapshot");
    }
  } catch {}

  try {
    const screenshot = await handlers.captureScreenshot?.();
    const path = typeof screenshot === "object" && screenshot && "path" in screenshot
      ? (screenshot as { path?: string }).path
      : undefined;
    if (path) {
      screenshotPath = path;
      available.push("screenshot");
    }
  } catch {}

  if (available.length === 0) {
    return undefined;
  }

  return {
    capturedAt: new Date().toISOString(),
    available,
    ...(consoleLogs.length > 0 ? { consoleCount: consoleLogs.length } : {}),
    ...(networkEntries.length > 0 ? { networkCount: networkEntries.length } : {}),
    ...(snapshot ? {
      snapshot: {
        url: snapshot.url,
        title: snapshot.title,
        interactiveCount: snapshot.interactive.length,
        textLength: snapshot.text.length
      }
    } : {}),
    ...(screenshotPath ? { screenshotPath } : {})
  };
}

export function withTracePath(
  diagnostics: RunDiagnosticsSummary | undefined,
  tracePath: string
): RunDiagnosticsSummary {
  const available = diagnostics?.available ?? [];
  return {
    capturedAt: diagnostics?.capturedAt ?? new Date().toISOString(),
    ...diagnostics,
    available: available.includes("trace") ? available : [...available, "trace"],
    tracePath
  };
}
