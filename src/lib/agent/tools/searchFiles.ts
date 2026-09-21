import type { FileSystemService } from "../../filesystem/FileSystemService";
import { toolPermission } from "../permissions/meta";
import type { AgentTool } from "../ToolRegistry";
import { asRecord } from "./schema";
import { failResult, okResult, toToolFailure } from "./result";
import { toolSchema } from "./schema";
import { isFailure, requireProjectRoot } from "./paths";

export function createSearchFilesTool(deps: { fs: FileSystemService }): AgentTool {
  return {
    name: "search_files",
    description: "Search project files by name or relative path. Ignores .git, node_modules, dist, and target. Returns up to 50 matches.",
    ...toolPermission("filesystem.read", "low"),
    timeoutMs: 20_000,
    mutate: false,
    parameters: toolSchema({
      query: { type: "string", description: "File name or path fragment" },
    }, ["query"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const query = String(asRecord(input).query ?? "").trim();
      if (!query) return failResult("invalid_input", "A search query is required.");
      try {
        const matches = await deps.fs.searchProjectFiles(query);
        return okResult({
          query,
          matches: matches.map((entry) => ({ name: entry.name, path: entry.relativePath })),
        });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}
