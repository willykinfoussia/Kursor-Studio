import type { FileSystemService } from "../../filesystem/FileSystemService";
import { toolPermission } from "../permissions/meta";
import type { AgentTool } from "../ToolRegistry";
import { okResult, toToolFailure } from "./result";
import { toolSchema } from "./schema";
import { isFailure, optionalRelativeDirectory, requireProjectRoot } from "./paths";

function isMissingDirectoryError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (message.includes("no project") || message.includes("outside")) return false;
  return message.includes("unable to read file")
    || message.includes("not found")
    || message.includes("does not exist")
    || message.includes("no such file")
    || message.includes("enoent")
    || message.includes("cannot find");
}

export function createListFilesTool(deps: { fs: FileSystemService }): AgentTool {
  return {
    name: "list_files",
    description: "List files and folders at a directory relative to the project root. Use \"\" or omit path for the project root. Does not recurse.",
    ...toolPermission("filesystem.read", "low"),
    timeoutMs: 15_000,
    mutate: false,
    parameters: toolSchema({
      path: { type: "string", description: "Directory relative to the project root. Empty string for the root." },
    }),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const path = optionalRelativeDirectory(input, "path", root);
      if (isFailure(path)) return path;
      try {
        const entries = await deps.fs.listDirectory(path);
        return okResult({
          path,
          entries: entries.map((entry) => ({
            name: entry.name,
            path: entry.relativePath,
            kind: entry.kind,
          })),
        }, { path });
      } catch (error) {
        if (path && isMissingDirectoryError(error)) {
          return okResult({ path, entries: [] }, { path });
        }
        return toToolFailure(error);
      }
    },
  };
}
