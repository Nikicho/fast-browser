import { toErrorShape } from "../shared/errors";

type MainRunner = (argv?: string[]) => Promise<void>;

type RunCliDeps = {
  runMain?: MainRunner;
  exit?: (code: number) => void;
  stderr?: (message?: unknown, ...optionalParams: unknown[]) => void;
  flush?: () => Promise<void>;
};

function loadMain(): MainRunner {
  return require("../index").main as MainRunner;
}

export async function runCli(argv = process.argv, deps: RunCliDeps = {}): Promise<void> {
  const runMain = deps.runMain ?? loadMain();
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const stderr = deps.stderr ?? console.error;
  const flush = deps.flush ?? flushStdStreams;

  try {
    await runMain(argv);
    await flush();
    exit(typeof process.exitCode === "number" ? process.exitCode : 0);
  } catch (error) {
    if (isCommanderExit(error)) {
      await flush();
      exit(error.exitCode);
      return;
    }

    stderr(JSON.stringify({ success: false, error: toErrorShape(error) }, null, 2));
    await flush();
    exit(1);
  }
}

function isCommanderExit(error: unknown): error is Error & { code: string; exitCode: number } {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && "exitCode" in error
    && typeof (error as { code?: unknown }).code === "string"
    && (error as { code: string }).code.startsWith("commander.")
    && typeof (error as { exitCode?: unknown }).exitCode === "number"
    && (error as { exitCode: number }).exitCode === 0
  );
}

async function flushStdStreams(): Promise<void> {
  await Promise.all([flushStream(process.stdout), flushStream(process.stderr)]);
}

function flushStream(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    try {
      stream.write("", () => resolve());
    } catch {
      resolve();
    }
  });
}
