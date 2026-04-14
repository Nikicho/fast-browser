import type { AdapterContext } from "../../../shared/types";

export async function followFeed(_params: Record<string, unknown>, _context: AdapterContext) {
  throw new Error("follow-feed is not enabled in the current built-in bilibili adapter")
}
