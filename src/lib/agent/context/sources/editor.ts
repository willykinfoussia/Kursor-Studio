import { CONTEXT_PRIORITIES, type ContextSource, type SourceCollectResult } from "../types";
import { clipText, estimateTokens } from "../tokens";

export class EditorSource implements ContextSource {
  readonly id = "editor" as const;

  async collect(
    snapshot: Parameters<ContextSource["collect"]>[0],
    budget: Parameters<ContextSource["collect"]>[1],
  ): Promise<SourceCollectResult> {
    if (!snapshot.currentFile && snapshot.openFiles.length === 0) {
      return { slices: [], skipReason: "no editor state" };
    }

    const slices: SourceCollectResult["slices"] = [];
    const openNames = snapshot.openFiles.map((file) => file.path).sort((a, b) => a.localeCompare(b));
    if (openNames.length > 0) {
      const text = `Open files:\n${openNames.map((path) => `- ${path}`).join("\n")}`;
      slices.push({
        id: "editor:open-files",
        source: this.id,
        priority: CONTEXT_PRIORITIES.currentFile,
        score: 0.4,
        tokens: estimateTokens(text),
        text,
        meta: { files: String(openNames.length) },
      });
    }

    if (snapshot.currentFile) {
      const content = clipText(snapshot.currentFile.content, budget.maxFileChars);
      const text = snapshot.currentFile.content
        ? `Current file: ${snapshot.currentFile.path}\n\`\`\`\n${content}\n\`\`\``
        : `Current file: ${snapshot.currentFile.path}`;
      slices.push({
        id: `editor:current:${snapshot.currentFile.path}`,
        source: this.id,
        priority: CONTEXT_PRIORITIES.currentFile,
        score: 1,
        tokens: estimateTokens(text),
        text,
        meta: { path: snapshot.currentFile.path },
      });
    }

    return { slices };
  }
}
