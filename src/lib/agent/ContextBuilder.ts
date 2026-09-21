import type { Memory } from "../memory/types";
import type { RagResult } from "../rag/types";
import { ContextEngine } from "./context/ContextEngine";
import type { AssembledContext } from "./context/types";
import { ContextManager, type AgentContext } from "./ContextManager";
import type { AgentMessage } from "./types";

export interface BuiltAgentContext extends AgentContext {
  memories: Memory[];
  ragResults: RagResult[];
  assembled: AssembledContext;
}

export class ContextBuilder {
  constructor(
    private readonly contextManager = new ContextManager(),
    private readonly engine = new ContextEngine(),
  ) {}

  async build(messages: readonly AgentMessage[], toolsEnabled = true): Promise<BuiltAgentContext> {
    const snapshot = this.contextManager.snapshot(messages);
    const assembled = await this.engine.build(snapshot, { toolsEnabled });
    const current = assembled.slices.find((slice) => slice.id.startsWith("editor:current:"));
    return {
      messages: assembled.messages,
      project: {
        projectName: snapshot.project?.name ?? "",
        currentFile: snapshot.currentFile?.path ?? null,
        currentFileContent: current?.text ?? snapshot.currentFile?.content ?? null,
      },
      memories: [],
      ragResults: [],
      assembled,
    };
  }
}

export const contextBuilder = new ContextBuilder();
