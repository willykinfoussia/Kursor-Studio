const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "169.254.169.254",
  "metadata.google.internal",
]);

export function assertSafeHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("A valid https URL is required.");
  }
  if (url.protocol === "file:") {
    throw new Error("file URLs are not allowed.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Only https URLs are allowed.");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("This host is not allowed.");
  }
  if (host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("This host is not allowed.");
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error("This host is not allowed.");
  }
  return url;
}

function isPrivateIpv4(host: string) {
  if (
    /^(10|127)\.\d+\.\d+\.\d+$/.test(host)
    || /^192\.168\.\d+\.\d+$/.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)
    || host.startsWith("169.254.")
  ) {
    return true;
  }
  return false;
}

function isPrivateIpv6(host: string) {
  const compact = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (compact === "::1" || compact.startsWith("fe80:") || compact.startsWith("fec0:")) return true;
  return /^f[cd][0-9a-f]{0,2}:/i.test(compact);
}
