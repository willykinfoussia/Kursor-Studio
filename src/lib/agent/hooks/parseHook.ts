import { asString, parseFrontmatter, parseSimpleYaml } from "../yaml";
import { normalizeAction, normalizeHookEvent, type DeclarativeHook, type HookAction } from "./types";

export function parseHookYaml(raw: string, fallbackName: string): DeclarativeHook | null {
  const parsed = parseFrontmatter(raw);
  const data = Object.keys(parsed.data).length > 0 ? parsed.data : parseSimpleYaml(raw);
  const event = normalizeHookEvent(asString(data.event));
  if (!event) return null;
  const rawAction = asString(data.action) ?? "allow";
  const outcome = normalizeAction(rawAction);
  const action: HookAction = outcome === "block"
    ? "deny"
    : outcome === "warn"
      ? "warn"
      : outcome === "modify"
        ? "modify"
        : "allow";
  const whenRaw = data.when && typeof data.when === "object" && !Array.isArray(data.when)
    ? data.when as Record<string, unknown>
    : {};
  return {
    name: asString(data.name)?.trim() || fallbackName,
    event,
    action,
    message: asString(data.message)?.trim() || parsed.body.trim() || undefined,
    when: {
      tool: asString(whenRaw.tool)?.trim() || undefined,
      pathContains: asString(whenRaw.pathContains)?.trim() || undefined,
      commandContains: asString(whenRaw.commandContains)?.trim() || undefined,
    },
  };
}
