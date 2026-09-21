import type { FileSystemService } from "../../filesystem/FileSystemService";
import { toolPermission } from "../permissions/meta";
import type { AgentTool } from "../ToolRegistry";
import { asRecord } from "./schema";
import { failResult, okResult, toToolFailure } from "./result";
import { toolSchema } from "./schema";
import { isFailure, requireProjectRoot, requiredRelativePath } from "./paths";

export function applyUniquePatch(content: string, oldString: string, newString: string, replaceAll: boolean) {
  if (!oldString) {
    return { ok: false as const, error: "old_string must not be empty." };
  }
  const matches = content.split(oldString).length - 1;
  if (matches === 0) {
    return { ok: false as const, error: "old_string was not found in the file." };
  }
  if (!replaceAll && matches !== 1) {
    return { ok: false as const, error: `old_string matched ${matches} times; expected a unique match.` };
  }
  return {
    ok: true as const,
    next: replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString),
    matches,
  };
}

export function createApplyPatchTool(deps: { fs: FileSystemService }): AgentTool {
  return {
    name: "apply_patch",
    description: "Apply a unique text replacement in a file. Prefer this over rewriting the whole file. Fails if old_string matches 0 or multiple times unless replace_all is true.",
    ...toolPermission("filesystem.write", "medium"),
    timeoutMs: 20_000,
    mutate: true,
    parameters: toolSchema({
      path: { type: "string", description: "File path relative to the project root" },
      old_string: { type: "string", description: "Exact text to find" },
      new_string: { type: "string", description: "Replacement text" },
      replace_all: { type: "boolean", description: "Replace every match instead of requiring a unique match" },
    }, ["path", "old_string", "new_string"]),
    async execute(input, ctx) {
      const root = requireProjectRoot(ctx.projectRoot);
      if (isFailure(root)) return root;
      const path = requiredRelativePath(input);
      if (isFailure(path)) return path;
      const record = asRecord(input);
      const oldString = String(record.old_string ?? "");
      const newString = String(record.new_string ?? "");
      const replaceAll = record.replace_all === true;
      try {
        const content = await deps.fs.readFile(path);
        const patched = applyUniquePatch(content, oldString, newString, replaceAll);
        if (!patched.ok) return failResult("patch_failed", patched.error, { path });
        await deps.fs.writeFile(path, patched.next);
        return okResult({ path, matches: patched.matches }, { path });
      } catch (error) {
        return toToolFailure(error);
      }
    },
  };
}
