import { extensionOf, fileName, parentRelativePath } from "../../filesystem/pathUtils";
import { classifyFile, isAccountSpec, isCodeFile, isConfigFile, isDocumentationFile, isProjectSpec, isSpecFile, isTestFile, testTargetBasename } from "../classify";
import { edgeId, fileNodeId } from "../ids";
import { jaccard } from "../tokenize";
import type {
  Evidence,
  FileDescriptor,
  GraphEdge,
  ProjectContext,
  RelationType,
  RelationshipAnalyzer as RelationshipAnalyzerContract,
} from "../types";
import { contentMentionsBasename } from "./nameMention";
import { combineConfidence, mergeEvidence } from "./confidence";
import { buildPathIndex, resolveFileMention, resolveImportSpecifier } from "./resolve";

const DOMAIN_STOP = new Set(["src", "lib", "app", "source", "sources", "pkg", "packages", "kursor", "specs", "test", "tests", "ui", "components"]);

export class RelationshipAnalyzer implements RelationshipAnalyzerContract {
  analyze(source: FileDescriptor, target: FileDescriptor, context: ProjectContext): GraphEdge[] {
    if (source.path === target.path) return [];
    const evidence = collectEvidence(source, target, context);
    if (evidence.length === 0) return [];
    const merged = mergeEvidence(evidence);
    const confidence = combineConfidence(merged);
    const relation = chooseRelation(source, target, merged);
    if (!context.config.relations.includes(relation)) return [];
    const status = confidence >= context.config.minConfidence ? "active" : "uncertain";
    return [{
      id: edgeId(fileNodeId(source.path), fileNodeId(target.path), relation),
      source: fileNodeId(source.path),
      target: fileNodeId(target.path),
      relation,
      confidence,
      evidence: merged,
      status,
    }];
  }
}

function collectEvidence(source: FileDescriptor, target: FileDescriptor, context: ProjectContext): Evidence[] {
  const weights = context.config.weights;
  const index = buildPathIndex([...context.files.keys()]);
  const evidence: Evidence[] = [];

  const imports = asStringArray(source.metadata.imports);
  for (const specifier of imports) {
    if (resolveImportSpecifier(source.path, specifier, index) === target.path) {
      evidence.push({
        type: "import_reference",
        source: "explicit",
        score: weights.importReference,
        details: `${specifier} → ${target.path}`,
      });
    }
  }

  const mentions = asStringArray(source.metadata.mentions);
  for (const mention of mentions) {
    if (resolveFileMention(source.path, mention, index) === target.path) {
      const explicit = mention.includes("/") || mention.toLowerCase() === fileName(target.path).toLowerCase();
      evidence.push({
        type: explicit ? "filename_reference" : "content_reference",
        source: "explicit",
        score: weights.explicitReference,
        details: `${mention} ↔ ${target.path}`,
      });
    }
  }

  if (source.content) {
    const haystack = source.content.toLowerCase();
    const names = unique([
      target.path.toLowerCase(),
      target.path.replace(/\//g, "\\").toLowerCase(),
      fileName(target.path).toLowerCase(),
    ]);
    for (const name of names) {
      if (name.length >= 3 && haystack.includes(name)) {
        evidence.push({
          type: name.includes("/") || name.includes("\\") ? "filename_reference" : "content_reference",
          source: "explicit",
          score: name.includes("/") || name === fileName(target.path).toLowerCase()
            ? weights.explicitReference
            : Math.min(weights.explicitReference, 0.7),
          details: `${fileName(source.path)} mentions ${name}`,
        });
      }
    }
  }

  if (source.basename && source.basename === target.basename) {
    evidence.push({
      type: "basename_match",
      source: "deterministic",
      score: weights.basenameMatch,
      details: `${fileName(source.path)} ↔ ${fileName(target.path)}`,
    });
  }

  const sourceDir = parentRelativePath(source.path);
  const targetDir = parentRelativePath(target.path);
  if (sourceDir && sourceDir === targetDir) {
    evidence.push({
      type: "directory_match",
      source: "deterministic",
      score: weights.directoryMatch,
      details: sourceDir,
    });
  }

  const domains = sharedDomains(source.path, target.path);
  if (domains.length > 0) {
    evidence.push({
      type: "domain_match",
      source: "deterministic",
      score: weights.domainMatch,
      details: domains.join(", "),
    });
  }

  const symbols = matchingSymbols(source, target);
  if (symbols.length > 0) {
    evidence.push({
      type: "symbol_match",
      source: "deterministic",
      score: weights.symbolMatch,
      details: symbols.slice(0, 6).join(", "),
    });
  }

  const keywordScore = jaccard(source.tokens, target.tokens);
  if (keywordScore >= 0.12) {
    const overlap = source.tokens.filter((token) => target.tokens.includes(token)).slice(0, 8);
    evidence.push({
      type: "keyword_match",
      source: "deterministic",
      score: weights.keywordMatch,
      details: overlap.join(", "),
    });
  }

  if (source.content && contentMentionsBasename(source.content, target.basename)) {
    evidence.push({
      type: "name_mention",
      source: "deterministic",
      score: weights.nameMention,
      details: `${fileName(source.path)} mentions ${target.basename}`,
    });
  }

  const testName = testTargetBasename(source.path);
  if (testName && testName === target.basename) {
    evidence.push({
      type: "test_name_match",
      source: "deterministic",
      score: weights.testNameMatch,
      details: `${fileName(source.path)} tests ${fileName(target.path)}`,
    });
  }

  if (isConfigFile(source.path) && (imports.length > 0 || mentions.length > 0)) {
    const hit = mentions.some((mention) => resolveFileMention(source.path, mention, index) === target.path)
      || imports.some((specifier) => resolveImportSpecifier(source.path, specifier, index) === target.path);
    if (hit) {
      evidence.push({
        type: "config_reference",
        source: "explicit",
        score: weights.explicitReference,
        details: `${fileName(source.path)} configures ${target.path}`,
      });
    }
  }

  return evidence;
}

function chooseRelation(source: FileDescriptor, target: FileDescriptor, evidence: Evidence[]): RelationType {
  const types = new Set(evidence.map((item) => item.type));
  if (types.has("import_reference")) return "imports";
  if (types.has("test_name_match") || (isTestFile(source.path) && isCodeFile(target.path))) return "tests";
  if (
    isAccountSpec(source.path)
    && !isAccountSpec(target.path)
    && (isProjectSpec(target.path) || isCodeFile(target.path))
    && (types.has("basename_match") || types.has("keyword_match") || types.has("filename_reference") || types.has("content_reference"))
  ) {
    return "influences";
  }
  if (isSpecFile(source.path) && isCodeFile(target.path) && (types.has("basename_match") || types.has("filename_reference"))) {
    return "implements";
  }
  if (types.has("config_reference") || (isConfigFile(source.path) && types.has("filename_reference"))) return "configures";
  if (isDocumentationFile(source.path) && types.has("filename_reference")) {
    return classifyFile(target.path) === "specifications" || extensionOf(target.path) === "md" ? "references" : "references";
  }
  if (isDocumentationFile(source.path) && (types.has("basename_match") || types.has("keyword_match"))) {
    return isCodeFile(target.path) && types.has("basename_match") ? "implements" : "documents";
  }
  if (types.has("filename_reference") || types.has("content_reference")) return "references";
  if (
    types.has("name_mention")
    && !types.has("import_reference")
    && !types.has("basename_match")
    && !types.has("test_name_match")
    && !types.has("config_reference")
  ) {
    return "related_to";
  }
  if (types.has("symbol_match")) return "uses";
  if (isCodeFile(source.path) && (classifyFile(target.path) === "data" || types.has("keyword_match"))) return "uses";
  return "related_to";
}

function matchingSymbols(source: FileDescriptor, target: FileDescriptor): string[] {
  const sourceSymbols = new Set((source.symbols ?? []).map((item) => item.toLowerCase()));
  const targetSymbols = new Set((target.symbols ?? []).map((item) => item.toLowerCase()));
  const fromSheets = asStringArray(target.metadata.sheets).concat(asStringArray(source.metadata.sheets));
  const hits: string[] = [];
  for (const symbol of sourceSymbols) {
    if (targetSymbols.has(symbol) || target.tokens.includes(symbol) || source.content?.toLowerCase().includes(symbol)) {
      if (targetSymbols.has(symbol) || target.tokens.includes(symbol)) hits.push(symbol);
    }
  }
  for (const symbol of targetSymbols) {
    if (source.tokens.includes(symbol) || source.content?.toLowerCase().includes(symbol)) hits.push(symbol);
  }
  for (const sheet of fromSheets) {
    const token = sheet.toLowerCase();
    if (source.tokens.includes(token) || target.tokens.includes(token)) hits.push(sheet);
  }
  return unique(hits);
}

function sharedDomains(leftPath: string, rightPath: string): string[] {
  const left = domainSegments(leftPath);
  const right = new Set(domainSegments(rightPath));
  return left.filter((segment) => right.has(segment));
}

function domainSegments(filePath: string): string[] {
  return parentRelativePath(filePath)
    .toLowerCase()
    .split("/")
    .filter((segment) => segment && !DOMAIN_STOP.has(segment) && !segment.startsWith("."));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
