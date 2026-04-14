import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accessMock = vi.fn(async () => undefined);
const mkdirMock = vi.fn(async () => undefined);
const spawnMock = vi.fn();

vi.mock("node:fs/promises", () => {
  const api = {
    access: accessMock,
    mkdir: mkdirMock,
    readdir: vi.fn(async () => []),
    readFile: vi.fn(async () => ""),
    writeFile: vi.fn(async () => undefined),
    copyFile: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined)
  };
  return { default: api, ...api };
});

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

describe("BrowserRuntimeFacade launchChrome on Windows", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetModules();
    accessMock.mockReset();
    mkdirMock.mockReset();
    spawnMock.mockReset();
    accessMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    spawnMock.mockImplementation(() => {
      const child = {
        unref: vi.fn(),
        once: vi.fn((event, handler) => {
          if (event === 'spawn') handler();
          return child;
        })
      };
      return child;
    });
    Object.defineProperty(process, "platform", { value: "win32" });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("spawns Chrome directly instead of wrapping launch through PowerShell", async () => {
    const { BrowserRuntimeFacade } = await import("../../../src/runtime/browser-runtime");
    const runtime = new BrowserRuntimeFacade({ stateFilePath: "D:/tmp/state.json", sessionStateFilePath: "D:/tmp/session.json", sessionId: "win-launch" }) as any;

    await runtime.launchChrome(45690, false, "C:/tmp/profile");

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      expect.arrayContaining([
        "--remote-debugging-port=45690",
        "--user-data-dir=C:/tmp/profile",
        "about:blank"
      ]),
      expect.objectContaining({ detached: true, stdio: "ignore", windowsHide: true })
    );
  });
});
