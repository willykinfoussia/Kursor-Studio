import { fileSystemService } from "../filesystem/FileSystemService";
import type { FileKind } from "../filesystem/fileTypes";
import { mcpRegistry } from "../mcp/MCPRegistry";
import { mcpRuntime } from "../mcp/MCPRuntime";
import { stringifyMcpOutput } from "../mcp/redact";
import type { MCPServerConfig } from "../mcp/types";
import { locateExecutable } from "../mcp/setup/ExecutableLocator";
import { filesystemApi } from "../tauri/filesystemApi";
import { invokeCommand } from "../tauri/invoke";
import { processApi } from "../tauri/processApi";
import { useProjectStore } from "../../stores/projectStore";
import { ensureLocalTools, type LocalTools } from "./ensure";

export interface CodeIntelBinary {
  found: boolean;
  path?: string;
  error?: string;
}

export interface CodeIntelRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface CodeIntelEntry {
  name: string;
  kind: FileKind;
}

export interface CodeIntelHost {
  which(name: "codegraph" | "graphify"): Promise<CodeIntelBinary>;
  exists(relativePath: string): Promise<boolean>;
  list(relativePath: string): Promise<CodeIntelEntry[]>;
  readText(relativePath: string): Promise<string>;
  writeText(relativePath: string, content: string): Promise<void>;
  run(command: string, cwd: string, timeoutMs: number): Promise<CodeIntelRunResult>;
  start(command: string, cwd: string): Promise<{ jobId: string }>;
  kill(jobId: string): Promise<void>;
  upsert(config: MCPServerConfig): Promise<void>;
  restart(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  callTool(id: string, tool: string, args: unknown): Promise<{ success: boolean; text: string }>;
  sync(projectId: string): Promise<void>;
}

export function createProductionCodeIntelHost(): CodeIntelHost {
  return {
    async which(name) {
      try {
        const tools = await ensureLocalTools(() => invokeCommand<LocalTools>("code_intel_ensure"));
        const path = name === "codegraph" ? tools.codegraph : tools.graphify;
        if (path) return { found: true, path };
      } catch (error) {
        const fallback = await locateExecutable(name);
        if (fallback.found && fallback.path) return { found: true, path: fallback.path };
        const message = error instanceof Error ? error.message : "Install failed.";
        return { found: false, error: message };
      }
      const fallback = await locateExecutable(name);
      if (fallback.found && fallback.path) return { found: true, path: fallback.path };
      return { found: false, error: "Local code intelligence install did not return a path." };
    },
    async list(relativePath) {
      const root = useProjectStore.getState().currentProject?.rootPath;
      if (!root) return [];
      try {
        const entries = await filesystemApi.listDirectory(root, relativePath, true);
        return entries.map((entry) => ({ name: entry.name, kind: entry.kind }));
      } catch {
        return [];
      }
    },
    async exists(relativePath) {
      const slash = relativePath.lastIndexOf("/");
      const dir = slash === -1 ? "" : relativePath.slice(0, slash);
      const name = slash === -1 ? relativePath : relativePath.slice(slash + 1);
      const entries = await this.list(dir);
      return entries.some((entry) => entry.name === name);
    },
    readText: (relativePath) => fileSystemService.readFile(relativePath),
    writeText: (relativePath, content) => fileSystemService.writeFile(relativePath, content),
    async run(command, cwd, timeoutMs) {
      const result = await processApi.run(command, cwd, timeoutMs);
      return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    },
    start: (command, cwd) => processApi.start(command, cwd),
    kill: (jobId) => processApi.kill(jobId),
    async upsert(config) {
      await mcpRuntime.upsert(config);
    },
    async restart(id) {
      await mcpRuntime.restart(id);
    },
    async stop(id) {
      await mcpRuntime.stop(id);
    },
    async callTool(id, tool, args) {
      const result = await mcpRuntime.callTool(id, tool, args, 60_000);
      if (!result.success) return { success: false, text: result.error?.message ?? "Tool failed." };
      return { success: true, text: stringifyMcpOutput(result.data, 12_000).text };
    },
    async sync(projectId) {
      await mcpRegistry.sync(projectId);
    },
  };
}
