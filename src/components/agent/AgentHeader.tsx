import { type MouseEvent } from "react";
import {
  Bot, Check, History, MoreHorizontal, Plus, RefreshCw, Square, Trash2,
} from "lucide-react";
import { getModelName } from "../../lib/agent/config";
import { IconButton } from "../ui/Controls";
import type { AgentStatus } from "../../types/agent";
import type { CustomAIModel } from "../../types/settings";

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Idle",
  planning: "Planning",
  thinking: "Thinking",
  streaming: "Working",
  tool_call: "Working",
  waiting_approval: "Waiting",
  tool_result: "Working",
  verifying: "Verifying",
  fallback: "Working",
  completed: "Completed",
  failed: "Failed",
  error: "Error",
  cancelled: "Cancelled",
};

export function AgentHeader({
  status,
  activeModel,
  customModels,
  conversations,
  activeConversationId,
  isStreaming,
  menuOpen,
  historyOpen,
  onToggleMenu,
  onToggleHistory,
  onNewConversation,
  onStop,
  onOpenConversation,
  onRemoveConversation,
  projectName,
  conversationTitle,
}: {
  status: AgentStatus;
  activeModel: string | null;
  customModels: CustomAIModel[];
  conversations: { id: string; title: string; updatedAt: number }[];
  activeConversationId: string;
  isStreaming: boolean;
  menuOpen: boolean;
  historyOpen: boolean;
  onToggleMenu: () => void;
  onToggleHistory: () => void;
  onNewConversation: () => void;
  onStop: () => void;
  onOpenConversation: (id: string) => void;
  onRemoveConversation: (id: string, event: MouseEvent) => void;
  projectName?: string;
  conversationTitle?: string;
}) {
  const working = status !== "idle" && status !== "completed" && status !== "failed" && status !== "error" && status !== "cancelled";
  return (
    <header className="agent-header">
      <div className="agent-identity">
        <div className="agent-avatar"><Bot size={15} /></div>
        <div>
          <div className="agent-name">Agent{projectName ? ` · ${projectName}` : ""}</div>
          <div className={`agent-state status-${status}`}>
            {status === "fallback" ? <RefreshCw size={9} /> : status === "completed" ? <Check size={9} /> : <span className="status-dot" style={{ width: 5, height: 5 }} />}
            {working && status !== "waiting_approval" ? "Working" : STATUS_LABEL[status]}
            {conversationTitle ? ` · ${conversationTitle}` : ""}
          </div>
        </div>
      </div>
      {activeModel && <span className="model-badge" title={activeModel}>{getModelName(activeModel, customModels)}</span>}
      <div className="agent-header-actions" style={{ position: "relative" }}>
        <IconButton icon={Plus} label="New conversation" onClick={onNewConversation} />
        <IconButton icon={History} label="History" onClick={onToggleHistory} />
        {isStreaming && <IconButton icon={Square} label="Stop" onClick={onStop} />}
        <IconButton icon={MoreHorizontal} label="Menu Agent" onClick={onToggleMenu} />
        {menuOpen && (
          <div className="context-menu agent-menu" style={{ right: 6, top: 35 }}>
            <button className="context-item" onClick={onNewConversation}><Plus size={13} /> New conversation</button>
            <button className="context-item" disabled={!isStreaming} onClick={onStop}><Square size={12} /> Stop generation</button>
          </div>
        )}
        {historyOpen && conversations.length > 0 && (
          <div className="context-menu agent-menu agent-history-menu" style={{ right: 6, top: 35 }} role="menu" aria-label="Conversation history">
            {conversations.map((conversation) => (
              <div className="context-history-item" key={conversation.id}>
                <button
                  className={`context-item ${conversation.id === activeConversationId ? "active" : ""}`}
                  onClick={() => onOpenConversation(conversation.id)}
                >
                  <span className="context-history-title">{conversation.title}</span>
                </button>
                <button
                  type="button"
                  className="context-delete"
                  aria-label={`Delete ${conversation.title}`}
                  onClick={(event) => onRemoveConversation(conversation.id, event)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
