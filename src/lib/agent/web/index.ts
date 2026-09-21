export {
  FETCH_MAX_CHARS,
  FETCH_MAX_REDIRECTS,
  FETCH_TIMEOUT_MS,
  SEARCH_MAX_RESULTS,
  WEB_SLICE_CHARS,
} from "./types";
export type {
  WebDocument,
  WebFetchImpl,
  WebFetchOptions,
  WebFetchResult,
  WebSearchHit,
  WebSearchOptions,
} from "./types";
export { assertSafeHttpsUrl } from "./safety";
export { WebFetchService } from "./WebFetchService";
export { WebSearchService } from "./WebSearchService";
export type { SearchProvider } from "./providers/SearchProvider";
export { DuckDuckGoSearchProvider, parseDuckDuckGoResults } from "./providers/duckduckgo";
