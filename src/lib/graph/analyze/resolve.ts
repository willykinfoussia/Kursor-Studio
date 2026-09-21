import { parentRelativePath, normalizeRelativePath, extensionOf } from "../../filesystem/pathUtils";
import { fileName } from "../../filesystem/pathUtils";
import { GRAPH_EXTENSIONS } from "../scanner/FileScanner";

function keyOf(path: string): string {
  return normalizeRelativePath(path).toLowerCase();
}

export function buildPathIndex(paths: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const path of paths) {
    const normalized = normalizeRelativePath(path);
    index.set(keyOf(normalized), normalized);
  }
  return index;
}

export function resolveExistingPath(candidate: string, index: Map<string, string>): string | undefined {
  const normalized = normalizeRelativePath(candidate.replace(/\\/g, "/"));
  return index.get(keyOf(normalized));
}

export function resolveImportSpecifier(
  fromPath: string,
  specifier: string,
  index: Map<string, string>,
): string | undefined {
  const spec = specifier.trim().replace(/\\/g, "/").replace(/['"]/g, "");
  if (!spec || spec.startsWith("http:") || spec.startsWith("https:") || spec.startsWith("node:")) return undefined;
  const extension = extensionOf(spec);
  const looksLikeFile = Boolean(extension) && (spec.includes("/") || GRAPH_EXTENSIONS.has(extension ?? ""));
  if (looksLikeFile) {
    return resolveExistingPath(spec, index)
      ?? withExtensions(join(parentRelativePath(fromPath), spec), index)
      ?? uniqueBasename(fileName(spec), index);
  }
  if (spec.startsWith(".")) {
    const base = resolveRelative(fromPath, spec);
    return withExtensions(base, index);
  }
  if (spec.includes("/") && !spec.startsWith("@")) {
    return withExtensions(spec, index)
      ?? withExtensions(join(parentRelativePath(fromPath), spec), index)
      ?? uniqueBasename(fileName(spec), index);
  }
  const sameDir = withExtensions(join(parentRelativePath(fromPath), spec.replace(/\./g, "/")), index);
  if (sameDir) return sameDir;
  const dotted = withExtensions(spec.replace(/\./g, "/"), index);
  if (dotted) return dotted;
  return uniqueBasename(spec.includes(".") ? spec.split(".").pop() ?? spec : spec, index);
}

export function resolveFileMention(
  fromPath: string,
  mention: string,
  index: Map<string, string>,
): string | undefined {
  const raw = mention.trim().replace(/\\/g, "/").replace(/^["'`<(]+|[>"'`>)]+$/g, "");
  if (!raw) return undefined;
  const direct = resolveExistingPath(raw, index) ?? withExtensions(raw, index);
  if (direct) return direct;
  if (raw.startsWith("./") || raw.startsWith("../")) {
    return withExtensions(resolveRelative(fromPath, raw), index);
  }
  const fromDir = withExtensions(join(parentRelativePath(fromPath), raw), index);
  if (fromDir) return fromDir;
  const name = fileName(raw);
  if (name.includes(".")) {
    const matches = [...index.values()].filter((path) => fileName(path).toLowerCase() === name.toLowerCase());
    if (matches.length === 1) return matches[0];
    const hinted = matches.find((path) => path.toLowerCase().endsWith(`/${raw.toLowerCase()}`) || path.toLowerCase() === raw.toLowerCase());
    if (hinted) return hinted;
  }
  return undefined;
}

function resolveRelative(fromPath: string, specifier: string): string {
  const dots = specifier.match(/^\.+/)?.[0] ?? "";
  let rest = specifier.slice(dots.length).replace(/^\//, "");
  if (dots.length > 0 && rest.startsWith("/")) rest = rest.slice(1);
  if (/^\.\w/.test(specifier) && !specifier.startsWith("./") && !specifier.startsWith("..")) {
    rest = specifier.replace(/^\.+/, "").replace(/\./g, "/");
    const depth = (specifier.match(/^\.+/)?.[0].length ?? 1) - 1;
    let dir = parentRelativePath(fromPath);
    for (let i = 0; i < depth; i += 1) dir = parentRelativePath(dir);
    return rest ? join(dir, rest) : dir;
  }
  const fromDir = parentRelativePath(fromPath);
  const parts = (fromDir ? fromDir.split("/") : []).concat(specifier.split("/"));
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
}

function withExtensions(base: string, index: Map<string, string>): string | undefined {
  const trimmed = base.replace(/\/+$/, "");
  if (!trimmed) return undefined;
  const extension = extensionOf(trimmed);
  const candidates = extension
    ? [trimmed, `${trimmed}/index.ts`, `${trimmed}/index.tsx`, `${trimmed}/index.js`, `${trimmed}/__init__.py`]
    : [
      trimmed,
      `${trimmed}.py`,
      `${trimmed}.rs`,
      `${trimmed}.mod.rs`,
      `${trimmed}/mod.rs`,
      `${trimmed}.go`,
      `${trimmed}.ts`,
      `${trimmed}.tsx`,
      `${trimmed}.js`,
      `${trimmed}.jsx`,
      `${trimmed}.cs`,
      `${trimmed}.java`,
      `${trimmed}.kt`,
      `${trimmed}.php`,
      `${trimmed}.rb`,
      `${trimmed}.sql`,
      `${trimmed}.c`,
      `${trimmed}.h`,
      `${trimmed}.cpp`,
      `${trimmed}.hpp`,
      `${trimmed}.css`,
      `${trimmed}.scss`,
      `${trimmed}.html`,
      `${trimmed}.htm`,
      `${trimmed}.sh`,
      `${trimmed}.bash`,
      `${trimmed}.json`,
      `${trimmed}.md`,
      `${trimmed}/index.ts`,
      `${trimmed}/index.tsx`,
      `${trimmed}/index.js`,
      `${trimmed}/__init__.py`,
    ];
  for (const candidate of candidates) {
    const hit = resolveExistingPath(candidate, index);
    if (hit) return hit;
  }
  return undefined;
}

function uniqueBasename(basename: string, index: Map<string, string>): string | undefined {
  const needle = basename.toLowerCase();
  const matches = [...index.values()].filter((path) => {
    const name = fileName(path);
    const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
    return stem.toLowerCase() === needle || name.toLowerCase() === needle;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function join(parent: string, child: string): string {
  const cleanChild = child.replace(/^\/+/, "");
  if (!parent) return cleanChild;
  if (!cleanChild) return parent;
  return `${parent}/${cleanChild}`;
}
