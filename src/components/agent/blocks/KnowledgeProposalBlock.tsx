import { useEffect, useMemo } from "react";
import { FileText, Sparkles } from "lucide-react";
import { knowledgeProposalStore } from "../../../lib/agent/knowledge/KnowledgeProposalStore";
import { useKnowledgeStore } from "../../../stores/knowledgeStore";

export function KnowledgeProposalBlock({ proposalId, summary }: { proposalId: string; summary: string }) {
  const proposal = useKnowledgeStore((state) => state.proposals.find((item) => item.id === proposalId));
  const ingest = useKnowledgeStore((state) => state.ingest);

  useEffect(() => {
    if (proposal) return;
    void knowledgeProposalStore.get(proposalId).then((item) => {
      if (item) ingest(item);
    });
  }, [proposal, proposalId, ingest]);

  const actions = useMemo(() => {
    if (!proposal) return [];
    return [
      ...proposal.payload.skillActions.map((action) => ({
        id: action.id,
        kind: "skill" as const,
        action: action.action,
        name: action.skillId,
        rationale: action.rationale,
      })),
      ...proposal.payload.specActions.map((action) => ({
        id: action.id,
        kind: "spec" as const,
        action: action.action,
        name: action.path || action.fileName || action.group || action.action,
        rationale: action.rationale,
      })),
    ];
  }, [proposal]);

  const empty = proposal
    ? actions.length === 0
    : /aucun skill ni spec|no durable skill or spec/i.test(summary);
  const title = empty ? "Aucun skill ni spec créé" : "Created / updated skills & specs";

  return (
    <div className="knowledge-proposal-block" aria-label={title}>
      <div className="tool-activity-title">{title}</div>
      <p className="completion-summary">{proposal?.summary || summary}</p>
      {actions.length > 0 ? (
        <ul className="knowledge-proposal-list">
          {actions.map((item) => {
            const Icon = item.kind === "skill" ? Sparkles : FileText;
            return (
              <li key={item.id} className={`knowledge-row knowledge-row-${item.kind}`}>
                <span className={`knowledge-row-icon knowledge-row-icon-${item.kind}`} aria-hidden="true">
                  <Icon size={14} strokeWidth={1.8} />
                </span>
                <div className="knowledge-row-body">
                  <div className="knowledge-row-meta">
                    <span className={`knowledge-action-pill knowledge-action-${item.action}`}>
                      {item.action === "update" ? "updated" : item.action === "delete" ? "deleted" : item.action === "reorganize" ? "moved" : "created"}
                    </span>
                    <span className="knowledge-row-kind">{item.kind}</span>
                    <span className="knowledge-row-name">{item.name}</span>
                  </div>
                  {item.rationale ? <p>{item.rationale}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
