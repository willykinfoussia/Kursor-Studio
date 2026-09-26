import type { FileSystemService } from "../filesystem/FileSystemService";
import { fileSystemService } from "../filesystem/FileSystemService";
import type { ToolRegistry } from "./ToolRegistry";
import { toolRegistry } from "./ToolRegistry";
import { createApplyPatchTool } from "./tools/applyPatch";
import { createCreateDirectoryTool } from "./tools/createDirectory";
import { createCreateFileTool } from "./tools/createFile";
import { createDeleteFileTool } from "./tools/deleteFile";
import { createGitCommitTool, createGitDiffTool, createGitFetchTool, createGitPullTool, createGitPushTool, createGitStatusTool } from "./tools/gitTools";
import { nativeFetchImpl, nativeGitService, nativeHttpService, nativeProcessService } from "./tools/http";
import { createListFilesTool } from "./tools/listFiles";
import type { AgentGitService, AgentHttpService, AgentProcessService } from "./tools/native";
import { createFetchUrlTool, createWebSearchTool } from "./tools/networkTools";
import { createKillProcessTool, createReadProcessTool, createRunCommandTool, createStartProcessTool } from "./tools/processTools";
import { createLoadSkillTool } from "./tools/loadSkill";
import { createCreatePlanTool, createUpdatePlanTodoTool } from "./tools/planTools";
import { createReadFileTool } from "./tools/readFile";
import { createSearchFilesTool } from "./tools/searchFiles";
import { createWriteFileTool } from "./tools/writeFile";
import {
  createAgentTool,
  createAskUserQuestionTool,
  createCheckSkillsTool,
  createEnterPlanModeTool,
  createSwitchAgentModeTool,
  createGitBranchTool,
  createFinishBranchTool,
} from "./tools/workflowTools";
import { DuckDuckGoSearchProvider } from "./web/providers/duckduckgo";
import { WebFetchService } from "./web/WebFetchService";
import { WebSearchService } from "./web/WebSearchService";

export interface BuiltinToolDependencies {
  fs: FileSystemService;
  process: AgentProcessService;
  git: AgentGitService;
  http: AgentHttpService;
  fetch?: WebFetchService;
  search?: WebSearchService;
}

function defaultWebServices() {
  const fetch = new WebFetchService(nativeFetchImpl);
  const search = new WebSearchService(new DuckDuckGoSearchProvider(fetch));
  return { fetch, search };
}

export function createBuiltinTools(deps: BuiltinToolDependencies) {
  const web = defaultWebServices();
  const fetch = deps.fetch ?? web.fetch;
  const search = deps.search ?? web.search;
  return [
    createListFilesTool({ fs: deps.fs }),
    createReadFileTool({ fs: deps.fs }),
    createWriteFileTool({ fs: deps.fs }),
    createCreateFileTool({ fs: deps.fs }),
    createCreatePlanTool({ fs: deps.fs }),
    createUpdatePlanTodoTool({ fs: deps.fs }),
    createDeleteFileTool({ fs: deps.fs }),
    createCreateDirectoryTool({ fs: deps.fs }),
    createSearchFilesTool({ fs: deps.fs }),
    createApplyPatchTool({ fs: deps.fs }),
    createRunCommandTool({ process: deps.process }),
    createStartProcessTool({ process: deps.process }),
    createReadProcessTool({ process: deps.process }),
    createKillProcessTool({ process: deps.process }),
    createGitStatusTool({ git: deps.git }),
    createGitDiffTool({ git: deps.git }),
    createGitCommitTool({ git: deps.git }),
    createGitPushTool({ git: deps.git }),
    createGitPullTool({ git: deps.git }),
    createGitFetchTool({ git: deps.git }),
    createFetchUrlTool({ fetch }),
    createWebSearchTool({ search }),
    createLoadSkillTool(),
    createCheckSkillsTool(),
    createAskUserQuestionTool(),
    createEnterPlanModeTool(),
    createSwitchAgentModeTool(),
    createGitBranchTool(),
    createAgentTool(),
    createFinishBranchTool(),
  ];
}

export function registerBuiltinTools(
  registry: ToolRegistry = toolRegistry,
  deps: Partial<BuiltinToolDependencies> = {},
) {
  const tools = createBuiltinTools({
    fs: deps.fs ?? fileSystemService,
    process: deps.process ?? nativeProcessService,
    git: deps.git ?? nativeGitService,
    http: deps.http ?? nativeHttpService,
    fetch: deps.fetch,
    search: deps.search,
  });
  for (const tool of tools) {
    registry.register(tool);
  }
  return tools;
}
