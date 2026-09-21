export interface GitReviewFinding {
  title: string;
  detail: string;
  file?: string;
}

export interface GitReviewResult {
  risk: "low" | "medium" | "high";
  summary: string;
  findings: GitReviewFinding[];
  issues: string[];
  files: string[];
  raw: string;
}

const RISK = new Set(["low", "medium", "high"]);

export function parseGitReview(text: string): GitReviewResult {
  const json = extractJson(text);
  const summary = String(json?.summary ?? "").trim() || firstLine(text);
  const issues = asStringArray(json?.issues);
  const files = asStringArray(json?.files);
  const findings = parseFindings(json?.findings, issues);
  const riskRaw = String(json?.risk ?? inferRisk(issues, findings)).toLowerCase();
  return {
    risk: RISK.has(riskRaw) ? (riskRaw as GitReviewResult["risk"]) : "medium",
    summary,
    findings,
    issues,
    files: files.length > 0 ? files : unique(findings.map((item) => item.file).filter(Boolean) as string[]),
    raw: text,
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}\s*$/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseFindings(value: unknown, issues: string[]): GitReviewFinding[] {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return { title: item, detail: item };
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return {
          title: String(record.title ?? record.summary ?? record.message ?? "Finding"),
          detail: String(record.detail ?? record.description ?? record.title ?? ""),
          file: typeof record.file === "string" ? record.file : undefined,
        };
      }
      return { title: String(item), detail: String(item) };
    });
  }
  return issues.map((issue) => ({ title: issue, detail: issue }));
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function inferRisk(issues: string[], findings: GitReviewFinding[]): GitReviewResult["risk"] {
  const count = Math.max(issues.length, findings.length);
  if (count >= 4) return "high";
  if (count >= 1) return "medium";
  return "low";
}

function firstLine(text: string) {
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? "Review complete.";
}

function unique(values: string[]) {
  return [...new Set(values)];
}
