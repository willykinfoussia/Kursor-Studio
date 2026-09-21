import { assertSafeHttpsUrl } from "./safety";
import {
  FETCH_MAX_CHARS,
  FETCH_MAX_REDIRECTS,
  FETCH_TIMEOUT_MS,
  type WebFetchImpl,
  type WebFetchOptions,
  type WebFetchResult,
} from "./types";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class WebFetchService {
  constructor(private readonly fetchImpl: WebFetchImpl) {}

  async fetch(url: string, options: WebFetchOptions): Promise<WebFetchResult> {
    const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
    const maxChars = options.maxChars ?? FETCH_MAX_CHARS;
    const maxRedirects = options.maxRedirects ?? FETCH_MAX_REDIRECTS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("http-timeout"), timeoutMs);
    const signal = AbortSignal.any([options.signal, controller.signal]);
    try {
      let current = assertSafeHttpsUrl(url);
      for (let hop = 0; hop <= maxRedirects; hop += 1) {
        const response = await this.fetchImpl(current.toString(), {
          method: "GET",
          redirect: "manual",
          signal,
          headers: { "User-Agent": "Kursor/0.1" },
        });
        if (response.url) assertSafeHttpsUrl(response.url);
        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers.get("Location") ?? response.headers.get("location");
          if (!location) throw new Error("Redirect is missing a Location header.");
          current = assertSafeHttpsUrl(new URL(location, current).toString());
          continue;
        }
        const contentType = response.headers.get("content-type") ?? "";
        const raw = await response.text();
        const body = raw.length > maxChars ? raw.slice(0, maxChars) : raw;
        const finalUrl = response.url ? assertSafeHttpsUrl(response.url).toString() : current.toString();
        return {
          url: finalUrl,
          status: response.status,
          contentType,
          body,
          title: extractTitle(raw) || hostnameOf(finalUrl),
        };
      }
      throw new Error("Too many redirects.");
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractTitle(body: string) {
  const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return "";
  return match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
