import { agentRuntime } from "../agent/AgentRuntime";
import { persistNewConversation } from "../storage/session";
import { useAccountStore } from "../../stores/accountStore";
import { useAgentStore } from "../../stores/agentStore";
import { useProjectStore } from "../../stores/projectStore";
import { gitService } from "./GitService";
import { parseGitReview, type GitReviewResult } from "./review/parseReview";

function reviewPrompt(base: string, files: string[]) {
  const list = files.slice(0, 40).join("\n- ");
  return `Review the current git changes against ${base || "HEAD"}.
Focus on bugs, regressions, performance, security, and architecture.
Changed files:
- ${list || "(working tree)"}

Use git_status and git_diff. Do not edit files.
End with a JSON object and nothing after it:
{"summary":"...","risk":"low|medium|high","findings":[{"title":"...","detail":"...","file":"optional/path"}],"issues":["..."],"files":["..."]}`;
}

export const gitReviewService = {
  async analyze(base: string, files: string[], onDelta?: (text: string) => void): Promise<GitReviewResult> {
    if (agentRuntime.isBusy()) {
      throw new Error("The agent is already running. Stop it before analyzing git changes.");
    }
    const store = useAgentStore.getState();
    agentRuntime.stashActiveWorkflow();
    store.createConversation();
    const active = store.conversations.find((item) => item.id === store.activeConversationId);
    if (active) {
      active.title = "Git review";
      void persistNewConversation(active);
    }
    agentRuntime.adoptConversationWorkflow(null);
    agentRuntime.loadMessages([]);
    const projectId = useProjectStore.getState().currentProject?.id;
    const accountId = useAccountStore.getState().currentAccount?.id ?? "local-account";
    if (projectId && active) {
      agentRuntime.setContext({ accountId, projectId, conversationId: active.id });
    }
    const unsubscribe = onDelta
      ? agentRuntime.subscribe((event) => {
          if (event.type === "text-delta") onDelta(event.text);
        })
      : () => undefined;
    try {
      await agentRuntime.sendMessage(reviewPrompt(base, files));
    } finally {
      unsubscribe();
    }
    const messages = useAgentStore.getState().messages;
    const assistant = [...messages].reverse().find((message) => message.role === "assistant");
    return parseGitReview(assistant?.content ?? "Review finished without a summary.");
  },

  async applyFix(finding: { title: string; detail: string; file?: string }) {
    if (agentRuntime.isBusy()) {
      throw new Error("The agent is already running.");
    }
    const store = useAgentStore.getState();
    agentRuntime.stashActiveWorkflow();
    store.createConversation();
    const active = store.conversations.find((item) => item.id === store.activeConversationId);
    if (active) {
      active.title = `Fix: ${finding.title}`;
      void persistNewConversation(active);
    }
    agentRuntime.adoptConversationWorkflow(null);
    agentRuntime.loadMessages([]);
    const projectId = useProjectStore.getState().currentProject?.id;
    const accountId = useAccountStore.getState().currentAccount?.id ?? "local-account";
    if (projectId && active) {
      agentRuntime.setContext({ accountId, projectId, conversationId: active.id });
    }
    const fileHint = finding.file ? ` in ${finding.file}` : "";
    await agentRuntime.sendMessage(
      `Apply this git review fix${fileHint}. Prefer apply_patch. Keep the change minimal.\n\n${finding.title}\n${finding.detail}`,
    );
  },

  async changedPaths() {
    const status = await gitService.status();
    return gitService.files(status).map((file) => file.path);
  },
};
