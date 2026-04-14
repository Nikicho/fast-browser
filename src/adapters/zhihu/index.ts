import type { Adapter, AdapterContext, AdapterResult } from "../../shared/types";
import { failureResult, successResult } from "../../core/result";

const manifest: Adapter["manifest"] = {
  id: "zhihu",
  displayName: "Zhihu",
  version: "0.1.0",
  platform: "zhihu",
  description: "Login-aware Zhihu adapter for hot, search, and question entry points.",
  homepage: "https://www.zhihu.com",
  defaultTtlMs: 90_000,
  sessionPolicy: "optional",
  commands: []
};

export const adapter: Adapter = {
  manifest,
  async execute(commandName: string, params: Record<string, unknown>, context: AdapterContext): Promise<AdapterResult> {
    const startedAt = Date.now();

    try {
      if (commandName === "hot") {
        return await executeHot(startedAt, context);
      }
      if (commandName === "search") {
        return await executeSearch(params, startedAt, context);
      }
      if (commandName === "question") {
        return await executeQuestion(params, startedAt, context);
      }
      return failureResult("zhihu", commandName, new Error("Unsupported command"), Date.now() - startedAt);
    } catch (error) {
      return failureResult("zhihu", commandName, error, Date.now() - startedAt);
    }
  }
};

export default { adapter };

async function executeHot(startedAt: number, context: AdapterContext): Promise<AdapterResult> {
  return openAndSummarize({
    adapterId: "zhihu",
    commandName: "hot",
    url: "https://www.zhihu.com/hot",
    startedAt,
    context,
    extra: {}
  });
}

async function executeSearch(params: Record<string, unknown>, startedAt: number, context: AdapterContext): Promise<AdapterResult> {
  const query = String(params.query ?? "").trim();
  if (!query) {
    throw new Error("query is required");
  }
  const url = `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(query)}`;
  return openAndSummarize({
    adapterId: "zhihu",
    commandName: "search",
    url,
    startedAt,
    context,
    extra: { query }
  });
}

async function executeQuestion(params: Record<string, unknown>, startedAt: number, context: AdapterContext): Promise<AdapterResult> {
  const questionId = Number(params.questionId ?? 0);
  if (!Number.isFinite(questionId) || questionId <= 0) {
    throw new Error("questionId is required");
  }
  const url = `https://www.zhihu.com/question/${questionId}`;
  return openAndSummarize({
    adapterId: "zhihu",
    commandName: "question",
    url,
    startedAt,
    context,
    extra: { questionId }
  });
}

async function openAndSummarize(options: {
  adapterId: string;
  commandName: string;
  url: string;
  startedAt: number;
  context: AdapterContext;
  extra: Record<string, unknown>;
}): Promise<AdapterResult> {
  const { adapterId, commandName, url, startedAt, context, extra } = options;
  const openResult = await context.runtime.open(url);
  const currentUrl = await context.runtime.getUrl();
  const currentTitle = await context.runtime.getTitle();
  const snapshot = await context.runtime.snapshot({ interactiveOnly: true, maxItems: 60 });
  const analysis = await context.runtime.evalExpression(`(() => {
    const bodyText = (document.body?.innerText || document.body?.textContent || "").trim();
    const preText = document.querySelector("pre")?.textContent?.trim() || "";
    const answerCount = document.querySelectorAll(".List-item, .AnswerItem, [data-zop-question-answer]").length;
    const searchCount = document.querySelectorAll(".SearchResult-Card, .List-item, [data-za-detail-view-element_name='SearchResultItem']").length;
    const hotCount = document.querySelectorAll(".HotItem, .HotList-item, [data-za-detail-view-path-module='HotList']").length;
    return {
      bodyText,
      preText,
      answerCount,
      searchCount,
      hotCount,
      hasSignInForm: Boolean(document.querySelector("form input[name='username'], .SignFlow, .SignContainer-content"))
    };
  })()`);
  const data = typeof analysis.value === "object" && analysis.value ? analysis.value as {
    bodyText?: string;
    preText?: string;
    answerCount?: number;
    searchCount?: number;
    hotCount?: number;
    hasSignInForm?: boolean;
  } : {};

  const antiBotMessage = extractAntiBotMessage(data.preText);
  const loginRequired = currentUrl.includes("/signin") || Boolean(data.hasSignInForm);

  return successResult(
    adapterId,
    commandName,
    {
      ...extra,
      requestedUrl: url,
      finalUrl: currentUrl,
      title: currentTitle || openResult.title,
      loginRequired,
      antiBot: Boolean(antiBotMessage),
      antiBotMessage,
      routeReached: currentUrl.startsWith("https://www.zhihu.com/"),
      interactiveCount: snapshot.interactive.length,
      previewText: snapshot.text.slice(0, 240),
      answerCount: data.answerCount ?? 0,
      resultCount: data.searchCount ?? 0,
      hotCount: data.hotCount ?? 0,
      signal: openResult.signal
    },
    Date.now() - startedAt
  );
}

function extractAntiBotMessage(preText?: string): string | null {
  if (!preText) {
    return null;
  }
  try {
    const parsed = JSON.parse(preText) as { error?: { message?: string } };
    return parsed.error?.message ?? null;
  } catch {
    return null;
  }
}
