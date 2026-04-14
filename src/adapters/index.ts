import type { Adapter, BrowserRuntime } from "../shared/types";

import { createGithubAdapter } from "./github";
import { createGoogleAdapter } from "./google";

export { createGithubAdapter, createGoogleAdapter };

export function createBuiltInAdapters(_runtime?: BrowserRuntime): Adapter[] {
  return [
    createGithubAdapter(),
    createGoogleAdapter()
  ];
}
