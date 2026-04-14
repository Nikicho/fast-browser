import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getBrowserProfileDir,
  getBrowserSessionStateFilePath,
  getBrowserStateFilePath,
  getCustomAdaptersDir,
  getExecutionTraceFilePath,
  getGlobalAppDir,
  getProjectRoot,
  getSessionFilePath,
  getWorkspaceInfo,
  resolveSessionId
} from "../../../src/shared/constants";

function getFastBrowserRepoRoot(): string {
  let current = path.resolve(__dirname, "../../..");
  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    try {
      const raw = require("node:fs").readFileSync(packageJsonPath, "utf8");
      const parsed = JSON.parse(raw) as { name?: string };
      if (parsed.name === "fast-browser") {
        return current;
      }
    } catch {
      // continue walking
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Unable to find fast-browser repo root for test");
    }
    current = parent;
  }
}

describe("workspace root resolution", () => {
  const tempDirs: string[] = [];
  const originalCwd = process.cwd();
  const originalRoot = process.env.FAST_BROWSER_ROOT;
  const originalHome = process.env.FAST_BROWSER_HOME;
  const originalSessionId = process.env.FAST_BROWSER_SESSION_ID;
  const originalCodexThreadId = process.env.CODEX_THREAD_ID;
  const originalOpenCodeSessionId = process.env.OPENCODE_SESSION_ID;
  const repoRoot = getFastBrowserRepoRoot();

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalRoot === undefined) {
      delete process.env.FAST_BROWSER_ROOT;
    } else {
      process.env.FAST_BROWSER_ROOT = originalRoot;
    }
    if (originalHome === undefined) {
      delete process.env.FAST_BROWSER_HOME;
    } else {
      process.env.FAST_BROWSER_HOME = originalHome;
    }
    if (originalSessionId === undefined) {
      delete process.env.FAST_BROWSER_SESSION_ID;
    } else {
      process.env.FAST_BROWSER_SESSION_ID = originalSessionId;
    }
    if (originalCodexThreadId === undefined) {
      delete process.env.CODEX_THREAD_ID;
    } else {
      process.env.CODEX_THREAD_ID = originalCodexThreadId;
    }
    if (originalOpenCodeSessionId === undefined) {
      delete process.env.OPENCODE_SESSION_ID;
    } else {
      process.env.OPENCODE_SESSION_ID = originalOpenCodeSessionId;
    }
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("prefers FAST_BROWSER_ROOT over the package root", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-root-"));
    const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-other-"));
    tempDirs.push(rootDir, otherDir);

    process.env.FAST_BROWSER_ROOT = rootDir;
    process.chdir(otherDir);

    expect(getProjectRoot()).toBe(path.resolve(rootDir));
    expect(getCustomAdaptersDir()).toBe(path.join(path.resolve(rootDir), "src", "adapters"));
    expect(getWorkspaceInfo().resolutionSource).toBe("env");
  });

  it("defaults to the fast-browser package root regardless of cwd", async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-outside-"));
    tempDirs.push(outsideDir);

    delete process.env.FAST_BROWSER_ROOT;
    process.chdir(outsideDir);

    expect(getProjectRoot()).toBe(path.resolve(repoRoot));
    expect(getCustomAdaptersDir()).toBe(path.join(path.resolve(repoRoot), "src", "adapters"));
    expect(getWorkspaceInfo().resolutionSource).toBe("package");
  });

  it("uses session-scoped runtime files while keeping browser profile global", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-root-"));
    const browserHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), "fast-browser-home-"));
    tempDirs.push(rootDir, browserHomeDir);

    process.env.FAST_BROWSER_ROOT = rootDir;
    process.env.FAST_BROWSER_HOME = browserHomeDir;
    delete process.env.FAST_BROWSER_SESSION_ID;
    process.env.CODEX_THREAD_ID = "019d04e9-1098-75c0-8f7b-8b5b3db24771";
    delete process.env.OPENCODE_SESSION_ID;

    expect(getProjectRoot()).toBe(path.resolve(rootDir));
    expect(getGlobalAppDir()).toBe(path.resolve(browserHomeDir));
    expect(getBrowserProfileDir()).toBe(path.join(path.resolve(browserHomeDir), "chrome-profile"));
    expect(getBrowserStateFilePath()).toBe(path.join(path.resolve(browserHomeDir), "sessions", "browser-state.json"));
    expect(getBrowserSessionStateFilePath()).toBe(path.join(path.resolve(browserHomeDir), "sessions", "browser", "codex-019d04e9-1098-75c0-8f7b-8b5b3db24771.json"));
    expect(getCustomAdaptersDir()).toBe(path.join(path.resolve(rootDir), "src", "adapters"));
    expect(getSessionFilePath()).toBe(path.join(path.resolve(rootDir), ".fast-browser", "sessions", "codex-019d04e9-1098-75c0-8f7b-8b5b3db24771", "store.json"));
    expect(getExecutionTraceFilePath()).toBe(path.join(path.resolve(rootDir), ".fast-browser", "sessions", "codex-019d04e9-1098-75c0-8f7b-8b5b3db24771", "events.jsonl"));
    expect(getWorkspaceInfo()).toMatchObject({
      projectRoot: path.resolve(rootDir),
      adaptersDir: path.join(path.resolve(rootDir), "src", "adapters"),
      sessionId: "codex:019d04e9-1098-75c0-8f7b-8b5b3db24771",
      browserProfileDir: path.join(path.resolve(browserHomeDir), "chrome-profile"),
      browserStateFilePath: path.join(path.resolve(browserHomeDir), "sessions", "browser-state.json"),
      browserSessionStateFilePath: path.join(path.resolve(browserHomeDir), "sessions", "browser", "codex-019d04e9-1098-75c0-8f7b-8b5b3db24771.json"),
      sessionFilePath: path.join(path.resolve(rootDir), ".fast-browser", "sessions", "codex-019d04e9-1098-75c0-8f7b-8b5b3db24771", "store.json"),
      traceFilePath: path.join(path.resolve(rootDir), ".fast-browser", "sessions", "codex-019d04e9-1098-75c0-8f7b-8b5b3db24771", "events.jsonl")
    });
  });

  it("prefers explicit FAST_BROWSER_SESSION_ID over tool-specific session envs", () => {
    process.env.FAST_BROWSER_SESSION_ID = "manual-session";
    process.env.CODEX_THREAD_ID = "codex-thread";
    process.env.OPENCODE_SESSION_ID = "opencode-thread";

    expect(resolveSessionId()).toBe("manual-session");
    expect(getSessionFilePath()).toContain(`${path.sep}manual-session${path.sep}`);
  });

  it("derives session id from OpenCode env when explicit env is absent", () => {
    delete process.env.FAST_BROWSER_SESSION_ID;
    delete process.env.CODEX_THREAD_ID;
    process.env.OPENCODE_SESSION_ID = "opencode-run-42";

    expect(resolveSessionId()).toBe("opencode:opencode-run-42");
    expect(getExecutionTraceFilePath()).toContain(`${path.sep}opencode-opencode-run-42${path.sep}`);
  });

  it("combines the OpenCode host and the deepest shell on Windows to avoid session collisions", () => {
    delete process.env.FAST_BROWSER_SESSION_ID;
    delete process.env.CODEX_THREAD_ID;
    delete process.env.OPENCODE_SESSION_ID;

    expect(resolveSessionId({}, {
      platform: "win32",
      ppid: 52492,
      windowsSessionIdResolver: (ppid) => ppid === 52492 ? "opencode:opencode-cli-exe-26392-bash-exe-43404" : undefined
    })).toBe("opencode:opencode-cli-exe-26392-bash-exe-43404");
  });

  it("falls back to a stable shell session on Windows when tool env is absent", () => {
    delete process.env.FAST_BROWSER_SESSION_ID;
    delete process.env.CODEX_THREAD_ID;
    delete process.env.OPENCODE_SESSION_ID;

    expect(resolveSessionId({}, {
      platform: "win32",
      ppid: 52492,
      shellSessionIdResolver: (ppid) => ppid === 52492 ? "powershell-exe-26992" : undefined
    })).toBe("shell:powershell-exe-26992");
  });

  it("falls back to ppid when shell session detection has no result", () => {
    delete process.env.FAST_BROWSER_SESSION_ID;
    delete process.env.CODEX_THREAD_ID;
    delete process.env.OPENCODE_SESSION_ID;

    expect(resolveSessionId({}, {
      platform: "win32",
      ppid: 52492,
      shellSessionIdResolver: () => undefined
    })).toBe("ppid:52492");
  });
});



