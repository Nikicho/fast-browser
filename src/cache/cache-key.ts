import { sha1 } from "../utils/hash";
import { stableStringify } from "../utils/json";

export function buildCacheKey(
  adapterId: string,
  commandName: string,
  params: Record<string, unknown>
): string {
  return `fast-browser:${adapterId}:${commandName}:${sha1(stableStringify(params))}`;
}
