import type { FileSystemService } from "../../filesystem/FileSystemService";
import { toolPermission } from "../permissions/meta";
import type { AgentTool } from "../ToolRegistry";
import { asRecord } from "./schema";
import { failResult, okResult, toToolFailure } from "./result";
import { toolSchema } from "./schema";
import { isFailure, requireProjectRoot, requiredRelativePath } from "./paths";

const MAX_READ_CHARS = 40_000;

export function createReadFileTool(deps: { fs: FileSystemService }): AgentTool {
  return {
    name: "read_file",
    description: "Read a UTF-8 text file relative to the project root. Binary files are rejected. Optional offset/limit are character-based.",
    ...toolPermission("filesystem.read", "low"),
    timeoutMs: 15_000,
    mutate: false,
    parameters: toolSchema({
      path: { type: "string", description: "File path relative to the project root, e.g. src/App.tsx" },
      offset: { type: "number", description: "Optional character offset to start reading from." },
      limit: { type: "number", description: "Optional maximum number of characters to return." },
    }, ["path"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const path = requiredRelativePath(input);
      if (isFailure(path)) return path;
      try {
        if (deps.fs.isBinaryPath(path)) {
          return failResult("binary_file", "Binary file", { path });
        }
        const content = await deps.fs.readFile(path);
        const record = asRecord(input);
        const offset = typeof record.offset === "number" && record.offset > 0 ? Math.floor(record.offset) : 0;
        const limit = typeof record.limit === "number" && record.limit > 0
          ? Math.min(Math.floor(record.limit), MAX_READ_CHARS)
          : MAX_READ_CHARS;
        const sliced = content.slice(offset, offset + limit);
        return okResult({
          path,
          truncated: offset + sliced.length < content.length,
          content: sliced,
        }, { path });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}
