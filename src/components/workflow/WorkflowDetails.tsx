import { formatDuration } from "../../lib/agent/conversation";
import type { AgentGraphEdge, AgentGraphNode } from "../../lib/workflow/types";
import {
  openCapability,
  openNodeInChat,
  openNodeInEditor,
  openNodeInTerminal,
  resolveApprovalFromGraph,
} from "../../lib/workflow/navigation";
import { capabilityIdFromNode } from "../../lib/capabilities/fromGraph";
import { canDrillNode } from "../../lib/workflow/graphFocus";
import { isFiletBranch, isProcessPhase, PIPELINE_IDS } from "../../lib/workflow/pipelineSchema";
import { useWorkflowStore } from "../../stores/workflowStore";

export function WorkflowDetails({
  node,
  edge,
  inbound,
  graphNodes = [],
}: {
  node: AgentGraphNode | null;
  edge: AgentGraphEdge | null;
  inbound: AgentGraphNode[];
  graphNodes?: AgentGraphNode[];
}) {
  const developerMode = useWorkflowStore((state) => state.developerMode);
  const setDeveloperMode = useWorkflowStore((state) => state.setDeveloperMode);
  const canvasMode = useWorkflowStore((state) => state.canvasMode);
  if (!node && !edge) {
    return (
      <aside className="wf-details" aria-label="Node details">
        <div className="wf-details-empty">
          {canvasMode === "pipeline"
            ? "Select a harness step. AgentLoop packs Superpowers filets (1%, Explain/Bug/Build). Double-click the AgentLoop frame for runtime; double-click Context Builder for sources."
            : "Select a node to inspect the run."}
        </div>
        <label className="wf-dev">
          <input type="checkbox" checked={developerMode} onChange={(event) => setDeveloperMode(event.target.checked)} />
          Developer Mode
        </label>
      </aside>
    );
  }

  return (
    <aside className="wf-details" aria-label="Node details">
      {node && <NodeBody node={node} inbound={inbound} graphNodes={graphNodes} />}
      {edge && !node && (
        <section>
          <h2>{edge.type}</h2>
          <p>{edge.source} → {edge.target}</p>
          {edge.evidenceLevel && <p>Evidence: {edge.evidenceLevel}</p>}
        </section>
      )}
      <label className="wf-dev">
        <input type="checkbox" checked={developerMode} onChange={(event) => setDeveloperMode(event.target.checked)} />
        Developer Mode
      </label>
      {developerMode && node && (
        <pre className="wf-raw">{JSON.stringify({ id: node.id, type: node.type, sequence: node.sequence, metadata: node.metadata }, null, 2)}</pre>
      )}
    </aside>
  );
}

function NodeBody({ node, inbound, graphNodes }: { node: AgentGraphNode; inbound: AgentGraphNode[]; graphNodes: AgentGraphNode[] }) {
  const duration = formatDuration(node.startedAt, node.finishedAt);
  const meta = node.metadata ?? {};
  const pending = usePendingApproval(node);
  const enterFocus = useWorkflowStore((state) => state.enterFocus);
  const canvasMode = useWorkflowStore((state) => state.canvasMode);
  const canDrill = canvasMode === "pipeline" && canDrillNode(node, graphNodes);

  return (
    <>
      <header>
        <div className="wf-details-kicker">{node.type.replace(/_/g, " ")}</div>
        <h2>{node.label}</h2>
      </header>
      {typeof meta.role === "string" && <p className="wf-role">{meta.role}</p>}
      {canDrill && (
        <p className="wf-muted">Double-click the node, or Enter, to open this graph.</p>
      )}
      <dl className="wf-dl">
        <div><dt>Status</dt><dd>{node.status}</dd></div>
        {duration && <div><dt>Duration</dt><dd>{duration}</dd></div>}
        {typeof node.sequence === "number" && <div><dt>Seq</dt><dd>{node.sequence}</dd></div>}
        {node.phase && <div><dt>Phase</dt><dd>{node.phase}</dd></div>}
        {typeof meta.model === "string" && <div><dt>Model</dt><dd>{meta.model}</dd></div>}
        {typeof meta.toolCount === "number" && <div><dt>Tools</dt><dd>{meta.toolCount}</dd></div>}
        {Array.isArray(meta.blockers) && meta.blockers.length > 0 && (
          <div><dt>Blockers</dt><dd>{(meta.blockers as string[]).join(", ")}</dd></div>
        )}
        {typeof meta.tokensUsed === "number" && <div><dt>Tokens</dt><dd>{meta.tokensUsed}</dd></div>}
        {typeof meta.complexity === "string" && <div><dt>Complexity</dt><dd>{meta.complexity}</dd></div>}
        {typeof meta.lastTool === "string" && <div><dt>Last tool</dt><dd>{meta.lastTool}</dd></div>}
        {typeof meta.extraTools === "number" && meta.extraTools > 0 && (
          <div><dt>More tools</dt><dd>+{meta.extraTools}</dd></div>
        )}
        {typeof meta.skillId === "string" && <div><dt>Skill</dt><dd>{meta.skillId}</dd></div>}
      </dl>
      {(typeof meta.inputPrompt === "string" || typeof meta.outputPrompt === "string") && (
        <section className="wf-prompt-io">
          <h3>Prompts</h3>
          {typeof meta.inputPrompt === "string" && (
            <div className="wf-prompt-block">
              <div className="wf-prompt-label">
                Entrée{typeof meta.inputRole === "string" ? ` · ${meta.inputRole}` : ""}
              </div>
              <pre className="wf-prompt-text">{meta.inputPrompt}</pre>
            </div>
          )}
          {typeof meta.outputPrompt === "string" && (
            <div className="wf-prompt-block">
              <div className="wf-prompt-label">
                Sortie{typeof meta.outputRole === "string" ? ` · ${meta.outputRole}` : ""}
              </div>
              <pre className="wf-prompt-text">{meta.outputPrompt}</pre>
            </div>
          )}
        </section>
      )}
      {isFiletBranch(node) && (
        <section>
          <h3>Filet</h3>
          <p>
            {node.id === PIPELINE_IDS.explain
              ? "goalKind explain / Ask — mutations denied."
              : node.id === PIPELINE_IDS.bug
                ? "goalKind bug / Debug — systematic-debugging before patch."
                : "goalKind build — HARD-GATE until designApproved."}
          </p>
        </section>
      )}
      {isProcessPhase(node) && (
        <section>
          <h3>{node.id === PIPELINE_IDS.designGate ? "Design gate" : "Process skill"}</h3>
          <p>
            {node.id === PIPELINE_IDS.designGate
              ? "Human yes records designApproved. Then writing-plans may run. The agent branch starts after Build."
              : "Skill loaded during the turn — shown in the AgentLoop box, not as a later harness stage."}
          </p>
          {meta.designApproved === true && <p>Design approved.</p>}
          {typeof meta.gate === "string" && <p>Gate {meta.gate}</p>}
          {Array.isArray(meta.typicalTools) && meta.typicalTools.length > 0 && (
            <p>Typical tools {(meta.typicalTools as string[]).join(", ")}</p>
          )}
        </section>
      )}
      {node.id === PIPELINE_IDS.loop && (
        <section>
          <h3>AgentLoop</h3>
          <p>Overview packs Superpowers filets. Double-click the frame for streamText, tools, verify, and subagents.</p>
        </section>
      )}
      {Array.isArray(meta.slices) && meta.slices.length > 0 && (
        <section>
          <h3>Context slices</h3>
          <ul>
            {(meta.slices as { source?: string; included?: boolean }[]).map((slice, index) => (
              <li key={`${slice.source ?? "slice"}-${index}`}>
                {slice.source ?? "slice"}{slice.included === false ? " (skipped)" : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
      {inbound.length > 0 && (
        <section>
          <h3>Inputs</h3>
          <ul>{inbound.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
        </section>
      )}
      {node.type === "tool" || node.type === "file" || node.type === "command" || node.type === "git" || node.type === "web_search" || node.type === "web_page" || node.type === "mcp_tool" || node.type === "mcp_server" ? (
        <section>
          <h3>{node.type === "mcp_server" ? "MCP server" : "Tool"}</h3>
          <p>{String(meta.tool ?? node.label)}</p>
          {typeof meta.mcpServerId === "string" && <p>Server {meta.mcpServerId}</p>}
          {typeof meta.mcpToolName === "string" && <p>Tool {meta.mcpToolName}</p>}
          {typeof meta.filePath === "string" && <p>{meta.filePath}</p>}
          {typeof meta.outputChars === "number" && <p>Output {meta.outputChars} chars</p>}
        </section>
      ) : null}
      {node.type === "memory" && (
        <section>
          <h3>Memory</h3>
          <p>{String(meta.memoryType ?? "Project")}</p>
        </section>
      )}
      {node.type === "rag" && (
        <section>
          <h3>RAG</h3>
          {typeof meta.path === "string" && <p>{meta.path}</p>}
        </section>
      )}
      {node.type === "skill" && (
        <section>
          <h3>Skill</h3>
          {typeof meta.reason === "string" && <p>{meta.reason}</p>}
          {typeof meta.version === "string" && <p>Version {meta.version}</p>}
        </section>
      )}
      {node.type === "verification" && (
        <section>
          <h3>Verification</h3>
          {Array.isArray(meta.commands) && <p>{(meta.commands as string[]).join(", ")}</p>}
          {Array.isArray(meta.blockers) && (meta.blockers as string[]).map((item) => <p key={item}>{item}</p>)}
        </section>
      )}
      {node.type === "approval" && pending && (
        <section>
          <h3>Waiting for approval</h3>
          {typeof meta.reason === "string" && <p>{meta.reason}</p>}
          {typeof meta.riskLevel === "string" && <p>Risk {meta.riskLevel}</p>}
          <div className="wf-actions">
            <button type="button" onClick={() => resolveApprovalFromGraph(node, "deny")}>Deny</button>
            <button type="button" onClick={() => resolveApprovalFromGraph(node, "allow")}>Allow</button>
          </div>
        </section>
      )}
      <div className="wf-actions">
        {canDrill && (
          <button type="button" onClick={() => enterFocus({ id: node.id, label: node.label })}>Enter graph</button>
        )}
        <button type="button" onClick={() => openNodeInChat(node)}>Open in Chat</button>
        {(typeof meta.filePath === "string" || typeof meta.path === "string") && (
          <button type="button" onClick={() => void openNodeInEditor(node)}>Open in Editor</button>
        )}
        {node.type === "command" && (
          <button type="button" onClick={() => openNodeInTerminal(node)}>Open Terminal</button>
        )}
        {capabilityIdFromNode(node) && (
          <button type="button" onClick={() => openCapability(capabilityIdFromNode(node)!)}>View capability</button>
        )}
      </div>
    </>
  );
}

function usePendingApproval(node: AgentGraphNode) {
  return node.type === "approval" && node.status === "running" && typeof node.metadata?.approvalId === "string";
}
