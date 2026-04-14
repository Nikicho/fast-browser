import type { BrowserRuntime, BrowserRuntimeInspectResult } from "../../shared/types";

export async function inspectSite(runtime: BrowserRuntime, url: string): Promise<BrowserRuntimeInspectResult> {
  return runtime.inspectSite(url);
}
