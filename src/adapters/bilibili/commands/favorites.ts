import type { AdapterContext, BrowserSnapshotRef } from "../../../shared/types";

import { summarizeCurrentPage } from "./_shared";

interface BilibiliFavoriteItem {
  title: string;
  meta?: string;
  selector?: string;
}

function extractOwnerMid(cookies: unknown): string {
  if (!Array.isArray(cookies)) {
    return "";
  }
  const entry = cookies.find((item) => {
    if (!item || typeof item !== "object") return false;
    return "name" in item && "value" in item && (item as { name?: string }).name === "DedeUserID";
  }) as { value?: unknown } | undefined;
  return String(entry?.value ?? "").trim();
}

function looksLikeMetricCard(text: string): boolean {
  const raw = text.trim();
  const normalized = raw.replace(/\s+/g, " ").trim();
  return /\d/.test(normalized) && /video\/BV|BV/i.test(normalized) === false && raw.includes("\n");
}

function extractFavoriteItems(interactive: BrowserSnapshotRef[], limit = 12): BilibiliFavoriteItem[] {
  const items: BilibiliFavoriteItem[] = [];
  for (let index = 0; index < interactive.length; index += 1) {
    const current = interactive[index];
    const next = interactive[index + 1];
    const third = interactive[index + 2];
    if (!current || !next) continue;
    if (!looksLikeMetricCard(current.text)) continue;
    const title = next.text.trim();
    if (!title || title.length < 6 || title.includes("收藏于")) continue;
    const meta = third?.text?.includes("收藏于") ? third.text.trim() : undefined;
    if (!meta) continue;
    items.push({
      title,
      meta,
      selector: next.selector
    });
    if (items.length >= limit) break;
  }
  return items;
}

export async function openFavoritesRoute(_params: Record<string, unknown>, context: AdapterContext) {
  const cookies = await context.runtime.cookies("list");
  const ownerMid = extractOwnerMid(cookies);
  if (!ownerMid) {
    throw new Error("DedeUserID cookie is required. Please log in to Bilibili first.");
  }

  const url = `https://space.bilibili.com/${encodeURIComponent(ownerMid)}/favlist`;
  const openResult = await context.runtime.open(url);
  await context.runtime.waitForSelector('a[href*="/video/BV"]', { timeoutMs: 10_000, state: "visible" }).catch(() => undefined);

  const summary = await summarizeCurrentPage(context, url, openResult.signal);
  const snapshot = await context.runtime.snapshot({ interactiveOnly: true, maxItems: 220 });
  const items = extractFavoriteItems(snapshot.interactive, 12);

  return {
    ownerMid,
    loginRequired: false,
    items,
    ...summary
  };
}
