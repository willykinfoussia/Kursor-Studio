export type BranchGit = {
  status: () => Promise<{ branch: string }>;
  checkout: (branch: string) => Promise<void>;
  createBranch: (branch: string, start?: string) => Promise<void>;
};

export function isDetachedGitBranch(branch: string | null | undefined): boolean {
  const name = (branch ?? "").trim();
  if (!name) return true;
  const lower = name.toLowerCase();
  return lower === "head" || lower.startsWith("head (");
}

export function sanitizeAgentBranchName(branch: string): string | null {
  const trimmed = branch.trim().replace(/^refs\/heads\//, "");
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\") || trimmed.startsWith("/") || trimmed.endsWith("/")) {
    return null;
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed)) return null;
  return trimmed;
}

export async function ensureBranchForPush(
  git: BranchGit,
  preferred?: string | null,
): Promise<string | null> {
  const status = await git.status();
  if (!isDetachedGitBranch(status.branch)) return null;
  const name = preferred?.trim() || `kursor-${Date.now().toString(36)}`;
  try {
    await git.createBranch(name);
  } catch {
    await git.checkout(name);
  }
  return name;
}
