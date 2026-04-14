import pino, { type Logger, type LevelWithSilent } from "pino";

export function createLogger(level: LevelWithSilent = "info"): Logger {
  return pino({
    level,
    base: undefined
  });
}
