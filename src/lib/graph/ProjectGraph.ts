import { classifyFile } from "./classify";
import { GRAPH_CONFIG_PATH, GRAPH_EDGES_PATH, GRAPH_NODES_PATH, parseGraphConfigJson, DEFAULT_GRAPH_CONFIG } from "./config";
import { extractDescriptor } from "./extract/extractDescriptor";
import { fileNodeId, normalizeGraphPath, pathFromNodeId } from "./ids";
import { FileScanner, isGraphCachePath, shouldIndexPath } from "./scanner/FileScanner";
import { RelationshipAnalyzer } from "./analyze/RelationshipAnalyzer";
import { candidateTargets, unorderedCandidatePairs } from "./analyze/candidates";
import type {
  FileDescriptor,
  FileNode,
  GraphConfig,
  GraphEdge,
  GraphFileStore,
  ProjectContext,
  RelatedFile,
  RelationshipAnalyzer as Analyzer,
  TraversalOptions,
  WalkedFile,
} from "./types";

export class ProjectGraph {
  private readonly files: GraphFileStore;
  private readonly analyzer: Analyzer;
  private readonly scanner: FileScanner;
  private nodes = new Map<string, FileNode>();
  private edges = new Map<string, GraphEdge>();
  private descriptors = new Map<string, FileDescriptor>();
  private config: GraphConfig = { ...DEFAULT_GRAPH_CONFIG, weights: { ...DEFAULT_GRAPH_CONFIG.weights }, relations: [...DEFAULT_GRAPH_CONFIG.relations] };
  analyzeCalls = 0;

  constructor(options: { files: GraphFileStore; analyzer?: Analyzer }) {
    this.files = options.files;
    this.analyzer = options.analyzer ?? new RelationshipAnalyzer();
    this.scanner = new FileScanner(options.files);
  }

  getConfig(): GraphConfig {
    return this.config;
  }

  getDescriptor(filePath: string): FileDescriptor | undefined {
    return this.descriptors.get(normalizeGraphPath(filePath));
  }

  getNode(filePath: string): FileNode | undefined {
    const path = normalizeGraphPath(filePath);
    return this.nodes.get(fileNodeId(path)) ?? this.nodes.get(path);
  }

  getNodes(): FileNode[] {
    return [...this.nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  getAllEdges(): GraphEdge[] {
    return [...this.edges.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  getEdges(filePath: string): GraphEdge[] {
    const id = fileNodeId(filePath);
    return this.getAllEdges().filter((edge) => edge.source === id || edge.target === id);
  }

  getIncomingEdges(filePath: string): GraphEdge[] {
    const id = fileNodeId(filePath);
    return this.getAllEdges().filter((edge) => edge.target === id);
  }

  getOutgoingEdges(filePath: string): GraphEdge[] {
    const id = fileNodeId(filePath);
    return this.getAllEdges().filter((edge) => edge.source === id);
  }

  getRelatedFiles(filePath: string, options: TraversalOptions = {}): RelatedFile[] {
    const maxDepth = options.maxDepth ?? 2;
    const maxFiles = options.maxFiles ?? 20;
    const minConfidence = options.minConfidence ?? this.config.minConfidence;
    const allowed = options.allowedRelations ? new Set(options.allowedRelations) : undefined;
    const root = normalizeGraphPath(filePath);
    const seen = new Set<string>([root]);
    const related: RelatedFile[] = [];
    let frontier: RelatedFile[] = [{ path: root, depth: 0, confidence: 1 }];
    while (frontier.length > 0 && related.length < maxFiles) {
      const next: RelatedFile[] = [];
      for (const current of frontier) {
        if (current.depth >= maxDepth) continue;
        for (const edge of this.getEdges(current.path)) {
          if (edge.status !== "active" && edge.confidence < minConfidence) continue;
          if (edge.confidence < minConfidence) continue;
          if (allowed && !allowed.has(edge.relation)) continue;
          const otherId = edge.source === fileNodeId(current.path) ? edge.target : edge.source;
          const otherPath = pathFromNodeId(otherId);
          if (seen.has(otherPath)) continue;
          seen.add(otherPath);
          const item: RelatedFile = {
            path: otherPath,
            depth: current.depth + 1,
            relation: edge.relation,
            confidence: edge.confidence,
          };
          related.push(item);
          next.push(item);
          if (related.length >= maxFiles) break;
        }
      }
      frontier = next;
    }
    return related;
  }

  async rebuild(): Promise<void> {
    this.analyzeCalls = 0;
    this.config = await this.loadConfig();
    const walked = await this.scanner.scan();
    const previous = new Map(this.nodes);
    this.nodes.clear();
    this.edges.clear();
    this.descriptors.clear();
    for (const entry of walked) {
      const reused = previous.get(fileNodeId(entry.relativePath));
      if (reused && reused.size === entry.size && reused.modifiedAt === entry.modifiedAt) {
        const descriptor = nodeToDescriptor(reused);
        this.descriptors.set(descriptor.path, descriptor);
        this.nodes.set(reused.id, reused);
        continue;
      }
      const descriptor = await extractDescriptor(entry, this.files);
      this.descriptors.set(descriptor.path, descriptor);
      this.nodes.set(fileNodeId(descriptor.path), descriptorToNode(descriptor));
    }
    this.recomputeAllEdges();
    await this.persist();
  }

  async updateFile(filePath: string): Promise<void> {
    const path = normalizeGraphPath(filePath);
    if (isGraphCachePath(path) || !shouldIndexPath(path)) {
      if (this.getNode(path)) await this.removeFile(path);
      return;
    }
    this.config = await this.loadConfig();
    const walked = await this.walkOne(path);
    const descriptor = await extractDescriptor(walked, this.files);
    this.dropIncidentEdges(path);
    this.descriptors.set(path, descriptor);
    this.nodes.set(fileNodeId(path), descriptorToNode(descriptor));
    this.recomputeEdgesFor(path);
    await this.persist();
  }

  async removeFile(filePath: string): Promise<void> {
    const path = normalizeGraphPath(filePath);
    this.dropIncidentEdges(path);
    this.descriptors.delete(path);
    this.nodes.delete(fileNodeId(path));
    await this.persist();
  }

  async renameFile(fromPath: string, toPath: string): Promise<void> {
    const from = normalizeGraphPath(fromPath);
    const to = normalizeGraphPath(toPath);
    const descriptor = this.descriptors.get(from);
    const node = this.getNode(from);
    const incident = this.getEdges(from);
    this.dropIncidentEdges(from);
    this.descriptors.delete(from);
    this.nodes.delete(fileNodeId(from));
    if (descriptor && node) {
      const nextDescriptor: FileDescriptor = {
        ...descriptor,
        path: to,
        name: to.split("/").pop() ?? to,
      };
      this.descriptors.set(to, nextDescriptor);
      this.nodes.set(fileNodeId(to), { ...descriptorToNode(nextDescriptor), id: fileNodeId(to) });
      for (const edge of incident) {
        const source = edge.source === fileNodeId(from) ? fileNodeId(to) : edge.source;
        const target = edge.target === fileNodeId(from) ? fileNodeId(to) : edge.target;
        const next: GraphEdge = {
          ...edge,
          id: `${source}:${target}:${edge.relation}`.replace(/^/, "edge:").replace("edge:edge:", "edge:"),
          source,
          target,
        };
        next.id = `edge:${source}:${target}:${edge.relation}`;
        this.edges.set(next.id, next);
      }
    }
    await this.updateFile(to);
  }

  snapshot(): { nodes: FileNode[]; edges: GraphEdge[] } {
    return { nodes: this.getNodes(), edges: this.getAllEdges() };
  }

  private dropIncidentEdges(filePath: string) {
    const id = fileNodeId(filePath);
    for (const [key, edge] of this.edges) {
      if (edge.source === id || edge.target === id) this.edges.delete(key);
    }
  }

  private context(): ProjectContext {
    const files = new Map<string, FileDescriptor>();
    for (const descriptor of this.descriptors.values()) files.set(descriptor.path, descriptor);
    return { rootPath: "", files, config: this.config };
  }

  private recomputeAllEdges() {
    const descriptors = [...this.descriptors.values()].sort((left, right) => left.path.localeCompare(right.path));
    const context = this.context();
    for (const [source, target] of unorderedCandidatePairs(descriptors, this.config)) {
      this.addAnalyzed(source, target, context);
      this.addAnalyzed(target, source, context);
    }
  }

  private recomputeEdgesFor(filePath: string) {
    const source = this.descriptors.get(filePath);
    if (!source) return;
    const context = this.context();
    const others = [...this.descriptors.values()].filter((item) => item.path !== source.path);
    for (const target of candidateTargets(source, others, this.config)) {
      this.addAnalyzed(source, target, context);
      this.addAnalyzed(target, source, context);
    }
  }

  private addAnalyzed(source: FileDescriptor, target: FileDescriptor, context: ProjectContext) {
    this.analyzeCalls += 1;
    for (const edge of this.analyzer.analyze(source, target, context)) {
      this.edges.set(edge.id, edge);
    }
  }

  private async walkOne(path: string): Promise<WalkedFile> {
    const walked = await this.scanner.scan();
    const found = walked.find((entry) => entry.relativePath === path);
    if (found) return found;
    let size = 0;
    let content = "";
    try {
      content = await this.files.readFile(path);
      size = new TextEncoder().encode(content).length;
    } catch {
      try {
        const bytes = await this.files.readBytes?.(path);
        size = bytes?.byteLength ?? 0;
      } catch {
        size = 0;
      }
    }
    return { relativePath: path, size, modifiedAt: Date.now() };
  }

  private async loadConfig(): Promise<GraphConfig> {
    try {
      const raw = await this.files.readFile(GRAPH_CONFIG_PATH);
      return parseGraphConfigJson(raw);
    } catch {
      return { ...DEFAULT_GRAPH_CONFIG, weights: { ...DEFAULT_GRAPH_CONFIG.weights }, relations: [...DEFAULT_GRAPH_CONFIG.relations] };
    }
  }

  private async persist() {
    await this.ensureDir(".kursor");
    await this.ensureDir(".kursor/graph");
    const nodes = JSON.stringify({ nodes: this.getNodes() }, null, 2);
    const edges = JSON.stringify({ edges: this.getAllEdges() }, null, 2);
    await this.files.writeFile(GRAPH_NODES_PATH, `${nodes}\n`);
    await this.files.writeFile(GRAPH_EDGES_PATH, `${edges}\n`);
  }

  private async ensureDir(path: string) {
    if (!this.files.createDirectory) return;
    try {
      await this.files.createDirectory(path);
    } catch {
      // already exists
    }
  }
}

export function descriptorToNode(descriptor: FileDescriptor): FileNode {
  const { content: _content, ...rest } = descriptor;
  return {
    id: fileNodeId(descriptor.path),
    path: descriptor.path,
    type: "file",
    category: classifyFile(descriptor.path),
    hash: rest.hash,
    size: rest.size,
    modifiedAt: rest.modifiedAt,
    basename: rest.basename,
    tokens: rest.tokens,
    symbols: rest.symbols,
    metadata: rest.metadata,
  };
}

export function nodeToDescriptor(node: FileNode): FileDescriptor {
  return {
    path: node.path,
    name: node.path.split("/").pop() ?? node.path,
    basename: node.basename,
    extension: node.path.includes(".") ? (node.path.split(".").pop() ?? "") : "",
    size: node.size,
    modifiedAt: node.modifiedAt,
    tokens: node.tokens,
    symbols: node.symbols,
    metadata: node.metadata,
    hash: node.hash,
  };
}
