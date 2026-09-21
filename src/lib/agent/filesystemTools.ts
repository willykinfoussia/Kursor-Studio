import type { FileSystemService } from "../filesystem/FileSystemService";
import { fileSystemService } from "../filesystem/FileSystemService";
import { createApplyPatchTool } from "./tools/applyPatch";
import { createCreateDirectoryTool } from "./tools/createDirectory";
import { createCreateFileTool } from "./tools/createFile";
import { createDeleteFileTool } from "./tools/deleteFile";
import { createListFilesTool } from "./tools/listFiles";
import { createReadFileTool } from "./tools/readFile";
import { createSearchFilesTool } from "./tools/searchFiles";
import { createWriteFileTool } from "./tools/writeFile";
import type { ToolRegistry } from "./ToolRegistry";
import { toolRegistry } from "./ToolRegistry";

export function createFilesystemTools(deps: { fs: FileSystemService }) {
  return [
    createListFilesTool({ fs: deps.fs }),
    createReadFileTool({ fs: deps.fs }),
    createWriteFileTool({ fs: deps.fs }),
    createCreateFileTool({ fs: deps.fs }),
    createDeleteFileTool({ fs: deps.fs }),
    createCreateDirectoryTool({ fs: deps.fs }),
    createSearchFilesTool({ fs: deps.fs }),
    createApplyPatchTool({ fs: deps.fs }),
  ];
}

export function registerFilesystemTools(registry: ToolRegistry = toolRegistry) {
  for (const tool of createFilesystemTools({ fs: fileSystemService })) {
    registry.register(tool);
  }
}
