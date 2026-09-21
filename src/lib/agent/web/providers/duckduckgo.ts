import { assertSafeHttpsUrl } from "../safety";
import { SEARCH_MAX_RESULTS, type WebSearchHit, type WebSearchOptions } from "../types";
import type { WebFetchService } from "../WebFetchService";
import type { SearchProvider } from "./SearchProvider";

export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly id = "duckduckgo";

  constructor(private readonly fetch: WebFetchService) {}

  async search(query: string, options: WebSearchOptions): Promise<WebSearchHit[]> {
    const maxResults = options.maxResults ?? SEARCH_MAX_RESULTS;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await this.fetch.fetch(url, { signal: options.signal });
    return parseDuckDuckGoResults(response.body, maxResults);
  }
}

export function parseDuckDuckGoResults(html: string, maxResults = SEARCH_MAX_RESULTS): WebSearchHit[] {
  const results: WebSearchHit[] = [];
  const pattern = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=class="result__a"|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && results.length < maxResults) {
    const href = decodeSearchHref(match[1] ?? "");
    const title = stripTags(match[2] ?? "").trim();
    if (!href || !title) continue;
    try {
      const url = assertSafeHttpsUrl(href).toString();
      results.push({
        title,
        url,
        snippet: extractSnippet(match[3] ?? ""),
      });
    } catch {
      continue;
    }
  }
  return results;
}

function extractSnippet(chunk: string) {
  const match = chunk.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span|div)>/i);
  return stripTags(match?.[1] ?? "").trim();
}

function decodeSearchHref(href: string): string {
  try {
    const url = new URL(href, "https://html.duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return href;
  }
}

function stripTags(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
