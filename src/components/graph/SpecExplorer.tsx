import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Plus } from "lucide-react";
import { fileName } from "../../lib/filesystem/pathUtils";
import {
  ACCOUNT_GROUP_KINDS,
  isAccountSpec,
  isSpecFile,
  isSpecKind,
  PROJECT_GROUP_KINDS,
  sanitizeSpecGroupName,
  specDisplayRelative,
  specKindLabel,
  specScope,
  type SpecScope,
} from "../../lib/graph/classify";
import { graphService } from "../../lib/graph/GraphService";
import { buildSpecTree, collectGroupIds, type SpecTreeNode as TreeNode } from "../../lib/graph/specTree";
import type { FileNode } from "../../lib/graph/types";
import { useGraphStore } from "../../stores/graphStore";

const CUSTOM_TYPE = "__custom__";

function matchesQuery(file: FileNode, query: string): boolean {
  if (!query) return true;
  const haystack = [
    file.path,
    fileName(file.path),
    String(file.metadata.title ?? ""),
    file.tokens.join(" "),
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function uniqueNames(...lists: string[][]): string[] {
  const names = new Set<string>();
  for (const list of lists) {
    for (const name of list) {
      if (name) names.add(name);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function SpecTreeNode({
  node,
  depth,
  expanded,
  toggle,
  scope,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  scope: SpecScope;
}) {
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectSpec = useGraphStore((state) => state.selectSpec);
  const isGroup = node.kind === "group";
  const isExpanded = expanded.has(node.id);
  const selected = node.file && node.file.id === selectedNodeId;
  const kindClass = node.specKind ? `spec-kind-${node.specKind}` : "";

  if (isGroup) {
    return (
      <div className="spec-group" style={{ paddingLeft: depth * 8 }}>
        <button
          type="button"
          className={`spec-group-btn ${kindClass}`}
          onClick={() => toggle(node.id)}
          aria-expanded={isExpanded}
        >
          <span className="tree-chevron">
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className="spec-group-name">{specKindLabel(node.name, scope)}</span>
          <span className="spec-group-count">{node.count}</span>
        </button>
        {isExpanded && node.children.map((child) => (
          <SpecTreeNode key={child.id} node={child} depth={depth + 1} expanded={expanded} toggle={toggle} scope={scope} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`tree-row spec-file ${selected ? "selected" : ""} ${kindClass}`}
      style={{ paddingLeft: 10 + depth * 8 }}
      onClick={() => { if (node.file) selectSpec(node.file.path); }}
      role="treeitem"
      aria-selected={Boolean(selected)}
    >
      <FileText size={14} className="file-icon md-icon" />
      <span>{node.name}</span>
    </div>
  );
}

export function SpecExplorer() {
  const nodes = useGraphStore((state) => state.nodes);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectSpec = useGraphStore((state) => state.selectSpec);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"account" | "project">("project");
  const [creating, setCreating] = useState<"spec" | "group" | null>(null);
  const [group, setGroup] = useState("technical");
  const [customType, setCustomType] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [listedGroups, setListedGroups] = useState<string[]>([]);
  const [groupsVersion, setGroupsVersion] = useState(0);

  const specs = useMemo(
    () => nodes.filter((node) => isSpecFile(node.path) && specScope(node.path) === scope && matchesQuery(node, query.trim().toLowerCase())),
    [nodes, query, scope],
  );
  const extraGroups = useMemo(
    () => (query.trim() ? [] : listedGroups),
    [listedGroups, query],
  );
  const tree = useMemo(
    () => buildSpecTree(specs, extraGroups, scope),
    [specs, extraGroups, scope],
  );
  const groupOptions = useMemo(
    () => uniqueNames([...(scope === "project" ? PROJECT_GROUP_KINDS : ACCOUNT_GROUP_KINDS)], listedGroups),
    [listedGroups, scope],
  );

  useEffect(() => {
    let cancelled = false;
    void graphService.listSpecGroups(scope).then((groups) => {
      if (!cancelled) setListedGroups(groups);
    }).catch(() => {
      if (!cancelled) setListedGroups([]);
    });
    return () => { cancelled = true; };
  }, [scope, nodes, groupsVersion]);

  useEffect(() => {
    const fallback = scope === "project" ? "technical" : "stack";
    const allowed = new Set<string>(scope === "project" ? PROJECT_GROUP_KINDS : ACCOUNT_GROUP_KINDS);
    for (const name of listedGroups) allowed.add(name);
    allowed.add(CUSTOM_TYPE);
    if (scope === "account") allowed.add("");
    setGroup((current) => (allowed.has(current) ? current : fallback));
  }, [scope, listedGroups]);

  const selectedPath = nodes.find((node) => node.id === selectedNodeId)?.path;

  useEffect(() => {
    if (!selectedPath || !isSpecFile(selectedPath)) return;
    setScope(isAccountSpec(selectedPath) ? "account" : "project");
  }, [selectedNodeId, selectedPath]);

  useEffect(() => {
    const selected = nodes.find((node) => node.id === selectedNodeId);
    if (!selected || !isSpecFile(selected.path)) return;
    if ((isAccountSpec(selected.path) ? "account" : "project") !== scope) return;
    const ids: string[] = [];
    collectGroupIds(tree, specDisplayRelative(selected.path), ids);
    if (ids.length === 0) return;
    setExpanded((current) => {
      const next = new Set(current);
      let changed = false;
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [selectedNodeId, nodes, scope, tree]);

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createSpec = async () => {
    const fileNameValue = name.trim();
    if (!fileNameValue) return;
    const isCustom = group === CUSTOM_TYPE;
    const customName = sanitizeSpecGroupName(customType);
    if (isCustom && !customName) return;
    const typeName = isCustom ? customName : group;
    const kind = typeName && isSpecKind(typeName) && typeName !== "generic" ? typeName : undefined;
    setStatus("Creating…");
    try {
      const path = await graphService.createSpec({
        scope,
        kind,
        group: typeName || undefined,
        fileName: fileNameValue,
      });
      setName("");
      setCustomType("");
      setGroup(typeName || (scope === "project" ? "technical" : "stack"));
      setCreating(null);
      setStatus(null);
      setGroupsVersion((value) => value + 1);
      selectSpec(path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create spec.");
    }
  };

  const createGroup = async () => {
    const groupName = name.trim();
    if (!groupName) return;
    setStatus("Creating…");
    try {
      await graphService.createSpecGroup(scope, groupName);
      setGroup(sanitizeSpecGroupName(groupName));
      setName("");
      setCreating(null);
      setStatus(null);
      setGroupsVersion((value) => value + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create group.");
    }
  };

  return (
    <aside className="sidebar graph-tree spec-explorer">
      <div className="section-header">
        <span>SPECS</span>
        <button
          type="button"
          className="spec-new-btn"
          onClick={() => setCreating((value) => (value ? null : "spec"))}
          title="New spec or group"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="spec-scope-switch" role="tablist" aria-label="Spec scope">
        <button
          type="button"
          role="tab"
          className={scope === "account" ? "active user" : ""}
          aria-selected={scope === "account"}
          onClick={() => setScope("account")}
        >
          User
        </button>
        <button
          type="button"
          role="tab"
          className={scope === "project" ? "active project" : ""}
          aria-selected={scope === "project"}
          onClick={() => setScope("project")}
        >
          Project
        </button>
      </div>
      <div className="spec-search">
        <input
          type="search"
          value={query}
          placeholder={scope === "project" ? "Search project specs" : "Search user specs"}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {creating && (
        <div className="spec-create">
          <div className="spec-create-mode">
            <button type="button" className={creating === "spec" ? "active" : ""} onClick={() => setCreating("spec")}>Spec</button>
            <button type="button" className={creating === "group" ? "active" : ""} onClick={() => setCreating("group")}>Group</button>
          </div>
          {creating === "spec" && (
            <>
              <select value={group} onChange={(event) => setGroup(event.target.value)}>
                {scope === "account" && <option value="">Ungrouped</option>}
                {groupOptions.map((item) => (
                  <option key={item} value={item}>{specKindLabel(item, scope)}</option>
                ))}
                <option value={CUSTOM_TYPE}>Custom</option>
              </select>
              {group === CUSTOM_TYPE && (
                <input
                  value={customType}
                  placeholder="custom-type"
                  onChange={(event) => setCustomType(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createSpec();
                  }}
                />
              )}
            </>
          )}
          <input
            value={name}
            placeholder={creating === "group" ? "group-name" : "file-name"}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void (creating === "group" ? createGroup() : createSpec());
            }}
          />
          <button type="button" className="settings-action" onClick={() => void (creating === "group" ? createGroup() : createSpec())}>
            Create
          </button>
        </div>
      )}
      {status && <div className="graph-status spec-create-status">{status}</div>}
      <div className="tree" role="tree">
        {tree.children.length === 0 && (
          <div className="spec-empty">{scope === "project" ? "No project specs" : "No user specs"}</div>
        )}
        {tree.children.map((child) => (
          <SpecTreeNode key={child.id} node={child} depth={0} expanded={expanded} toggle={toggle} scope={scope} />
        ))}
      </div>
    </aside>
  );
}
