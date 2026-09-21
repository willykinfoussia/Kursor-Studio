import type { CapabilitySource } from "../../lib/capabilities/types";
import { openCapabilitySource } from "../../lib/workflow/navigation";

export function CapabilitySourceBlock({
  source,
  sourcePath,
}: {
  source: CapabilitySource;
  sourcePath?: string;
}) {
  const path = source.type === "project" || source.type === "user" ? source.path : sourcePath;
  const label = source.type === "builtin"
    ? `Built-in · ${source.name}`
    : source.type === "mcp"
      ? `MCP · ${source.serverId}`
      : source.type === "external"
        ? `External${source.url ? ` · ${source.url}` : ""}`
        : `${source.type === "user" ? "User" : "Project"} · ${path}`;
  return (
    <section>
      <h3>Source</h3>
      <p>{label}</p>
      {path && (source.type === "project" || source.type === "user") && (
        <button type="button" className="cap-link" onClick={() => openCapabilitySource(path)}>Open Source</button>
      )}
    </section>
  );
}
