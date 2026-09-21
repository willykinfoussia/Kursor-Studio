import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useAgentRuntime } from "../../hooks/useAgentRuntime";
import {
  defaultChatPrefs,
  shouldStickCurrentTask,
} from "../../lib/agent/conversation";
import type { ApprovalDecision } from "../../lib/agent/permissions/types";
import {
  persistConversationDelete,
  persistConversationSwitch,
  persistNewConversation,
} from "../../lib/storage/session";
import { useAgentStore } from "../../stores/agentStore";
import { useAgentUiStore } from "../../stores/agentUiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useAccountStore } from "../../stores/accountStore";
import { AgentHeader } from "./AgentHeader";
import { AgentComposer } from "./AgentComposer";
import { ConversationTimeline } from "./conversation/ConversationTimeline";
import { TaskBlock } from "./blocks/TaskBlock";
import { ApprovalDock } from "./blocks/ApprovalDock";
import { ChangeReviewDock } from "./ChangeReviewDock";
import { PlanProgressDock } from "./PlanProgressDock";
import { NewActivityButton } from "./scrolling/NewActivityButton";
import { useAutoScroll } from "./scrolling/useAutoScroll";
import { modeNoticeText } from "../../lib/agent/modes";
import { isAffirmativeReply } from "../../lib/agent/workflow/approvalLanguage";
import { isUserQuestionStep } from "../../lib/agent/workflow/questionOptions";
import { buildPlan, isPlanBuildable, latestBuildablePlanId } from "../../lib/agent/plans/buildPlan";
import { usePlanStore } from "../../stores/planStore";

export function AgentPanel() {
  const status = useAgentStore((state) => state.status);
  const messages = useAgentStore((state) => state.messages);
  const timeline = useAgentStore((state) => state.timeline);
  const activeModel = useAgentStore((state) => state.activeModel);
  const isStreaming = useAgentStore((state) => state.isStreaming);
  const conversations = useAgentStore((state) => state.conversations);
  const activeConversationId = useAgentStore((state) => state.activeConversationId);
  const tasks = useAgentStore((state) => state.tasks);
  const tools = useAgentStore((state) => state.toolCalls);
  const runTask = useAgentStore((state) => state.runTask);
  const taskStartedAt = useAgentStore((state) => state.taskStartedAt);
  const pendingApprovals = useAgentStore((state) => state.pendingApprovals);
  const agentMode = useAgentStore((state) => state.agentMode);
  const recoveryAvailable = useAgentStore((state) => state.recoveryAvailable);
  const customModels = useSettingsStore((state) => state.customModels);
  const compactTools = useSettingsStore((state) => state.compactTools);
  const autoCollapseCompletedTools = useSettingsStore((state) => state.autoCollapseCompletedTools);
  const showToolDetails = useSettingsStore((state) => state.showToolDetails);
  const showThinkingDetails = useSettingsStore((state) => state.showThinkingDetails);
  const stickyCurrentTask = useSettingsStore((state) => state.stickyCurrentTask);
  const plans = usePlanStore((state) => state.plans);
  const activePlanId = usePlanStore((state) => state.activePlanId);
  const canBuildPlan = (() => {
    const active = activePlanId ? plans[activePlanId] : null;
    if (active) return isPlanBuildable(active, isStreaming);
    return Object.values(plans).some((plan) => isPlanBuildable(plan, isStreaming));
  })();
  const prefs = useMemo(
    () => defaultChatPrefs({
      compactTools,
      autoCollapseCompletedTools,
      showToolDetails,
      showThinkingDetails,
      stickyCurrentTask,
    }),
    [compactTools, autoCollapseCompletedTools, showToolDetails, showThinkingDetails, stickyCurrentTask],
  );
  const expanded = useAgentUiStore((state) => state.expanded);
  const stickyDismissed = useAgentUiStore((state) => state.stickyDismissed);
  const highlightedItemId = useAgentUiStore((state) => state.highlightedItemId);
  const setExpanded = useAgentUiStore((state) => state.setExpanded);
  const dismissSticky = useAgentUiStore((state) => state.dismissSticky);
  const resetUi = useAgentUiStore((state) => state.resetUi);
  const projectName = useProjectStore((state) => state.currentProject?.name);
  const projectRoot = useProjectStore((state) => state.currentProject?.rootPath);
  const runtime = useAgentRuntime();
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [approvalIndex, setApprovalIndex] = useState(0);
  const [panelHeight, setPanelHeight] = useState(720);
  const panelRef = useRef<HTMLElement | null>(null);
  const thoughtStarted = useRef<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [thoughtMs, setThoughtMs] = useState<number | null>(null);

  const currentTask = runTask ?? tasks.find((task) => task.status === "running") ?? null;
  const taskRunning = currentTask?.status === "running";
  const taskElapsedMs = taskRunning && taskStartedAt ? now - taskStartedAt : 0;
  const planIndex = timeline.findIndex((item) => item.type === "plan");
  const itemsAfterPlan = planIndex >= 0 ? timeline.length - planIndex : timeline.length;
  const showSticky = currentTask ? shouldStickCurrentTask({
    prefs,
    taskRunning: Boolean(taskRunning),
    taskElapsedMs,
    itemsAfterPlan,
    stickyDismissed,
  }) : false;
  const lastAssistant = [...timeline].reverse().find((item) => item.type === "assistant");
  const streamingMessageId = isStreaming ? lastAssistant?.messageId : null;
  const latestActiveId = [...timeline].reverse().find((item) => item.type === "tool")?.id;
  const dockApprovals = pendingApprovals.filter((entry) => (
    entry.kind !== "workflow" || !isUserQuestionStep(entry.workflow.stepId)
  ));
  const pendingApproval = dockApprovals.length > 0;
  const hideComposer = pendingApproval && panelHeight < 420;

  const scroll = useAutoScroll([timeline, messages, tools]);

  useEffect(() => {
    if (!taskRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [taskRunning]);

  useEffect(() => {
    const thinkingNow = status === "thinking" || status === "planning";
    if (thinkingNow) {
      if (thoughtStarted.current == null) thoughtStarted.current = Date.now();
      setThinking(true);
      return;
    }
    if (thoughtStarted.current != null) {
      setThoughtMs(Date.now() - thoughtStarted.current);
      thoughtStarted.current = null;
    }
    setThinking(false);
  }, [status]);

  useEffect(() => {
    thoughtStarted.current = null;
    setThoughtMs(null);
    setThinking(false);
    setApprovalIndex(0);
  }, [activeConversationId]);

  useEffect(() => {
    if (dockApprovals.length === 0) {
      if (approvalIndex !== 0) setApprovalIndex(0);
      return;
    }
    if (approvalIndex >= dockApprovals.length) setApprovalIndex(dockApprovals.length - 1);
  }, [approvalIndex, dockApprovals.length]);

  useEffect(() => {
    if (!highlightedItemId?.startsWith("approval:")) return;
    const node = document.querySelector("[data-approval-dock]");
    if (node instanceof HTMLElement) node.focus();
  }, [highlightedItemId]);

  useEffect(() => {
    const node = panelRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (!height) return;
      const rounded = Math.round(height);
      setPanelHeight((prev) => (prev === rounded ? prev : rounded));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "c" && isStreaming) {
        event.preventDefault();
        runtime.cancel();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "ArrowDown" && scroll.showNewActivity) {
        event.preventDefault();
        scroll.scrollToBottom();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isStreaming, runtime, scroll.showNewActivity, scroll.scrollToBottom]);

  const send = async (text = input) => {
    const message = text.trim();
    if (!message || isStreaming) return;
    setInput("");
    thoughtStarted.current = null;
    setThoughtMs(null);
    await runtime.sendMessage(message);
  };

  const newConversation = () => {
    runtime.cancel();
    runtime.stashActiveWorkflow();
    useAgentStore.getState().createConversation();
    runtime.adoptConversationWorkflow(null);
    runtime.loadMessages(useAgentStore.getState().messages);
    const active = useAgentStore.getState().conversations.find((item) => item.id === useAgentStore.getState().activeConversationId);
    if (active) void persistNewConversation(active);
    const projectId = useProjectStore.getState().currentProject?.id;
    const accountId = useAccountStore.getState().currentAccount?.id ?? "local-account";
    if (projectId && active) runtime.setContext({ accountId, projectId, conversationId: active.id });
    resetUi();
    setMenuOpen(false);
    setHistoryOpen(false);
  };

  const openConversation = (id: string) => {
    runtime.cancel();
    void persistConversationSwitch(id, runtime);
    resetUi();
    setHistoryOpen(false);
    setMenuOpen(false);
  };

  const removeConversation = (id: string, event: MouseEvent) => {
    event.stopPropagation();
    runtime.cancel();
    runtime.stashActiveWorkflow();
    void persistConversationDelete(id);
    useAgentStore.getState().deleteConversation(id);
    const next = useAgentStore.getState().conversations.find((item) => item.id === useAgentStore.getState().activeConversationId);
    runtime.adoptConversationWorkflow(next?.workflowSession ?? null);
    runtime.loadMessages(useAgentStore.getState().messages);
    resetUi();
  };

  const toggle = (id: string, currentlyExpanded: boolean) => {
    setExpanded(id, !currentlyExpanded);
  };

  const resolvePermission = (id: string, decision: ApprovalDecision) => {
    useAgentStore.getState().resolvePermissionTrace(id, decision === "allow-once" ? "allow-once" : decision);
    useAgentStore.getState().dequeuePendingApproval(id);
    runtime.resolvePermission(id, decision);
  };

  const resolveWorkflow = (id: string, decision: "allow" | "deny") => {
    useAgentStore.getState().dequeuePendingApproval(id);
    runtime.resolveWorkflowApproval(id, decision);
  };

  const messageSummaries = useMemo(
    () => messages.map((message) => ({ id: message.id, content: message.content })),
    [messages],
  );

  return (
    <aside className="agent-panel" ref={panelRef}>
      <AgentHeader
        status={status}
        activeModel={activeModel}
        customModels={customModels}
        conversations={conversations}
        activeConversationId={activeConversationId}
        isStreaming={isStreaming}
        menuOpen={menuOpen}
        historyOpen={historyOpen}
        onToggleMenu={() => { setMenuOpen((open) => !open); setHistoryOpen(false); }}
        onToggleHistory={() => { setHistoryOpen((open) => !open); setMenuOpen(false); }}
        onNewConversation={newConversation}
        onStop={() => { runtime.cancel(); setMenuOpen(false); }}
        onOpenConversation={openConversation}
        onRemoveConversation={removeConversation}
        projectName={projectName}
        conversationTitle={conversations.find((item) => item.id === activeConversationId)?.title}
      />
      {agentMode !== "agent" && (
        <p className="approval-copy" style={{ padding: "0 12px" }}>
          {modeNoticeText(agentMode)} Shift+Tab to cycle.
        </p>
      )}
      {showSticky && currentTask && (
        <TaskBlock
          title={currentTask.title}
          status={currentTask.status}
          activity={currentTask.activity}
          presentation={{ expanded: false, sticky: true, showDetails: false, focused: false }}
          sticky
          onToggle={() => undefined}
          onDismissSticky={dismissSticky}
        />
      )}
      <div className="agent-scroll-wrap">
        <div className="agent-scroll" ref={scroll.ref} onScroll={scroll.onScroll}>
        <ConversationTimeline
          items={timeline}
          messages={messageSummaries}
          tools={tools}
          prefs={prefs}
          status={status}
          streamingMessageId={streamingMessageId}
          recoveryAvailable={recoveryAvailable}
          userExpanded={expanded}
          stickyDismissed={stickyDismissed}
          taskRunning={Boolean(taskRunning)}
          taskElapsedMs={taskElapsedMs}
          latestActiveId={latestActiveId}
          thinking={thinking}
          thoughtMs={thoughtMs}
          onToggle={toggle}
          onSuggest={(text) => void send(text)}
          onStopProcess={() => runtime.cancel()}
          onRetry={() => {
            if (recoveryAvailable) {
              void runtime.retryRecovery();
              return;
            }
            const lastUser = [...messages].reverse().find((message) => message.role === "user");
            if (lastUser) void runtime.sendMessage(lastUser.content);
          }}
          onContinue={() => runtime.continueRecovery()}
          onRollback={() => void runtime.rollbackRecovery()}
          highlightedItemId={highlightedItemId}
          onAnswerQuestion={(id, selected) => {
            useAgentStore.getState().dequeuePendingApproval(id);
            runtime.resolveUserQuestion(id, selected, isAffirmativeReply(selected));
          }}
        />
        </div>
        {scroll.showNewActivity && <NewActivityButton onClick={() => scroll.scrollToBottom()} />}
      </div>
      <div className={`chat-bottom-area${pendingApproval ? " has-approval" : ""}`}>
        <PlanProgressDock />
        <ChangeReviewDock />
        <ApprovalDock
          entries={dockApprovals}
          index={approvalIndex}
          onIndexChange={setApprovalIndex}
          workingDirectory={projectRoot}
          highlighted={Boolean(highlightedItemId?.startsWith("approval:"))}
          onDeny={(id) => resolvePermission(id, "deny")}
          onAllowOnce={(id) => resolvePermission(id, "allow-once")}
          onAllowTask={(id) => resolvePermission(id, "allow-task")}
          onAllowPermanent={(id) => resolvePermission(id, "allow-permanent")}
          onApprovePlan={(id) => resolveWorkflow(id, "allow")}
          onRejectPlan={(id) => resolveWorkflow(id, "deny")}
          onSelectChoice={(id, selected) => {
            useAgentStore.getState().dequeuePendingApproval(id);
            const allow = isAffirmativeReply(selected);
            runtime.resolveUserQuestion(id, selected, allow);
          }}
          onStop={hideComposer ? () => runtime.cancel() : undefined}
        />
        <AgentComposer
          value={input}
          onChange={setInput}
          onSend={() => void send()}
          onStop={() => runtime.cancel()}
          isStreaming={isStreaming}
          compact={pendingApproval}
          hidden={hideComposer}
          approvalPending={pendingApproval}
          agentMode={agentMode}
          onSetMode={(mode) => {
            runtime.setInteractionMode(mode);
          }}
          onCycleMode={() => {
            runtime.cycleInteractionMode();
          }}
          canBuildPlan={canBuildPlan}
          onBuildPlan={() => {
            const planId = latestBuildablePlanId(isStreaming);
            if (planId) void buildPlan(planId);
          }}
        />
      </div>
    </aside>
  );
}
