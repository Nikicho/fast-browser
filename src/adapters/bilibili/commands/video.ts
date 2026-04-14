import type { AdapterContext } from "../../../shared/types";

import { summarizeCurrentPage } from "./_shared";

export async function openVideoRoute(params: Record<string, unknown>, context: AdapterContext) {
  const bvid = String(params.bvid ?? "").trim();
  if (!bvid) {
    throw new Error("bvid is required");
  }

  const url = `https://www.bilibili.com/video/${encodeURIComponent(bvid)}`;
  const openResult = await context.runtime.open(url);
  await context.runtime.waitForSelector('h1, [title], video', { timeoutMs: 10_000, state: "visible" }).catch(() => undefined);
  const summary = await summarizeCurrentPage(context, url, openResult.signal);
  const detail = await context.runtime.evalExpression(`(() => {
    const title = document.querySelector('h1')?.textContent?.trim() || document.title || '';
    const author = document.querySelector('a[href*="/space."]')?.textContent?.trim() || '';
    return { title, author };
  })()`);
  const data = typeof detail.value === 'object' && detail.value ? detail.value as { title?: string; author?: string } : {};

  return {
    bvid,
    videoTitle: data.title ?? summary.title,
    author: data.author ?? '',
    ...summary
  };
}
