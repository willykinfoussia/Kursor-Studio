import { toolPermission } from "../permissions/meta";
import type { AgentTool } from "../ToolRegistry";
import type { WebFetchService } from "../web/WebFetchService";
import type { WebSearchService } from "../web/WebSearchService";
import { FETCH_MAX_CHARS, FETCH_TIMEOUT_MS, SEARCH_MAX_RESULTS } from "../web/types";
import { asRecord } from "./schema";
import { failResult, okResult, toToolFailure } from "./result";
import { toolSchema } from "./schema";

export { parseDuckDuckGoResults } from "../web/providers/duckduckgo";

const SEARCH_WHEN = "Use only for current documentation, a recent API, an external error, or facts outside the repo. Do not search by default.";

export function createFetchUrlTool(deps: { fetch: WebFetchService }): AgentTool {
  return {
    name: "fetch_url",
    description: `Fetch a public https URL as text. Local, private, and file URLs are blocked. ${SEARCH_WHEN}`,
    ...toolPermission("network.fetch", "medium"),
    timeoutMs: FETCH_TIMEOUT_MS,
    mutate: false,
    parameters: toolSchema({
      url: { type: "string", description: "https URL to fetch" },
    }, ["url"]),
    async execute(input, ctx) {
      const url = String(asRecord(input).url ?? "").trim();
      if (!url) return failResult("invalid_input", "A url is required.");
      try {
        const response = await deps.fetch.fetch(url, {
          timeoutMs: FETCH_TIMEOUT_MS,
          signal: ctx.signal,
          maxChars: FETCH_MAX_CHARS,
        });
        return okResult(response, { status: response.status, url: response.url });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}

export function createWebSearchTool(deps: { search: WebSearchService }): AgentTool {
  return {
    name: "web_search",
    description: `Search the public web and return titles, https URLs, and snippets. ${SEARCH_WHEN}`,
    ...toolPermission("network.search", "medium"),
    timeoutMs: FETCH_TIMEOUT_MS,
    mutate: false,
    parameters: toolSchema({
      query: { type: "string", description: "Search query" },
    }, ["query"]),
    async execute(input, ctx) {
      const query = String(asRecord(input).query ?? "").trim();
      if (!query) return failResult("invalid_input", "A search query is required.");
      try {
        const results = await deps.search.search(query, {
          signal: ctx.signal,
          maxResults: SEARCH_MAX_RESULTS,
        });
        return okResult({ query, results });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}
