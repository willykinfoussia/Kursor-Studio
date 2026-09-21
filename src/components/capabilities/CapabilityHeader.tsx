import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import type { SkillDocumentScope } from "../../lib/agent/skills/SkillDocument";
import { CapabilitySearch } from "./CapabilitySearch";
import { CapabilityFilters } from "./CapabilityFilters";

export function CapabilityHeader({
  search,
  onSearch,
  onAddSkill,
  onAddMcp,
}: {
  search: string;
  onSearch: (value: string) => void;
  onAddSkill: (scope: SkillDocumentScope) => void;
  onAddMcp: () => void;
}) {
  const hasProject = Boolean(useProjectStore((state) => state.currentProject));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <header className="cap-header">
      <div className="cap-header-copy">
        <h1>Capabilities</h1>
        <p className="cap-subtitle">Everything Kursor can understand, use and execute.</p>
      </div>
      <div className="cap-header-actions">
        <CapabilitySearch value={search} onChange={onSearch} />
        <CapabilityFilters />
        <div className="cap-add" ref={menuRef}>
          <button type="button" className="primary-btn" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-haspopup="menu">
            <Plus size={13} /> Add
          </button>
          {menuOpen && (
            <div className="cap-add-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                disabled={!hasProject}
                title={hasProject ? "This workspace only" : "Open a project first"}
                onClick={() => {
                  setMenuOpen(false);
                  onAddSkill("project");
                }}
              >
                Project skill
              </button>
              <button
                type="button"
                role="menuitem"
                title="Available in every project"
                onClick={() => {
                  setMenuOpen(false);
                  onAddSkill("user");
                }}
              >
                User skill
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onAddMcp();
                }}
              >
                MCP server
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
