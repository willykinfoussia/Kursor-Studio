import type { FileSystemService } from "../../filesystem/FileSystemService";
import { toolPermission } from "../permissions/meta";
import type { AgentTool } from "../ToolRegistry";
import { asRecord } from "./schema";
import { okResult, toToolFailure } from "./result";
import { toolSchema } from "./schema";
import { isFailure, requireProjectRoot, requiredRelativePath } from "./paths";

export function createWriteFileTool(deps: { fs: FileSystemService }): AgentTool {
  return {
    name: "write_file",
    description: "Create or overwrite a UTF-8 text file relative to the project root. Missing parent directories are created automatically. Do not use run_command or mkdir to create files.",
    ...toolPermission("filesystem.write", "medium"),
    timeoutMs: 15_000,
    mutate: true,
    parameters: toolSchema({
      path: { type: "string", description: "File path relative to the project root, e.g. README.md" },
      content: { type: "string", description: "Full file contents to write" },
    }, ["path", "content"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const path = requiredRelativePath(input);
      if (isFailure(path)) return path;
      const content = String(asRecord(input).content ?? "");
      try {
        await deps.fs.writeFile(path, content);
        return okResult({ path, bytes: content.length }, { path });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}
