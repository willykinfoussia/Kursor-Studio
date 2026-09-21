export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function isGitAuthError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes("git authentication failed")
    || message.includes("invalid credentials")
    || message.includes("authentication failed")
    || message.includes("bad credentials")
    || message.includes("could not read username")
    || message.includes("invalid username or password")
    || message.includes("github is not connected")
    || message.includes("requires authentication");
}

export function isGitMissingError(error: unknown) {
  return errorMessage(error).toLowerCase().includes("git is not available");
}

export function gitInstallUrl(platform = typeof navigator === "undefined" ? "" : navigator.platform) {
  const value = platform.toLowerCase();
  if (value.includes("mac")) return "https://git-scm.com/download/mac";
  if (value.includes("linux")) return "https://git-scm.com/download/linux";
  return "https://git-scm.com/download/win";
}

export function gitAuthErrorCopy(liveSession: boolean, loading: boolean, statusMessage: string | null) {
  if (loading) return statusMessage ?? "Opening GitHub…";
  if (liveSession) return "Git could not use the connected GitHub account.";
  return "GitHub authentication failed. Connect GitHub to continue.";
}

export async function withGitAuthRetry<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (error) {
    if (!isGitAuthError(error)) throw error;
    const { reconnectGitHub } = await import("../github/ensureRepository");
    const ok = await reconnectGitHub();
    if (!ok) throw error;
    return await op();
  }
}
