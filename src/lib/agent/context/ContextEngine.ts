import { retrieveMemories } from "../../memory/MemoryRetriever";
import { ragService } from "../../rag/RagService";
import { fileSystemService } from "../../filesystem/FileSystemService";
import { nativeGitService } from "../tools/http";
import { CONTEXT_PRIORITIES } from "./types";
import type {
  ContextBudget,
  ContextFileStore,
  ContextGitStore,
  ContextRetrievers,
  ContextSlice,
  ContextSnapshot,
  ContextSource,
  ContextSourceId,
  AssembledContext,
  SourceCollectResult,
} from "./types";
import { budgetFromChars, mergeBudget } from "./budget";
import { dropOrder, rankSlices } from "./rank";
import { assembleMessages, assembleSystemPrompt, aggregateTrace, systemReservedTokens } from "./assemble";
import { ConversationSource } from "./sources/conversation";
import { ProjectSource } from "./sources/project";
import { EditorSource } from "./sources/editor";
import { ToolSource } from "./sources/tool";
import { MemorySource } from "./sources/memory";
import { RagSource } from "./sources/rag";
import { GitSource } from "./sources/git";
import { SkillSource } from "./sources/skill";
import { RuleSource } from "./sources/rule";
import { WebSource } from "./sources/web";
import { GraphSource } from "./sources/graph";
import { SkillRegistry, skillRegistry } from "../skills/SkillRegistry";
import { RuleLoader } from "../rules/RuleLoader";
import { graphService } from "../../graph/GraphService";
import { projectContextFiles, userContextFiles } from "./fileStores";

export interface ContextEngineOptions {
  sources?: ContextSource[];
  budget?: Partial<ContextBudget>;
  files?: ContextFileStore;
  userFiles?: ContextFileStore;
  git?: ContextGitStore;
  retrievers?: ContextRetrievers;
  toolsEnabled?: boolean;
  skills?: SkillRegistry;
  rules?: RuleLoader;
}

export class ContextEngine {
  private readonly sources: ContextSource[];
  private readonly budgetOverride?: Partial<ContextBudget>;
  private readonly toolsEnabled: boolean;

  constructor(options: ContextEngineOptions = {}) {
    const retrievers = options.retrievers ?? defaultRetrievers();
    const files = options.files ?? projectContextFiles();
    const userFiles = options.userFiles ?? userContextFiles();
    const git = options.git ?? nativeGitService;
    const skills = options.skills ?? skillRegistry;
    if (!options.skills) skillRegistry.bindFiles(files, userFiles);
    const rules = options.rules ?? new RuleLoader({
      projectFiles: files,
      userFiles,
    });
    this.sources = options.sources ?? [
      new ConversationSource(),
      new ProjectSource(),
      new EditorSource(),
      new ToolSource(),
      new MemorySource(retrievers),
      new RagSource(retrievers),
      new GitSource(git),
      new SkillSource(skills),
      new RuleSource(rules),
      new WebSource(),
      new GraphSource(retrievers),
    ];
    this.budgetOverride = options.budget;
    this.toolsEnabled = options.toolsEnabled !== false;
  }

  async build(
    snapshot: ContextSnapshot,
    extras: { budget?: Partial<ContextBudget>; toolsEnabled?: boolean } = {},
  ): Promise<AssembledContext> {
    const budget = mergeBudget(budgetFromChars(snapshot.maxContextChars), {
      ...this.budgetOverride,
      ...extras.budget,
    });
    const toolsEnabled = extras.toolsEnabled ?? this.toolsEnabled;
    const collected = new Map<ContextSourceId, SourceCollectResult>();
    const collectedSlices: ContextSlice[] = [];

    const results = await Promise.all(this.sources.map(async (source) => {
      try {
        return { source, result: await source.collect(snapshot, budget) };
      } catch {
        return { source, result: { slices: [] as ContextSlice[], skipReason: "source failed" } };
      }
    }));

    for (const { source, result } of results) {
      collected.set(source.id, result);
      collectedSlices.push(...result.slices);
    }

    const ranked = rankSlices(collectedSlices);
    const capped = applyCaps(ranked, budget);
    const reserved = systemReservedTokens(snapshot, toolsEnabled);
    const { kept } = applyTokenBudget(capped, budget, reserved);
    const ordered = rankSlices(kept);
    const systemPrompt = assembleSystemPrompt(ordered, snapshot, toolsEnabled);
    const messages = assembleMessages(ordered, snapshot);
    const keptIds = new Set(kept.map((slice) => slice.id));
    const droppedAll = ranked.filter((slice) => !keptIds.has(slice.id));
    const tokensUsed = reserved + ordered.reduce((sum, slice) => sum + slice.tokens, 0);
    const sourceIds = this.sources.map((source) => source.id);

    return {
      systemPrompt,
      messages,
      slices: ordered,
      trace: aggregateTrace(sourceIds, collected, kept, droppedAll),
      tokensUsed,
    };
  }
}

function applyCaps(slices: ContextSlice[], budget: ContextBudget): ContextSlice[] {
  let next = [...slices];

  const conversation = next
    .filter((slice) => slice.source === "conversation")
    .sort((a, b) => Number(a.meta?.index ?? 0) - Number(b.meta?.index ?? 0));
  if (conversation.length > budget.maxHistoryMessages) {
    const request = conversation.filter((slice) => slice.priority === CONTEXT_PRIORITIES.userRequest);
    const rest = conversation.filter((slice) => slice.priority !== CONTEXT_PRIORITIES.userRequest);
    const room = Math.max(budget.maxHistoryMessages - request.length, 0);
    const keepRest = rest.slice(-room);
    const keepIds = new Set([...request, ...keepRest].map((slice) => slice.id));
    next = next.filter((slice) => slice.source !== "conversation" || keepIds.has(slice.id));
  }

  const rag = next.filter((slice) => slice.source === "rag");
  if (rag.length > budget.maxRagChunks) {
    const keepIds = new Set(rankSlices(rag).slice(0, budget.maxRagChunks).map((slice) => slice.id));
    next = next.filter((slice) => slice.source !== "rag" || keepIds.has(slice.id));
  }

  const web = next.filter((slice) => slice.source === "web");
  if (web.length > budget.maxWebDocs) {
    const keepIds = new Set(rankSlices(web).slice(0, budget.maxWebDocs).map((slice) => slice.id));
    next = next.filter((slice) => slice.source !== "web" || keepIds.has(slice.id));
  }

  const graph = next.filter((slice) => slice.source === "graph");
  if (graph.length > budget.maxGraphFiles) {
    const keepIds = new Set(rankSlices(graph).slice(0, budget.maxGraphFiles).map((slice) => slice.id));
    next = next.filter((slice) => slice.source !== "graph" || keepIds.has(slice.id));
  }

  const fileSlices = next.filter(isFileSlice);
  if (fileSlices.length > budget.maxFiles) {
    const keepIds = new Set(rankSlices(fileSlices).slice(0, budget.maxFiles).map((slice) => slice.id));
    next = next.filter((slice) => !isFileSlice(slice) || keepIds.has(slice.id));
  }

  return next;
}

function applyTokenBudget(
  slices: ContextSlice[],
  budget: ContextBudget,
  reservedTokens: number,
): { kept: ContextSlice[]; dropped: ContextSlice[] } {
  const kept = [...slices];
  const dropped: ContextSlice[] = [];
  let used = reservedTokens + kept.reduce((sum, slice) => sum + slice.tokens, 0);
  for (const slice of dropOrder(kept.filter((item) => item.priority > CONTEXT_PRIORITIES.userRequest))) {
    if (used <= budget.maxTokens) break;
    const index = kept.findIndex((item) => item.id === slice.id);
    if (index < 0) continue;
    kept.splice(index, 1);
    dropped.push(slice);
    used -= slice.tokens;
  }
  return { kept, dropped };
}

function isFileSlice(slice: ContextSlice): boolean {
  if (slice.source === "editor" && slice.meta?.path) return true;
  if (slice.source === "rag" && slice.meta?.path) return true;
  if (slice.source === "graph" && slice.meta?.path) return true;
  return slice.id === "git:diff";
}

function defaultRetrievers(): ContextRetrievers {
  return {
    memories: (projectId, query, limit) => retrieveMemories(projectId, query, limit),
    rag: (projectId, query, limit) => ragService.search(projectId, query, limit),
    graph: async (_projectId, seeds, limit) => {
      const resolved = graphService.resolveContext(seeds, { maxFiles: limit });
      const files: { path: string; content: string; score: number }[] = [];
      for (const path of resolved.files) {
        try {
          const content = await fileSystemService.readFile(path);
          files.push({ path, content, score: 1 });
        } catch {
          files.push({ path, content: "", score: 0.5 });
        }
      }
      return files;
    },
  };
}

export function createContextEngine(options?: ContextEngineOptions) {
  return new ContextEngine(options);
}
