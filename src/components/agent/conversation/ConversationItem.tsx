import { memo } from "react";
import type { ConversationItem as Item, PresentationState } from "../../../lib/agent/conversation";
import type { ToolCall } from "../../../types/agent";
import { PlanBlock } from "../blocks/PlanBlock";
import { PlanCardBlock } from "../blocks/PlanCardBlock";
import { TaskBlock } from "../blocks/TaskBlock";
import { ToolBlock } from "../blocks/ToolBlock";
import { VerificationBlock } from "../blocks/VerificationBlock";
import { ChangesBlock } from "../blocks/ChangesBlock";
import { CompletionBlock } from "../blocks/CompletionBlock";
import { ReviewSummaryBlock } from "../blocks/ReviewSummaryBlock";
import { KnowledgeProposalBlock } from "../blocks/KnowledgeProposalBlock";
import { QuestionBlock } from "../blocks/QuestionBlock";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { SystemNotice } from "./SystemNotice";

export interface ConversationItemProps {
  item: Item;
  presentation: PresentationState;
  messageContent?: string;
  streaming?: boolean;
  tool?: ToolCall;
  childTools?: ToolCall[];
  recoveryAvailable?: boolean;
  onToggle: () => void;
  onStopProcess?: () => void;
  onRetry?: () => void;
  onContinue?: () => void;
  onRollback?: () => void;
  onAnswerQuestion?: (questionId: string, selected: string) => void;
}

function ConversationItemView({
  item,
  presentation,
  messageContent,
  streaming,
  tool,
  childTools,
  recoveryAvailable,
  onToggle,
  onStopProcess,
  onRetry,
  onContinue,
  onRollback,
  onAnswerQuestion,
}: ConversationItemProps) {
  switch (item.type) {
    case "user":
      return <UserMessage content={messageContent ?? ""} />;
    case "assistant":
      return <AssistantMessage content={item.content} streaming={streaming} />;
    case "plan":
      return <PlanBlock steps={item.steps} status={item.status} presentation={presentation} onToggle={onToggle} />;
    case "plan-card":
      return <PlanCardBlock planId={item.planId} />;
    case "task":
      if (presentation.sticky) return null;
      return (
        <TaskBlock
          title={item.title}
          status={item.status}
          activity={item.activity}
          childTools={childTools}
          presentation={presentation}
          onToggle={onToggle}
        />
      );
    case "tool":
      if (!tool) return null;
      return <ToolBlock tool={tool} presentation={presentation} onToggle={onToggle} onStop={onStopProcess} />;
    case "verification":
      return (
        <VerificationBlock
          status={item.status}
          ok={item.ok}
          blockers={item.blockers}
          commands={item.commands}
          attempt={item.attempt}
          results={item.results}
          presentation={presentation}
          onToggle={onToggle}
          workflowNodeId={item.id}
        />
      );
    case "changes":
      return <ChangesBlock paths={item.paths} presentation={presentation} onToggle={onToggle} />;
    case "approval":
    case "fallback":
      return null;
    case "review-summary":
      return (
        <ReviewSummaryBlock
          changeSetId={item.changeSetId}
          accepted={item.accepted}
          rejected={item.rejected}
          partial={item.partial}
          conflicted={item.conflicted}
        />
      );
    case "knowledge-proposal":
      return <KnowledgeProposalBlock proposalId={item.proposalId} summary={item.summary} />;
    case "user-question":
      return (
        <QuestionBlock
          prompt={item.prompt}
          options={item.options}
          selected={item.selected}
          onAnswer={item.selected ? undefined : onAnswerQuestion ? (selected) => onAnswerQuestion(item.questionId, selected) : undefined}
        />
      );
    case "completion":
      return (
        <CompletionBlock
          summary={item.summary}
          filesChanged={item.filesChanged}
          verificationOk={item.verificationOk}
          testsHint={item.testsHint}
          presentation={presentation}
          onToggle={onToggle}
        />
      );
    case "system":
      if (item.kind === "error") {
        return (
          <section className="compact-error-block" aria-live="polite">
            <strong>Unable to continue</strong>
            <p>{item.text || "The AI provider could not complete this request."}</p>
            {onRetry && <button type="button" className="permission-allow" onClick={onRetry}>Retry</button>}
          </section>
        );
      }
      if (item.kind === "recovery" || item.kind === "mode") {
        return (
          <SystemNotice
            kind={item.kind}
            text={item.text}
            recovery={item.kind === "recovery" && recoveryAvailable}
            onRetry={onRetry}
            onContinue={onContinue}
            onRollback={onRollback}
          />
        );
      }
      return null;
    default:
      return null;
  }
}

export const ConversationItem = memo(ConversationItemView);
