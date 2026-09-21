import { asRecord } from "../tools/schema";
import { toolChangedPath } from "../tools/result";
import { readCommand, readPath } from "../hooks/HookBus";
import { FileJournal } from "./FileJournal";
import {
  ABSENT_HASH,
  contentHash,
  emptyChangeLog,
  FILE_MUTATE_TOOLS,
  isTestCommand,
  uniquePaths,
  type ChangeLog,
  type RecoveryCheckpoint,
  type RecoveryFiles,
  type RecoveryGit,
  type RollbackResult,
} from "./types";
import { toolOutputOk } from "../AgentStep";

export interface RecoveryManagerOptions {
  files: RecoveryFiles;
  git: RecoveryGit;
  now?: () => number;
  id?: () => string;
}

export class RecoveryManager {
  private readonly files: RecoveryFiles;
  private readonly git: RecoveryGit;
  private readonly now: () => number;
  private readonly id: () => string;
  private readonly journal = new FileJournal();
  private current: RecoveryCheckpoint | null = null;

  constructor(options: RecoveryManagerOptions) {
    this.files = options.files;
    this.git = options.git;
    this.now = options.now ?? (() => Date.now());
    this.id = options.id ?? (() => crypto.randomUUID());
  }

  get checkpoint() {
    return this.current;
  }

  get changeLog(): ChangeLog | null {
    return this.current?.log ?? null;
  }

  reset() {
    this.current = null;
    this.journal.reset();
  }

  restore(checkpoint: RecoveryCheckpoint) {
    this.current = {
      ...checkpoint,
      journal: { ...checkpoint.journal },
      log: cloneChangeLog(checkpoint.log),
      baselineHashes: { ...checkpoint.baselineHashes },
      lastAgentHashes: { ...checkpoint.lastAgentHashes },
    };
    this.journal.load(this.current.journal);
  }

  async create(): Promise<RecoveryCheckpoint> {
    this.journal.reset();
    let kind: RecoveryCheckpoint["kind"] = "snapshot";
    let gitSha: string | undefined;
    try {
      if (await this.git.isRepo()) {
        const sha = await this.git.stashCreate();
        if (sha) {
          kind = "git";
          gitSha = sha;
        }
      }
    } catch {
      kind = "snapshot";
      gitSha = undefined;
    }
    this.current = {
      id: this.id(),
      createdAt: this.now(),
      kind,
      gitSha,
      journal: {},
      log: emptyChangeLog(),
      baselineHashes: {},
      lastAgentHashes: {},
    };
    return this.snapshot();
  }

  async prepareTool(tool: string, input: unknown) {
    if (!this.current || !FILE_MUTATE_TOOLS.has(tool)) return;
    const path = readPath(input);
    if (!path) return;
    await this.capturePath(path);
  }

  async capturePath(path: string) {
    if (!this.current || this.journal.has(path)) return;
    const entry = await this.journal.capture(path, this.files);
    this.current.journal[path] = entry;
    this.current.baselineHashes[path] = contentHash(entry.content);
  }

  async track(tool: string, input: unknown, output: unknown) {
    if (!this.current) return;
    if (tool === "run_command") {
      this.trackCommand(input, output);
      return;
    }
    if (!FILE_MUTATE_TOOLS.has(tool) || !toolOutputOk(output)) return;
    const path = toolChangedPath(output) || readPath(input);
    if (!path) return;
    await this.capturePath(path);
    await this.trackFile(tool, path, input);
  }

  async rollback(): Promise<RollbackResult> {
    const checkpoint = this.current;
    const result: RollbackResult = { restored: [], skippedExternal: [], deleted: [] };
    if (!checkpoint) return result;

    const paths = uniquePaths([
      ...checkpoint.log.created,
      ...checkpoint.log.modified,
      ...checkpoint.log.deleted,
    ]);
    const gitRestore: string[] = [];

    for (const path of paths) {
      const current = await this.readMaybe(path);
      const currentHash = contentHash(current);
      const baselineHash = checkpoint.baselineHashes[path] ?? contentHash(null);
      const agentHash = checkpoint.lastAgentHashes[path];
      if (
        agentHash !== undefined
        && currentHash !== agentHash
        && currentHash !== baselineHash
      ) {
        result.skippedExternal.push(path);
        continue;
      }

      const journal = checkpoint.journal[path];
      const existed = journal?.existed ?? baselineHash !== ABSENT_HASH;

      if (!existed) {
        if (current !== null) {
          await this.files.delete(path).catch(() => undefined);
          result.deleted.push(path);
        }
        continue;
      }

      if (checkpoint.kind === "git" && checkpoint.gitSha) {
        gitRestore.push(path);
        result.restored.push(path);
        continue;
      }

      const baseline = journal?.content ?? await this.baselineFromGit(checkpoint, path);
      if (baseline !== null) {
        await this.files.writeFile(path, baseline);
        result.restored.push(path);
      }
    }

    if (checkpoint.kind === "git" && checkpoint.gitSha && gitRestore.length > 0) {
      try {
        await this.git.restorePaths(checkpoint.gitSha, gitRestore);
      } catch {
        for (const path of gitRestore) {
          const baseline = checkpoint.journal[path]?.content
            ?? await this.baselineFromGit(checkpoint, path);
          if (baseline !== null) await this.files.writeFile(path, baseline);
        }
      }
    }

    return result;
  }

  snapshot(): RecoveryCheckpoint {
    const checkpoint = this.current;
    if (!checkpoint) {
      throw new Error("No recovery checkpoint is active.");
    }
    return {
      ...checkpoint,
      gitSha: checkpoint.gitSha,
      journal: { ...checkpoint.journal },
      log: cloneChangeLog(checkpoint.log),
      baselineHashes: { ...checkpoint.baselineHashes },
      lastAgentHashes: { ...checkpoint.lastAgentHashes },
    };
  }

  private trackCommand(input: unknown, output: unknown) {
    if (!this.current) return;
    const command = readCommand(input) || readCommand(output) || readCommandFromOutput(output);
    if (!command) return;
    const exitCode = readExitCode(output);
    this.current.log.commandsExecuted.push({ command, exitCode });
    if (isTestCommand(command)) {
      this.current.log.testsExecuted.push({
        command,
        ok: exitCode === 0 && toolOutputOk(output),
      });
    }
  }

  private async trackFile(tool: string, path: string, input: unknown) {
    if (!this.current) return;
    const baseline = this.current.journal[path] ?? { existed: false, content: null };
    if (tool === "delete_file") {
      this.current.lastAgentHashes[path] = ABSENT_HASH;
      removePath(this.current.log.created, path);
      removePath(this.current.log.modified, path);
      if (baseline.existed) addPath(this.current.log.deleted, path);
      return;
    }

    this.current.lastAgentHashes[path] = await this.hashAfterWrite(tool, path, input);
    removePath(this.current.log.deleted, path);
    if (baseline.existed) {
      addPath(this.current.log.modified, path);
      removePath(this.current.log.created, path);
    } else {
      addPath(this.current.log.created, path);
      removePath(this.current.log.modified, path);
    }
  }

  private async hashAfterWrite(tool: string, path: string, input: unknown) {
    if (tool === "write_file" || tool === "create_file") {
      const record = asRecord(input);
      if (typeof record.content === "string") return contentHash(record.content);
      if (record.content === undefined && tool === "create_file") return contentHash("");
    }
    const current = await this.readMaybe(path);
    return contentHash(current);
  }

  private async baselineFromGit(checkpoint: RecoveryCheckpoint, path: string) {
    if (!checkpoint.gitSha) return null;
    try {
      return await this.git.showPath(checkpoint.gitSha, path);
    } catch {
      return null;
    }
  }

  private async readMaybe(path: string) {
    try {
      return await this.files.readFile(path);
    } catch {
      return null;
    }
  }
}

function cloneChangeLog(log: ChangeLog): ChangeLog {
  return {
    created: [...log.created],
    modified: [...log.modified],
    deleted: [...log.deleted],
    commandsExecuted: log.commandsExecuted.map((entry) => ({ ...entry })),
    testsExecuted: log.testsExecuted.map((entry) => ({ ...entry })),
  };
}

function addPath(list: string[], path: string) {
  if (!list.includes(path)) list.push(path);
}

function removePath(list: string[], path: string) {
  const index = list.indexOf(path);
  if (index >= 0) list.splice(index, 1);
}

function readCommandFromOutput(output: unknown) {
  if (!output || typeof output !== "object") return "";
  const record = output as { data?: { command?: unknown } };
  return typeof record.data?.command === "string" ? record.data.command : "";
}

function readExitCode(output: unknown): number | null {
  if (!output || typeof output !== "object") return null;
  const record = output as {
    exitCode?: unknown;
    metadata?: { exitCode?: unknown };
    data?: { exitCode?: unknown };
  };
  if (typeof record.exitCode === "number") return record.exitCode;
  if (typeof record.metadata?.exitCode === "number") return record.metadata.exitCode;
  if (typeof record.data?.exitCode === "number") return record.data.exitCode;
  return null;
}
