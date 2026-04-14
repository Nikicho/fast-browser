import type { AdapterContext } from "../../../shared/types";

import { collectVideoCards, summarizeCurrentPage } from "./_shared";

export async function openPopularRoute(params: Record<string, unknown>, context: AdapterContext) {
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const url = `https://www.bilibili.com/v/popular/history?page=${page}`;
  const openResult = await context.runtime.open(url);
  await context.runtime.waitForSelector('a[href*="/video/BV"]', { timeoutMs: 10_000, state: "visible" }).catch(() => undefined);
  const items = await collectVideoCards(context, 12);
  const summary = await summarizeCurrentPage(context, url, openResult.signal);

  return {
    page,
    items,
    ...summary
  };
}
