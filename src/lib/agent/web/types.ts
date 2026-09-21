export const FETCH_TIMEOUT_MS = 15_000;
export const FETCH_MAX_CHARS = 50_000;
export const FETCH_MAX_REDIRECTS = 3;
export const SEARCH_MAX_RESULTS = 8;
export const WEB_SLICE_CHARS = 4_000;

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface WebDocument {
  title: string;
  url: string;
  snippet: string;
  content: string;
  retrievedAt: number;
}

export interface WebFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  title: string;
}

export interface WebSearchOptions {
  signal: AbortSignal;
  maxResults?: number;
}

export interface WebFetchOptions {
  signal: AbortSignal;
  timeoutMs?: number;
  maxChars?: number;
  maxRedirects?: number;
}

export type WebFetchImpl = (input: string, init?: RequestInit) => Promise<Response>;
