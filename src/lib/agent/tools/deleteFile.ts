import type { FileSystemService } from "../../filesystem/FileSystemService";
import { toolPermission } from "../permissions/meta";
import type { AgentTool } from "../ToolRegistry";
import { okResult, toToolFailure } from "./result";
import { toolSchema } from "./schema";
import { isFailure, requireProjectRoot, requiredRelativePath } from "./paths";

export function createDeleteFileTool(deps: { fs: FileSystemService }): AgentTool {
  return {
    name: "delete_file",
    description: "Delete a file or directory relative to the project root. Requires approval when destructive confirmation is enabled.",
    ...toolPermission("filesystem.delete", "high"),
    timeoutMs: 15_000,
    mutate: true,
    parameters: toolSchema({
      path: { type: "string", description: "File or directory path relative to the project root" },
    }, ["path"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const path = requiredRelativePath(input);
      if (isFailure(path)) return path;
      try {
        await deps.fs.delete(path);
        return okResult({ path, deleted: true }, { path });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}
