import type { AIService } from "../AIService";
import { routeModels } from "../routing";
import { listAvailableModels } from "../config";
import type { AgentEvent, AgentMessage, AIModel } from "../types";
import { collectKnowledgeCatalog } from "./catalog";
import { collectProductExcerpts, type FileExcerpt } from "./excerpts";
import { shouldSkipKnowledgeReflect, hasProductFileChanges } from "./gates";
import { knowledgeProposalStore, type KnowledgeProposalStore } from "./KnowledgeProposalStore";
import {
  buildKnowledgeReflectUserPrompt,
  buildSpecAuthorUserPrompt,
  KNOWLEDGE_REFLECT_SYSTEM,
  SPEC_AUTHOR_SYSTEM,
  type KnowledgeCatalogItem,
} from "./prompt";
import { hasKnowledgeActions, parseKnowledgeReflectResult } from "./schema";
import { adoptProductSpec, withFallbackProductSpec } from "./fallbackSpec";
import {
  authorFileName,
  ensureSpecFrontmatter,
  hasSubstantialProductSpec,
  isSubstantialSpec,
  parseSpecAuthorResult,
  projectSpecKind,
} from "./specDocument";
import type { KnowledgeProposal, KnowledgeReflectInput, KnowledgeReflectResult, SpecProposalAction } from "./types";

export interface KnowledgeReflectorOptions {
  ai?: AIService;
  store?: KnowledgeProposalStore;
  emit?: (event: AgentEvent) => void;
  getEnabled?: () => boolean;
  getModels?: () => { ordered: AIModel[]; policy?: Parameters<typeof routeModels>[0]["policy"] };
  now?: () => number;
  id?: () => string;
  catalog?: typeof collectKnowledgeCatalog;
  applyProposal?: (proposal: KnowledgeProposal) => Promise<void>;
  readFile?: (path: string) => Promise<string>;
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return String(error ?? "unknown");
}

export class KnowledgeReflector {
  private readonly inFlight = new Set<string>();
  private ai?: AIService;
  private readonly store: KnowledgeProposalStore;
  private readonly emit: (event: AgentEvent) => void;
  private readonly getEnabled: () => boolean;
  private readonly getModels: KnowledgeReflectorOptions["getModels"];
  private readonly now: () => number;
  private readonly id: () => string;
  private readonly catalog: typeof collectKnowledgeCatalog;
  private readonly applyProposal?: (proposal: KnowledgeProposal) => Promise<void>;
  private readonly readFile?: (path: string) => Promise<string>;

  constructor(options: KnowledgeReflectorOptions = {}) {
    this.ai = options.ai;
    this.store = options.store ?? knowledgeProposalStore;
    this.emit = options.emit ?? (() => undefined);
    this.getEnabled = options.getEnabled ?? (() => true);
    this.getModels = options.getModels;
    this.now = options.now ?? Date.now;
    this.id = options.id ?? (() => crypto.randomUUID());
    this.catalog = options.catalog ?? collectKnowledgeCatalog;
    this.applyProposal = options.applyProposal;
    this.readFile = options.readFile;
  }

  bindAi(ai: AIService) {
    this.ai = ai;
  }

  schedule(input: KnowledgeReflectInput): void {
    void this.run(input);
  }

  async run(input: KnowledgeReflectInput): Promise<KnowledgeProposal | null> {
    const gate = shouldSkipKnowledgeReflect({
      enabled: this.getEnabled(),
      skipFlag: input.skipFlag,
      alreadyRunning: this.inFlight.has(input.conversationId),
      messages: input.messages,
      toolNames: input.toolNames,
      goal: input.goal,
      filesChanged: input.filesChanged,
      planUnfinished: input.planUnfinished,
    });
    if (gate.skip) {
      this.emit({ type: "knowledge-reflect-skipped", runId: input.runId, reason: gate.reason });
      return null;
    }
    if (!input.projectId) {
      this.emit({ type: "knowledge-reflect-skipped", runId: input.runId, reason: "no-project" });
      return null;
    }
    if (!this.ai?.completeText) {
      this.emit({ type: "knowledge-reflect-skipped", runId: input.runId, reason: "no-llm" });
      return null;
    }
    this.inFlight.add(input.conversationId);
    this.emit({ type: "knowledge-reflect-started", runId: input.runId });
    try {
      const excerpts = await this.loadExcerpts(input.filesChanged);
      const catalog = await this.catalog(Boolean(input.projectId));
      const result = await this.completeText(
        KNOWLEDGE_REFLECT_SYSTEM,
        buildKnowledgeReflectUserPrompt(input, catalog, excerpts),
      );
      const parsed = await this.ensureProductSpec(parseKnowledgeReflectResult(result), input, catalog, excerpts);
      const now = this.now();
      const proposal: KnowledgeProposal = {
        id: this.id(),
        projectId: input.projectId,
        runId: input.runId,
        conversationId: input.conversationId,
        createdAt: now,
        updatedAt: now,
        status: "pending",
        summary: parsed.summary || (hasKnowledgeActions(parsed)
          ? "Created or updated skills and specs."
          : "No durable skill or spec changes."),
        payload: parsed,
      };
      if (hasKnowledgeActions(parsed) && this.applyProposal) {
        await this.applyProposal(proposal);
      }
      proposal.status = "applied";
      proposal.updatedAt = this.now();
      await this.store.save(proposal);
      this.emit({
        type: "knowledge-reflect-completed",
        runId: input.runId,
        proposalId: proposal.id,
        summary: proposal.summary,
        skillCount: parsed.skillActions.length,
        specCount: parsed.specActions.length,
      });
      return proposal;
    } catch (error) {
      const message = errorText(error);
      const reason = message === "no-llm" || message === "no-model" ? "no-llm" : "failed";
      this.emit({
        type: "knowledge-reflect-skipped",
        runId: input.runId,
        reason,
        error: message,
      });
      return null;
    } finally {
      this.inFlight.delete(input.conversationId);
    }
  }

  private async loadExcerpts(paths: readonly string[]): Promise<FileExcerpt[]> {
    if (!this.readFile) return [];
    return collectProductExcerpts(paths, this.readFile);
  }

  private async ensureProductSpec(
    parsed: KnowledgeReflectResult,
    input: KnowledgeReflectInput,
    catalog: readonly KnowledgeCatalogItem[],
    excerpts: readonly FileExcerpt[],
  ): Promise<KnowledgeReflectResult> {
    if (input.planUnfinished || !hasProductFileChanges(input.filesChanged)) return parsed;
    if (hasSubstantialProductSpec(parsed)) return withFallbackProductSpec(parsed, input);
    try {
      const authored = await this.authorProductSpec(input, catalog, excerpts);
      if (authored) return adoptProductSpec(parsed, authored, input);
    } catch {
      // The author model failed; the structured skeleton still records the run.
    }
    return withFallbackProductSpec(parsed, input);
  }

  private async authorProductSpec(
    input: KnowledgeReflectInput,
    catalog: readonly KnowledgeCatalogItem[],
    excerpts: readonly FileExcerpt[],
  ): Promise<SpecProposalAction | null> {
    const text = await this.completeText(SPEC_AUTHOR_SYSTEM, buildSpecAuthorUserPrompt(input, catalog, excerpts));
    const authored = parseSpecAuthorResult(text);
    if (!authored || !isSubstantialSpec(authored.content)) return null;
    const kind = projectSpecKind(authored.kind);
    const fileName = authorFileName(authored.fileName ?? "", input.goal);
    return {
      id: "spec:author:architecture",
      action: "create",
      scope: "project",
      kind,
      fileName,
      rationale: "Product files were implemented; record the architecture.",
      content: ensureSpecFrontmatter(authored.content, {
        scope: "project",
        kind,
        fileName,
        title: authored.title,
      }),
    };
  }

  private async completeText(systemPrompt: string, content: string): Promise<string> {
    const service = this.ai;
    if (!service?.completeText) throw new Error("no-llm");
    const models = this.getModels?.() ?? { ordered: listAvailableModels() };
    const routed = routeModels({
      goal: "summarize durable knowledge from the finished run",
      ordered: models.ordered,
      hints: {},
      policy: models.policy,
    });
    const ids = [...new Set([
      ...routed.models.map((model) => model.id),
      ...models.ordered.map((model) => model.id),
    ].filter(Boolean))];
    if (ids.length === 0) throw new Error("no-llm");
    const user: AgentMessage = {
      id: "knowledge-reflect",
      role: "user",
      content,
      timestamp: this.now(),
    };
    let lastError: unknown;
    for (const model of ids) {
      try {
        const result = await service.completeText([user], {
          model,
          systemPrompt,
          json: true,
        });
        return result?.text ?? "";
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(errorText(lastError));
  }
}

export const knowledgeReflector = new KnowledgeReflector();
