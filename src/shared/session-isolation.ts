import type { BrowserIsolationMode, SessionIdentitySource } from "./types";

export interface SessionIsolationInfo {
  mode: BrowserIsolationMode;
  source: SessionIdentitySource;
  reliable: boolean;
  notice: string;
}

const KNOWN_TOOL_PREFIXES = new Set(["codex", "opencode", "claude", "gemini"]);
const WINDOWS_HOST_SHELL_PATTERN = /^(codex|opencode|claude):.+-(powershell|pwsh|cmd|bash|sh|zsh)-exe-\d+$/i;

export function inferSessionIsolation(sessionId: string): SessionIsolationInfo {
  if (sessionId.startsWith("ppid:")) {
    return {
      mode: "session-clone",
      source: "ppid",
      reliable: false,
      notice: "Session identity came from parent process fallback. Fast-Browser will use an isolated browser instance and cloned profile. For agent tasks, prefer passing a stable --session-id on every command."
    };
  }

  if (sessionId.startsWith("shell:")) {
    return {
      mode: "session-clone",
      source: "windows-shell",
      reliable: false,
      notice: "Session identity came from shell process detection. Fast-Browser will use an isolated browser instance and cloned profile. For agent tasks, prefer passing a stable --session-id on every command."
    };
  }

  if (WINDOWS_HOST_SHELL_PATTERN.test(sessionId)) {
    return {
      mode: "session-clone",
      source: "windows-host-shell",
      reliable: false,
      notice: "Session identity came from Windows host+shell detection. Fast-Browser will use an isolated browser instance and cloned profile. For agent tasks, prefer passing a stable --session-id on every command."
    };
  }

  const colonIndex = sessionId.indexOf(":");
  if (colonIndex > 0) {
    const prefix = sessionId.slice(0, colonIndex).toLowerCase();
    const source: SessionIdentitySource = KNOWN_TOOL_PREFIXES.has(prefix) ? "tool-env" : "generic-env";
    return {
      mode: "session-clone",
      source,
      reliable: true,
      notice: "Session identity is reliable. Fast-Browser will use an isolated browser instance and cloned profile for this session."
    };
  }

  return {
    mode: "session-clone",
    source: "explicit",
    reliable: true,
    notice: "Session identity is explicit. Fast-Browser will use an isolated browser instance and cloned profile for this session."
  };
}
