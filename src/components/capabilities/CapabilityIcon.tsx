import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Folder,
  GitBranch,
  Globe,
  Server,
  Settings,
  Sparkles,
  Square,
  Terminal,
  Wrench,
} from "lucide-react";
import type { CapabilityDetailKind, ToolCapabilityCategory } from "../../lib/capabilities/types";

function toolIcon(category?: ToolCapabilityCategory): LucideIcon {
  if (category === "filesystem") return Folder;
  if (category === "terminal") return Terminal;
  if (category === "git") return GitBranch;
  if (category === "web") return Globe;
  if (category === "browser" || category === "application") return Square;
  if (category === "system") return Settings;
  if (category === "agent") return Bot;
  return Wrench;
}

export function CapabilityIcon({
  kind,
  category,
  size = 16,
}: {
  kind: CapabilityDetailKind;
  category?: ToolCapabilityCategory;
  size?: number;
}) {
  const Icon = kind === "skill" ? Sparkles : kind === "tool" ? toolIcon(category) : kind === "mcp-tool" ? Wrench : Server;
  const tone = kind === "skill" ? "skill" : kind === "tool" || kind === "mcp-tool" ? "tool" : "mcp";
  return (
    <span className={`cap-icon cap-icon-${tone}`} aria-hidden="true">
      <Icon size={size} strokeWidth={1.7} />
    </span>
  );
}
