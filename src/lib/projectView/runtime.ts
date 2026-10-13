const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s"'<>]*)?/gi;
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;

export function extractLocalUrl(text: string): string | null {
  const matches = text.replace(ANSI, "").match(LOCAL_URL);
  if (!matches || matches.length === 0) return null;
  const withPort = matches.filter((url) => /:\d+/.test(url));
  const pool = withPort.length > 0 ? withPort : matches;
  return pool[pool.length - 1];
}

export function previewFrameUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!parsed.port) return url;
  const host = parsed.hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return url;
  return `${parsed.protocol}//127.0.0.1:${parsed.port}/`;
}

export function clampSplit(percent: number, width = 1200): number {
  if (!Number.isFinite(percent)) return 42;
  const minChat = 320;
  const minStage = 360;
  if (width <= minChat + minStage) return Math.min(60, Math.max(40, percent));
  const minPercent = (minChat / width) * 100;
  const maxPercent = ((width - minStage) / width) * 100;
  return Math.min(maxPercent, Math.max(minPercent, percent));
}
