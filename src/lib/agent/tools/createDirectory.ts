import type { FileSystemService } from "../../filesystem/FileSystemService";
import { toolPermission } from "../permissions/meta";
import type { AgentTool } from "../ToolRegistry";
import { okResult, toToolFailure } from "./result";
import { toolSchema } from "./schema";
import { isFailure, requireProjectRoot, requiredRelativePath } from "./paths";

export function createCreateDirectoryTool(deps: { fs: FileSystemService }): AgentTool {
  return {
    name: "create_directory",
    description: "Create a directory relative to the project root, including any missing parents. Succeeds if the directory already exists.",
    ...toolPermission("filesystem.write", "medium"),
    timeoutMs: 15_000,
    mutate: true,
    parameters: toolSchema({
      path: { type: "string", description: "Directory path relative to the project root, e.g. src/components" },
    }, ["path"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const path = requiredRelativePath(input, "path", root);
      if (isFailure(path)) return path;
      try {
        await deps.fs.createDirectory(path);
        return okResult({ path }, { path });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}
