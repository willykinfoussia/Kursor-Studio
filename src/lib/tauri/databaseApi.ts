import { invokeCommand } from "./invoke";
import type {
  AgentRecord,
  AgentRunRecord,
  AgentSessionRecord,
  ConversationRecord,
  EventTraceRecord,
  MemoryRecord,
  MessageRecord,
  ProjectFileRecord,
  ProjectRecord,
  SettingRecord,
  AgentStepRecord,
  TaskRecord,
  ToolCallRecord,
  UsageRecord,
  AiChangeSetRecord,
  AiReviewDecisionRecord,
  KnowledgeProposalRecord,
} from "../storage/types";

export const databaseApi = {
  settingsList: () => invokeCommand<SettingRecord[]>("db_settings_list", undefined, []),
  settingsSet: (key: string, value: string) => invokeCommand<void>("db_settings_set", { key, value }),
  globalSettingsList: (accountId: string) =>
    invokeCommand<SettingRecord[]>("db_global_settings_list", { accountId }, []),
  globalSettingsSet: (accountId: string, key: string, value: string) =>
    invokeCommand<void>("db_global_settings_set", { accountId, key, value }),
  projectSettingsList: (projectId: string) =>
    invokeCommand<SettingRecord[]>("db_project_settings_list", { projectId }, []),
  projectSettingsSet: (projectId: string, key: string, value: string) =>
    invokeCommand<void>("db_project_settings_set", { projectId, key, value }),
  projectsUpsert: (project: ProjectRecord) => invokeCommand<ProjectRecord>("db_projects_upsert", { project }),
  projectsListRecent: (limit = 12) => invokeCommand<ProjectRecord[]>("db_projects_list_recent", { limit }, []),
  projectsList: (accountId?: string | null) =>
    invokeCommand<ProjectRecord[]>("db_projects_list", { accountId }, []),
  projectsGet: (id: string) => invokeCommand<ProjectRecord | null>("db_projects_get", { id }, null),
  projectsGetByPath: (path: string) =>
    invokeCommand<ProjectRecord | null>("db_projects_get_by_path", { path }, null),
  projectsDelete: (id: string) => invokeCommand<void>("db_projects_delete", { id }),
  conversationsUpsert: (conversation: ConversationRecord) =>
    invokeCommand<void>("db_conversations_upsert", { conversation }),
  conversationsList: (projectId?: string | null, includeArchived = false) =>
    invokeCommand<ConversationRecord[]>("db_conversations_list", { projectId, includeArchived }, []),
  conversationsGet: (id: string) =>
    invokeCommand<ConversationRecord | null>("db_conversations_get", { id }, null),
  conversationsArchive: (id: string) => invokeCommand<void>("db_conversations_archive", { id }),
  messagesUpsert: (message: MessageRecord) => invokeCommand<void>("db_messages_upsert", { message }),
  messagesList: (conversationId: string, limit = 100, before?: number) =>
    invokeCommand<MessageRecord[]>("db_messages_list", { conversationId, limit, before }, []),
  agentRunsUpsert: (run: AgentRunRecord) => invokeCommand<void>("db_agent_runs_upsert", { run }),
  agentRunsGet: (id: string) => invokeCommand<AgentRunRecord | null>("db_agent_runs_get", { id }, null),
  agentRunsList: (projectId?: string | null, limit = 40) =>
    invokeCommand<AgentRunRecord[]>("db_agent_runs_list", { projectId, limit }, []),
  sessionsUpsert: (session: AgentSessionRecord) => invokeCommand<void>("db_sessions_upsert", { session }),
  sessionsGet: (id: string) => invokeCommand<AgentSessionRecord | null>("db_sessions_get", { id }, null),
  sessionsList: (projectId?: string | null, status?: string | null) =>
    invokeCommand<AgentSessionRecord[]>("db_sessions_list", { projectId, status }, []),
  sessionsListInterrupted: (projectId?: string | null) =>
    invokeCommand<AgentSessionRecord[]>("db_sessions_list_interrupted", { projectId }, []),
  tasksUpsert: (task: TaskRecord) => invokeCommand<void>("db_tasks_upsert", { task }),
  tasksList: (projectId?: string | null) => invokeCommand<TaskRecord[]>("db_tasks_list", { projectId }, []),
  toolCallsUpsert: (call: ToolCallRecord) => invokeCommand<void>("db_tool_calls_upsert", { call }),
  toolCallsList: (agentRunId: string) =>
    invokeCommand<ToolCallRecord[]>("db_tool_calls_list", { agentRunId }, []),
  stepsUpsert: (step: AgentStepRecord) => invokeCommand<void>("db_steps_upsert", { step }),
  stepsList: (agentRunId: string) => invokeCommand<AgentStepRecord[]>("db_steps_list", { agentRunId }, []),
  eventTracesAppend: (record: EventTraceRecord) => invokeCommand<void>("db_event_traces_append", { record }),
  eventTracesList: (runId: string) => invokeCommand<EventTraceRecord[]>("db_event_traces_list", { runId }, []),
  agentsList: () => invokeCommand<AgentRecord[]>("db_agents_list", undefined, []),
  agentsUpsert: (agent: AgentRecord) => invokeCommand<void>("db_agents_upsert", { agent }),
  memoryUpsert: (memory: MemoryRecord) => invokeCommand<void>("db_memory_upsert", { memory }),
  memoryGet: (id: string) => invokeCommand<MemoryRecord | null>("db_memory_get", { id }, null),
  memorySearch: (projectId: string | null | undefined, query: string) =>
    invokeCommand<MemoryRecord[]>("db_memory_search", { projectId, query }, []),
  memoryDelete: (id: string) => invokeCommand<void>("db_memory_delete", { id }),
  projectFilesUpsert: (file: ProjectFileRecord) => invokeCommand<void>("db_project_files_upsert", { file }),
  projectFilesList: (projectId: string) => invokeCommand<ProjectFileRecord[]>("db_project_files_list", { projectId }, []),
  projectFilesDelete: (projectId: string, path: string) =>
    invokeCommand<void>("db_project_files_delete", { projectId, path }),
  usageInsert: (usage: UsageRecord) => invokeCommand<void>("db_usage_insert", { usage }),
  usageList: (limit = 200) => invokeCommand<UsageRecord[]>("db_usage_list", { limit }, []),
  resetApplicationData: () => invokeCommand<void>("db_reset_application_data"),
  exportApplicationData: () => invokeCommand<string>("db_export_application_data", undefined, ""),
  importApplicationData: (path: string) => invokeCommand<string>("db_import_application_data", { path }, ""),
  aiChangeSetsSave: (record: AiChangeSetRecord) => invokeCommand<void>("db_ai_change_sets_save", { record }),
  aiChangeSetsGet: (id: string) =>
    invokeCommand<AiChangeSetRecord | null>("db_ai_change_sets_get", { id }, null),
  aiChangeSetsListOpen: (projectId: string) =>
    invokeCommand<AiChangeSetRecord[]>("db_ai_change_sets_list_open", { projectId }, []),
  aiReviewDecisionsInsert: (record: AiReviewDecisionRecord) =>
    invokeCommand<void>("db_ai_review_decisions_insert", { record }),
  knowledgeProposalUpsert: (record: KnowledgeProposalRecord) =>
    invokeCommand<void>("db_knowledge_proposals_upsert", { record }),
  knowledgeProposalGet: (id: string) =>
    invokeCommand<KnowledgeProposalRecord | null>("db_knowledge_proposals_get", { id }, null),
  knowledgeProposalList: (projectId: string, status?: string) =>
    invokeCommand<KnowledgeProposalRecord[]>("db_knowledge_proposals_list", { projectId, status }, []),
  knowledgeProposalListByConversation: (conversationId: string) =>
    invokeCommand<KnowledgeProposalRecord[]>("db_knowledge_proposals_list_conversation", { conversationId }, []),
};
