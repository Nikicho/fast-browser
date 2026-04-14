import type { AdapterArg, BrowserRuntimeInspectResult, GuidePageKind } from "../../shared/types";

const SEARCH_PARAM_NAMES = new Set(["q", "query", "keyword", "keywords", "kw", "wd", "search", "text"]);
const PAGE_PARAM_NAMES = new Set(["page", "page_no", "page_num", "pageindex", "p", "pn"]);
const SORT_PARAM_NAMES = new Set(["sort", "order", "orderby"]);
const LIMIT_PARAM_NAMES = new Set(["limit", "size", "page_size", "pageSize", "per_page", "perPage"]);
const CATEGORY_PARAM_NAMES = new Set(["category", "tag", "type", "channel"]);
const ID_PARAM_NAMES = new Set(["id", "itemid", "item_id", "postid", "post_id", "videoid", "video_id"]);
const GENERIC_PATH_SEGMENTS = new Set(["", "home", "index", "search", "list", "feed", "discover", "popular", "hot", "top", "latest", "trending"]);
const DETAIL_PATH_HINTS = new Set(["article", "articles", "post", "posts", "item", "items", "product", "products", "video", "videos", "detail", "details", "question", "questions"]);
const LISTING_HINTS = ["search", "list", "feed", "popular", "hot", "top", "latest", "trending", "rank", "ranking", "discover"];

interface ParamSignal {
  query: boolean;
  page: boolean;
  sort: boolean;
  limit: boolean;
  category: boolean;
  id: boolean;
}

export function enrichInspection(rawInspection: BrowserRuntimeInspectResult): BrowserRuntimeInspectResult {
  const inspection = {
    ...rawInspection,
    suggestedEndpoints: [...rawInspection.suggestedEndpoints],
    resourceUrls: [...rawInspection.resourceUrls],
    interactiveSelectors: [...rawInspection.interactiveSelectors],
    formSelectors: [...rawInspection.formSelectors],
    notes: [...rawInspection.notes]
  };
  const candidates = [inspection.finalUrl, ...inspection.suggestedEndpoints].filter((value): value is string => Boolean(value));
  const paramSignal = collectParamSignals(candidates);
  const pageKind = inferPageKind(inspection, paramSignal);
  const suggestedArgs = buildSuggestedArgs(pageKind, inspection, paramSignal);
  const suggestedCommandName = suggestCommandName(pageKind);

  return {
    ...inspection,
    pageKind,
    suggestedCommandName,
    suggestedArgs,
    notes: [...inspection.notes, `page-kind:${pageKind}`]
  };
}

function collectParamSignals(values: string[]): ParamSignal {
  const signal: ParamSignal = {
    query: false,
    page: false,
    sort: false,
    limit: false,
    category: false,
    id: false
  };

  for (const value of values) {
    try {
      const url = new URL(value);
      for (const [key] of url.searchParams.entries()) {
        const normalized = key.toLowerCase();
        signal.query = signal.query || SEARCH_PARAM_NAMES.has(normalized);
        signal.page = signal.page || PAGE_PARAM_NAMES.has(normalized);
        signal.sort = signal.sort || SORT_PARAM_NAMES.has(normalized);
        signal.limit = signal.limit || LIMIT_PARAM_NAMES.has(normalized);
        signal.category = signal.category || CATEGORY_PARAM_NAMES.has(normalized);
        signal.id = signal.id || ID_PARAM_NAMES.has(normalized);
      }
    } catch {
      continue;
    }
  }

  return signal;
}

function inferPageKind(inspection: BrowserRuntimeInspectResult, signal: ParamSignal): GuidePageKind {
  const finalUrl = inspection.finalUrl ?? "";
  const pathname = safePathname(finalUrl);
  const normalizedPathname = pathname.toLowerCase();
  const titleText = (inspection.homepageTitle ?? "").toLowerCase();
  const hasSearchUiSignal = inspection.formSelectors.length > 0 && inspection.interactiveSelectors.some((selector) => {
    const normalizedSelector = selector.toLowerCase();
    return SEARCH_PARAM_NAMES.has(extractNameCandidate(normalizedSelector))
      || normalizedSelector.includes("search")
      || normalizedSelector.includes("query");
  });
  const hasSearchSignal = signal.query
    || normalizedPathname.includes("search")
    || titleText.includes("search")
    || hasSearchUiSignal;
  const hasListingSignal = inspection.interactiveSelectors.length >= 6 || LISTING_HINTS.some((hint) => normalizedPathname.includes(hint));
  const hasDetailSignal = signal.id || detectDetailSegment(pathname) !== undefined;

  if (inspection.formSelectors.length > 0 && hasSearchSignal) {
    return "search";
  }
  if (hasSearchSignal && (inspection.formSelectors.length > 0 || normalizedPathname.includes("search"))) {
    return "search";
  }
  if (hasDetailSignal) {
    return "detail";
  }
  if (inspection.formSelectors.length > 0) {
    return "form";
  }
  if (hasListingSignal) {
    return "listing";
  }
  return "generic";
}

function buildSuggestedArgs(pageKind: GuidePageKind, inspection: BrowserRuntimeInspectResult, signal: ParamSignal): AdapterArg[] {
  const args: AdapterArg[] = [];

  if (pageKind === "search") {
    args.push({ name: "query", type: "string", required: true, description: "Search query text." });
  }

  if (signal.page) {
    args.push({ name: "page", type: "number", required: false, description: "Pagination page number." });
  }
  if (signal.sort) {
    args.push({ name: "sort", type: "string", required: false, description: "Sort or ordering mode." });
  }
  if (signal.limit) {
    args.push({ name: "limit", type: "number", required: false, description: "Maximum items to return." });
  }
  if (signal.category && pageKind !== "detail") {
    args.push({ name: "category", type: "string", required: false, description: "Listing or channel filter." });
  }

  if (pageKind === "detail") {
    const detailArg = inferDetailArg(inspection.finalUrl);
    if (detailArg) {
      args.unshift(detailArg);
    }
  }

  return dedupeArgs(args);
}

function inferDetailArg(urlValue?: string): AdapterArg | undefined {
  const pathname = safePathname(urlValue ?? "");
  const detailSegment = detectDetailSegment(pathname);
  if (!detailSegment) {
    return { name: "id", type: "string", required: true, description: "Resource identifier." };
  }
  if (/^[0-9]+$/.test(detailSegment)) {
    return { name: "id", type: "string", required: true, description: "Resource identifier." };
  }
  return { name: "slug", type: "string", required: true, description: "Resource slug or opaque identifier." };
}

function detectDetailSegment(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }

  const last = segments[segments.length - 1];
  const previous = segments[segments.length - 2] ?? "";
  if (GENERIC_PATH_SEGMENTS.has(last.toLowerCase())) {
    return undefined;
  }
  if (DETAIL_PATH_HINTS.has(previous.toLowerCase())) {
    return last;
  }
  if (/^[0-9]{3,}$/.test(last)) {
    return last;
  }
  if (/^[A-Za-z0-9_-]{6,}$/.test(last) && !GENERIC_PATH_SEGMENTS.has(last.toLowerCase())) {
    return last;
  }
  return undefined;
}

function suggestCommandName(pageKind: GuidePageKind): string {
  switch (pageKind) {
    case "search":
      return "search";
    case "listing":
      return "list";
    case "detail":
      return "detail";
    case "form":
      return "submit";
    default:
      return "page";
  }
}

function safePathname(urlValue: string): string {
  try {
    return new URL(urlValue).pathname;
  } catch {
    return "";
  }
}

function dedupeArgs(args: AdapterArg[]): AdapterArg[] {
  const seen = new Set<string>();
  return args.filter((arg) => {
    if (seen.has(arg.name)) {
      return false;
    }
    seen.add(arg.name);
    return true;
  });
}

function extractNameCandidate(selector: string): string {
  const match = selector.match(/name=["']?([a-z0-9_-]+)/i);
  return match?.[1]?.toLowerCase() ?? selector;
}
