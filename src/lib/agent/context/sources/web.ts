import { CONTEXT_PRIORITIES, type ContextSource, type SourceCollectResult } from "../types";
import { clipText, estimateTokens } from "../tokens";
import { WEB_SLICE_CHARS } from "../../web/types";

export class WebSource implements ContextSource {
  readonly id = "web" as const;

  async collect(snapshot: Parameters<ContextSource["collect"]>[0]): Promise<SourceCollectResult> {
    const documents = snapshot.webDocuments ?? [];
    if (documents.length === 0) {
      return { slices: [], skipReason: "no web documents" };
    }

    const slices = documents.map((document, index) => {
      const content = clipText(document.content || document.snippet, WEB_SLICE_CHARS);
      const lines = [
        document.title,
        document.url,
        document.snippet,
        content && content !== document.snippet ? content : "",
      ].filter(Boolean);
      const text = lines.join("\n");
      return {
        id: `web:${index}:${document.url}`,
        source: this.id,
        priority: CONTEXT_PRIORITIES.web,
        score: 0.55,
        tokens: estimateTokens(text),
        text,
        meta: {
          title: document.title,
          url: document.url,
          retrievedAt: String(document.retrievedAt),
        },
      };
    });

    return { slices };
  }
}
