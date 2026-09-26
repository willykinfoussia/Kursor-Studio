import type { FileSystemService } from "../../filesystem/FileSystemService";
import { toolPermission } from "../permissions/meta";
import type { AgentTool } from "../ToolRegistry";
import { asRecord } from "./schema";
import { okResult, toToolFailure } from "./result";
import { toolSchema } from "./schema";
import { isFailure, requireProjectRoot, requiredRelativePath } from "./paths";

export function createCreateFileTool(deps: { fs: FileSystemService }): AgentTool {
  return {
    name: "create_file",
    description: "Create a new file relative to the project root. Missing parent directories are created automatically. If content is provided, write it. If the file already exists, overwrite it with the provided content.",
    ...toolPermission("filesystem.write", "medium"),
    timeoutMs: 15_000,
    mutate: true,
    parameters: toolSchema({
      path: { type: "string", description: "File path relative to the project root" },
      content: { type: "string", description: "Optional initial file contents" },
    }, ["path"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const path = requiredRelativePath(input, "path", root);
      if (isFailure(path)) return path;
      const content = asRecord(input).content;
      const text = content === undefined ? "" : String(content);
      try {
        try {
          await deps.fs.createFile(path);
        } catch (error) {
          if (text === "") throw error;
        }
        if (text !== "" || content !== undefined) {
          await deps.fs.writeFile(path, text);
        }
        return okResult({ path, bytes: text.length }, { path });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}
