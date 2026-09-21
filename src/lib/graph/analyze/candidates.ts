import { fileName } from "../../filesystem/pathUtils";
import { testTargetBasename } from "../classify";
import { contentMentionsBasename } from "./nameMention";
import { jaccard } from "../tokenize";
import type { FileDescriptor, GraphConfig } from "../types";
import { buildPathIndex, resolveFileMention, resolveImportSpecifier } from "./resolve";

export function candidateTargets(
  source: FileDescriptor,
  files: readonly FileDescriptor[],
  config: GraphConfig,
): FileDescriptor[] {
  const index = buildPathIndex(files.map((file) => file.path));
  const targets: FileDescriptor[] = [];
  for (const target of files) {
    if (target.path === source.path) continue;
    if (isCandidatePair(source, target, index, config)) targets.push(target);
  }
  targets.sort((left, right) => left.path.localeCompare(right.path));
  return targets;
}

export function unorderedCandidatePairs(
  files: readonly FileDescriptor[],
  config: GraphConfig,
): [FileDescriptor, FileDescriptor][] {
  const index = buildPathIndex(files.map((file) => file.path));
  const pairs: [FileDescriptor, FileDescriptor][] = [];
  for (let i = 0; i < files.length; i += 1) {
    for (let j = i + 1; j < files.length; j += 1) {
      const left = files[i];
      const right = files[j];
      if (!left || !right) continue;
      if (isCandidatePair(left, right, index, config) || isCandidatePair(right, left, index, config)) {
        pairs.push([left, right]);
      }
    }
  }
  pairs.sort((a, b) => {
    const keyA = `${a[0].path}\0${a[1].path}`;
    const keyB = `${b[0].path}\0${b[1].path}`;
    return keyA.localeCompare(keyB);
  });
  return pairs;
}

function isCandidatePair(
  source: FileDescriptor,
  target: FileDescriptor,
  index: Map<string, string>,
  config: GraphConfig,
): boolean {
  if (source.basename && source.basename === target.basename) return true;
  const testName = testTargetBasename(source.path);
  if (testName && testName === target.basename) return true;
  const reverseTest = testTargetBasename(target.path);
  if (reverseTest && reverseTest === source.basename) return true;

  const imports = asStringArray(source.metadata.imports);
  for (const specifier of imports) {
    if (resolveImportSpecifier(source.path, specifier, index) === target.path) return true;
  }
  const mentions = asStringArray(source.metadata.mentions);
  for (const mention of mentions) {
    if (resolveFileMention(source.path, mention, index) === target.path) return true;
  }
  if (source.content && source.content.toLowerCase().includes(fileName(target.path).toLowerCase())) return true;
  if (source.content && contentMentionsBasename(source.content, target.basename)) return true;
  if (jaccard(source.tokens, target.tokens) >= config.candidateTokenJaccard) return true;
  return false;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
