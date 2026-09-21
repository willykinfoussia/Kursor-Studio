import type { WebSearchHit, WebSearchOptions } from "../types";

export interface SearchProvider {
  readonly id: string;
  search(query: string, options: WebSearchOptions): Promise<WebSearchHit[]>;
}
