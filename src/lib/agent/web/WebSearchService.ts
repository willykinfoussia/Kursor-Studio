import { SEARCH_MAX_RESULTS, type WebSearchHit, type WebSearchOptions } from "./types";
import type { SearchProvider } from "./providers/SearchProvider";

export class WebSearchService {
  constructor(private readonly provider: SearchProvider) {}

  async search(query: string, options: WebSearchOptions): Promise<WebSearchHit[]> {
    const text = query.trim();
    if (!text) throw new Error("A search query is required.");
    const maxResults = options.maxResults ?? SEARCH_MAX_RESULTS;
    const hits = await this.provider.search(text, { ...options, maxResults });
    return hits.slice(0, maxResults);
  }
}
