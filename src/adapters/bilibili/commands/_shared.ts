import type { AdapterContext, BrowserActionSignal } from "../../../shared/types";

export interface BilibiliCard {
  text: string;
  href?: string;
  selector?: string;
}

export interface BilibiliRouteSummary {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  routeReached: boolean;
  interactiveCount: number;
  previewText: string;
  signal?: BrowserActionSignal;
}

export async function collectVideoCards(context: AdapterContext, limit = 10): Promise<BilibiliCard[]> {
  const result = await context.runtime.collect('a[href*="/video/BV"]', { limit, scrollStep: 800, maxRounds: 2 });
  return result.items;
}

export async function summarizeCurrentPage(context: AdapterContext, requestedUrl: string, signal?: BrowserActionSignal): Promise<BilibiliRouteSummary> {
  const finalUrl = await context.runtime.getUrl();
  const title = await context.runtime.getTitle();
  const snapshot = await context.runtime.snapshot({ interactiveOnly: true, maxItems: 120 });
  return {
    requestedUrl,
    finalUrl,
    title,
    routeReached: finalUrl.includes('bilibili.com'),
    interactiveCount: snapshot.interactive.length,
    previewText: snapshot.text.slice(0, 240),
    signal
  };
}
