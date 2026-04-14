import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../../src/cli/entrypoint";
import { FastBrowserError } from "../../../src/shared/errors";

describe("runCli", () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it("forces the CLI process to exit after main resolves", async () => {
    const exit = vi.fn();
    const runMain = vi.fn(async () => {
      process.exitCode = undefined;
    });

    await runCli(["fast-browser", "health"], { runMain, exit });

    expect(runMain).toHaveBeenCalledWith(["fast-browser", "health"]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("honors a non-zero process exit code set by the command path", async () => {
    const exit = vi.fn();
    const runMain = vi.fn(async () => {
      process.exitCode = 2;
    });

    await runCli(["fast-browser", "health"], { runMain, exit });

    expect(exit).toHaveBeenCalledWith(2);
  });

  it("prints a structured error and exits when main rejects", async () => {
    const exit = vi.fn();
    const stderr = vi.fn();
    const error = new FastBrowserError("FB_TEST", "boom", "cli");
    const runMain = vi.fn(async () => {
      throw error;
    });

    await runCli(["fast-browser", "health"], { runMain, exit, stderr });

    expect(stderr).toHaveBeenCalledWith(
      JSON.stringify(
        {
          success: false,
          error: {
            code: "FB_TEST",
            message: "boom",
            stage: "cli",
            retryable: false
          }
        },
        null,
        2
      )
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("treats commander help output as a successful exit", async () => {
    const exit = vi.fn();
    const stderr = vi.fn();
    const runMain = vi.fn(async () => {
      const error = new Error("(outputHelp)") as Error & { code: string; exitCode: number };
      error.code = "commander.helpDisplayed";
      error.exitCode = 0;
      throw error;
    });

    await runCli(["fast-browser", "--help"], { runMain, exit, stderr });

    expect(stderr).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });
});
