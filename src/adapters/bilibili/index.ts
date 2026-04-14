import type { Adapter, AdapterContext, AdapterResult } from "../../shared/types";
import { failureResult, successResult } from "../../core/result";

import { openFavoritesRoute } from "./commands/favorites";
import { openPopularRoute } from "./commands/popular";
import { openSearchRoute } from "./commands/search";
import { openVideoRoute } from "./commands/video";

const manifest: Adapter["manifest"] = {
  id: "bilibili",
  displayName: "Bilibili",
  version: "1.0.0",
  platform: "bilibili",
  description: "Bilibili adapter for search, popular, and video routes using the real browser runtime.",
  homepage: "https://www.bilibili.com",
  defaultTtlMs: 90_000,
  sessionPolicy: "optional",
  commands: [
    {
      name: "search",
      description: "Open a Bilibili search route and summarize visible video results.",
      args: [
        { name: "query", type: "string", required: true, description: "Search keyword.", defaultValue: "tavern ai" },
        { name: "page", type: "number", required: false, description: "Search results page.", defaultValue: 1 }
      ],
      example: "fast-browser site bilibili/search --query tavern ai --page 1",
      cacheable: false
    },
    {
      name: "favorites",
      description: "Open the logged-in user's Bilibili favorites page and summarize visible video cards.",
      args: [],
      example: "fast-browser site bilibili/favorites",
      cacheable: false
    },
    {
      name: "popular",
      description: "Open the Bilibili popular page and summarize visible ranking cards.",
      args: [
        { name: "page", type: "number", required: false, description: "Popular page number.", defaultValue: 1 }
      ],
      example: "fast-browser site bilibili/popular --page 1",
      cacheable: false
    },
    {
      name: "video",
      description: "Open a Bilibili video page by BVID and summarize the visible state.",
      args: [
        { name: "bvid", type: "string", required: true, description: "Video BVID.", defaultValue: "BV1xx411c7mD" }
      ],
      example: "fast-browser site bilibili/video --bvid BV1xx411c7mD",
      cacheable: false
    }
  ]
};

export function createBilibiliAdapter(): Adapter {
  return {
    manifest,
    async execute(commandName: string, params: Record<string, unknown>, context: AdapterContext): Promise<AdapterResult> {
      const startedAt = Date.now();

      try {
        if (commandName === "search") {
          return successResult("bilibili", commandName, await openSearchRoute(params, context), Date.now() - startedAt);
        }
        if (commandName === "favorites") {
          return successResult("bilibili", commandName, await openFavoritesRoute(params, context), Date.now() - startedAt);
        }
        if (commandName === "popular") {
          return successResult("bilibili", commandName, await openPopularRoute(params, context), Date.now() - startedAt);
        }
        if (commandName === "video") {
          return successResult("bilibili", commandName, await openVideoRoute(params, context), Date.now() - startedAt);
        }
        return failureResult("bilibili", commandName, new Error("Unsupported command"), Date.now() - startedAt);
      } catch (error) {
        return failureResult("bilibili", commandName, error, Date.now() - startedAt);
      }
    }
  };
}

export const adapter = createBilibiliAdapter();
export default { adapter };
