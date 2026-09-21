import { CONTEXT_PRIORITIES, type ContextGitStore, type ContextSource, type SourceCollectResult } from "../types";
import { clipText, estimateTokens, mentionedPaths, pathOverlap, tokenize } from "../tokens";
import { MAX_GIT_DIFF_CHARS } from "../budget";

const GIT_KEYWORDS = new Set(["git", "diff", "commit", "branch", "stash", "merge", "rebase", "pull", "push"]);

export class GitSource implements ContextSource {
  readonly id = "git" as const;

  constructor(private readonly git?: ContextGitStore) {}

  async collect(snapshot: Parameters<ContextSource["collect"]>[0]): Promise<SourceCollectResult> {
    if (!snapshot.project) return { slices: [], skipReason: "no project" };
    if (!this.git) return { slices: [], skipReason: "git unavailable" };

    try {
      const status = await this.git.status();
      const statusText = status.clean
        ? `Git: ${status.branch} (clean)`
        : `Git: ${status.branch}\nChanged files:\n${status.changedFiles.slice().sort((a, b) => a.localeCompare(b)).map((path) => `- ${path}`).join("\n")}`;
      const slices: SourceCollectResult["slices"] = [{
        id: "git:status",
        source: this.id,
        priority: CONTEXT_PRIORITIES.relevantCode,
        score: 0.6,
        tokens: estimateTokens(statusText),
        text: statusText,
        meta: { branch: status.branch, clean: status.clean ? "1" : "0" },
      }];

      const candidates = [
        ...mentionedPaths(snapshot.request),
        ...snapshot.openFiles.map((file) => file.path),
        snapshot.currentFile?.path ?? "",
      ].filter(Boolean);
      const wantsDiff = queryWantsGit(snapshot.request)
        || status.changedFiles.some((path) => pathOverlap(path, candidates));
      if (!wantsDiff) return { slices };

      const focus = status.changedFiles.find((path) => pathOverlap(path, candidates));
      const diff = await this.git.diff(focus);
      const clipped = clipText(diff.diff.trim(), MAX_GIT_DIFF_CHARS);
      if (!clipped) return { slices };
      const text = `Git diff${focus ? ` (${focus})` : ""}:\n${clipped}`;
      slices.push({
        id: "git:diff",
        source: this.id,
        priority: CONTEXT_PRIORITIES.relevantCode,
        score: 0.8,
        tokens: estimateTokens(text),
        text,
        meta: { path: focus ?? "" },
      });
      return { slices };
    } catch {
      return { slices: [], skipReason: "git lookup failed" };
    }
  }
}

function queryWantsGit(query: string): boolean {
  return tokenize(query).some((token) => GIT_KEYWORDS.has(token));
}
