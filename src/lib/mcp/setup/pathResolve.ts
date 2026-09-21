export interface ResolvedPath {
  stored: string;
  display: string;
  absolute: string;
}

export function homeDirectory() {
  return (
    (typeof process !== "undefined" && (process.env.USERPROFILE || process.env.HOME))
    || ""
  );
}

export function resolveUserPath(path: string, home = homeDirectory()): ResolvedPath {
  const trimmed = path.trim();
  const expanded = trimmed
    .replace(/^%USERPROFILE%/i, home)
    .replace(/^\$HOME/, home)
    .replace(/^~(?=$|[\\/])/, home);
  const absolute = expanded.replace(/\\/g, "/");
  const stored = home && absolute.toLowerCase().startsWith(home.replace(/\\/g, "/").toLowerCase())
    ? `$HOME${absolute.slice(home.replace(/\\/g, "/").length)}`
    : trimmed;
  return {
    stored,
    display: absolute,
    absolute,
  };
}

export function resolveMCPPath(path: string, home = homeDirectory()) {
  return resolveUserPath(path, home).absolute;
}
