import type { BrowserRuntimeInspectResult, GuideAnswers } from "../../shared/types";

const BACKGROUND_ENDPOINT_HINTS = ["showstatus", "heartbeat", "metric", "metrics", "report", "tracking", "track", "logger", "logging", "monitor", "health", "status", "config", "abtest"];
const SEARCH_ENDPOINT_HINTS = ["search", "topic", "suggest", "keyword", "user_info"];
const DETAIL_ENDPOINT_HINTS = ["detail", "item", "post", "video", "article"];
const LISTING_ENDPOINT_HINTS = ["list", "feed", "rank", "popular", "hot", "discover"];

export function chooseStrategy(answers: GuideAnswers, inspection: BrowserRuntimeInspectResult) {
  const ranked = rankEndpoints(inspection);
  const best = ranked[0];

  if (answers.strategy === "network") {
    return { source: "network" as const, endpoint: best?.endpoint ?? inspection.suggestedEndpoints[0] };
  }

  if (answers.strategy === "dom") {
    return { source: "dom" as const };
  }

  if (best && best.score > 0) {
    return { source: "network" as const, endpoint: best.endpoint };
  }

  return { source: "dom" as const };
}

function rankEndpoints(inspection: BrowserRuntimeInspectResult): Array<{ endpoint: string; score: number }> {
  return inspection.suggestedEndpoints
    .map((endpoint) => ({ endpoint, score: scoreEndpoint(endpoint, inspection) }))
    .sort((left, right) => right.score - left.score);
}

function scoreEndpoint(endpoint: string, inspection: BrowserRuntimeInspectResult): number {
  const normalized = endpoint.toLowerCase();
  const pageKind = inspection.pageKind ?? "generic";
  let score = 0;

  if (normalized.includes("/api/")) {
    score += 1;
  }
  if (pageKind === "search" && SEARCH_ENDPOINT_HINTS.some((hint) => normalized.includes(hint))) {
    score += 4;
  }
  if (pageKind === "detail" && DETAIL_ENDPOINT_HINTS.some((hint) => normalized.includes(hint))) {
    score += 3;
  }
  if (pageKind === "listing" && LISTING_ENDPOINT_HINTS.some((hint) => normalized.includes(hint))) {
    score += 2;
  }
  if (pageKind === "generic" && inspection.interactiveSelectors.length === 0 && inspection.formSelectors.length === 0) {
    score -= 1;
  }
  if (pageKind !== "search" && SEARCH_ENDPOINT_HINTS.some((hint) => normalized.includes(hint))) {
    score -= 3;
  }
  if (BACKGROUND_ENDPOINT_HINTS.some((hint) => normalized.includes(hint))) {
    score -= 4;
  }

  return score;
}