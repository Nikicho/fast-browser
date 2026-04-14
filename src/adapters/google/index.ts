import { load } from "cheerio";

import type { Adapter, AdapterContext, AdapterResult } from "../../shared/types";
import { failureResult, successResult } from "../../core/result";

interface GoogleSearchItem {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  cachedUrl?: string;
  similarUrl?: string;
}

interface GoogleSearchResult {
  query: string;
  page: number;
  num: number;
  total: number;
  items: GoogleSearchItem[];
}

// Realistic Chrome user-agent to avoid Google blocking
const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export function createGoogleAdapter(): Adapter {
  return {
    manifest: {
      id: "google",
      displayName: "Google",
      version: "1.1.0",
      platform: "google",
      description: "Search Google result pages and normalize result cards.",
      homepage: "https://www.google.com",
      defaultTtlMs: 300_000,
      commands: [
        {
          name: "search",
          description: "Search the public Google results page.",
          args: [
            {
              name: "query",
              type: "string",
              required: true,
              description: "Search query.",
              defaultValue: "fast browser"
            },
            {
              name: "page",
              type: "number",
              required: false,
              description: "Page number (0-indexed, each page = 10 results).",
              defaultValue: 0
            },
            {
              name: "num",
              type: "number",
              required: false,
              description: "Number of results to return (max 100).",
              defaultValue: 10
            }
          ],
          example: "fast-browser site google/search --query \"fast browser\" --page 0 --num 10",
          cacheable: true
        }
      ]
    },
    async execute(commandName: string, params: Record<string, unknown>, context: AdapterContext): Promise<AdapterResult> {
      const startedAt = Date.now();
      try {
        if (commandName !== "search") {
          return failureResult("google", commandName, new Error("Unsupported command"), Date.now() - startedAt);
        }

        const query = String(params.query ?? "");
        const page = Math.max(0, Number(params.page ?? 0));
        const num = Math.min(100, Math.max(1, Number(params.num ?? 10)));
        const start = page * 10;

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&start=${start}&num=${num}`;
        const html = await context.runtime.fetchHtml(searchUrl, {
          headers: {
            "user-agent": CHROME_UA,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "accept-encoding": "gzip, deflate, br"
          }
        });

        const $ = load(html);
        const items: GoogleSearchItem[] = [];
        let position = 0;

        // Main search results: a[href^='/url?q=']
        $("a[href^='/url?q=']").each((_, element) => {
          const href = $(element).attr("href");
          if (!href) return;

          const match = href.match(/^\/url\?q=([^&]+)/);
          if (!match) return;

          const url = decodeURIComponent(match[1]);
          // Skip Google internal URLs
          if (!url || url.startsWith("https://www.google.") || url.startsWith("https://maps.google.")) return;

          const title = $(element).find("h3").first().text().trim();
          if (!title) return;

          position++;

          // Extract domain from URL
          let domain = "";
          try {
            domain = new URL(url).hostname.replace(/^www\./, "");
          } catch { /* ignore */ }

          // Get snippet from parent container
          const container = $(element).closest("div");
          let snippet = container.find("div[data-sncf]").first().text().trim() ||
                        container.find("span").first().text().trim() ||
                        "";
          snippet = snippet.replace(/\s+/g, " ").slice(0, 240);

          // Extract additional links (cached, similar)
          let cachedUrl: string | undefined;
          let similarUrl: string | undefined;
          container.find("a[href]").each((_, link) => {
            const linkHref = $(link).attr("href") || "";
            const linkText = $(link).text().trim().toLowerCase();
            if (linkText.includes("cached") && linkHref.includes("/url?")) {
              const cachedMatch = linkHref.match(/q=([^&]+)/);
              if (cachedMatch) cachedUrl = decodeURIComponent(cachedMatch[1]);
            }
            if (linkText.includes("similar") && linkHref.includes("/url?")) {
              const similarMatch = linkHref.match(/q=([^&]+)/);
              if (similarMatch) similarUrl = decodeURIComponent(similarMatch[1]);
            }
          });

          items.push({
            position: start + position,
            title,
            url,
            domain,
            snippet,
            cachedUrl,
            similarUrl
          });
        });

        // Try to find total results count
        let totalResults = 0;
        const resultStats = $("div#result-stats").first().text().trim();
        const totalMatch = resultStats.match(/About ([\d,]+) results/);
        if (totalMatch) {
          totalResults = parseInt(totalMatch[1].replace(/,/g, ""), 10);
        }

        const result: GoogleSearchResult = {
          query,
          page,
          num,
          total: totalResults,
          items: items.slice(0, num)
        };

        return successResult("google", "search", result, Date.now() - startedAt);
      } catch (error) {
        return failureResult("google", commandName, error, Date.now() - startedAt);
      }
    }
  };
}
