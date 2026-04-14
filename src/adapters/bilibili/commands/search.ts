import type { AdapterContext } from "../../../shared/types";

import { collectVideoCards, summarizeCurrentPage } from "./_shared";

const SHELL_ONLY_MARKERS = [
  "高级弹幕",
  "综合排序",
  "最多点击",
  "最多收藏"
];

function looksLikeHydrationShell(
  query: string,
  items: Array<{ text: string; href?: string }>,
  previewText: string
): boolean {
  const normalizedPreview = previewText.trim();
  const normalizedItems = items
    .map((item) => item.text.trim())
    .filter(Boolean);
  const hasMeaningfulItem = normalizedItems.some((text) => {
    const lowered = text.toLowerCase();
    return text.length >= 6
      && !SHELL_ONLY_MARKERS.includes(text)
      && !lowered.includes("高级弹幕")
      && !lowered.includes(query.toLowerCase());
  });
  const shellMarkerCount = SHELL_ONLY_MARKERS.filter((marker) => normalizedPreview.includes(marker)).length;
  return !hasMeaningfulItem && shellMarkerCount >= 2;
}

export async function openSearchRoute(params: Record<string, unknown>, context: AdapterContext) {
  const query = String(params.query ?? "").trim();
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  if (!query) {
    throw new Error("query is required");
  }

  const url = `https://search.bilibili.com/all?keyword=${encodeURIComponent(query)}&page=${page}`;
  const openResult = await context.runtime.open(url);
  await context.runtime.waitForSelector('a[href*="/video/BV"]', { timeoutMs: 10_000, state: "visible" }).catch(() => undefined);
  let items = await collectVideoCards(context, 12);
  let summary = await summarizeCurrentPage(context, url, openResult.signal);

  if (looksLikeHydrationShell(query, items, summary.previewText)) {
    const reloadResult = await context.runtime.reload();
    await context.runtime.waitForSelector('a[href*="/video/BV"]', { timeoutMs: 10_000, state: "visible" }).catch(() => undefined);
    items = await collectVideoCards(context, 12);
    summary = await summarizeCurrentPage(context, url, reloadResult.signal ?? openResult.signal);
  }

  return {
    query,
    page,
    items,
    ...summary
  };
}
