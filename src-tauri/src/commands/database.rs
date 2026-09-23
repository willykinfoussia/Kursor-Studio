use crate::database::records::*;
use crate::error::AppResult;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn db_settings_list(state: State<'_, AppState>) -> AppResult<Vec<SettingRecord>> {
    state.db.settings_list()
}

#[tauri::command]
pub fn db_settings_set(key: String, value: String, state: State<'_, AppState>) -> AppResult<()> {
    state.db.settings_set(&key, &value)
}

#[tauri::command]
pub fn db_global_settings_list(account_id: String, state: State<'_, AppState>) -> AppResult<Vec<SettingRecord>> {
    state.db.global_settings_list(&account_id)
}

#[tauri::command]
pub fn db_global_settings_set(account_id: String, key: String, value: String, state: State<'_, AppState>) -> AppResult<()> {
    state.db.global_settings_set(&account_id, &key, &value)
}

#[tauri::command]
pub fn db_project_settings_list(project_id: String, state: State<'_, AppState>) -> AppResult<Vec<SettingRecord>> {
    state.db.project_settings_list(&project_id)
}

#[tauri::command]
pub fn db_project_settings_set(project_id: String, key: String, value: String, state: State<'_, AppState>) -> AppResult<()> {
    state.db.project_settings_set(&project_id, &key, &value)
}

#[tauri::command]
pub fn db_github_account_get(account_id: String, state: State<'_, AppState>) -> AppResult<Option<crate::database::records::GitHubAccountRecord>> {
    state.db.get_github_account(&account_id)
}

#[tauri::command]
pub fn db_project_github_get(project_id: String, state: State<'_, AppState>) -> AppResult<Option<crate::database::records::ProjectGithubRepositoryRecord>> {
    state.db.get_project_github(&project_id)
}

#[tauri::command]
pub fn db_project_github_upsert(
    record: crate::database::records::ProjectGithubRepositoryRecord,
    state: State<'_, AppState>,
) -> AppResult<crate::database::records::ProjectGithubRepositoryRecord> {
    state.db.upsert_project_github(&record)
}

#[tauri::command]
pub fn db_project_github_delete(project_id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.db.delete_project_github(&project_id)
}

#[tauri::command]
pub fn db_projects_list(account_id: Option<String>, state: State<'_, AppState>) -> AppResult<Vec<ProjectRecord>> {
    state.db.list_projects(account_id.as_deref())
}

#[tauri::command]
pub fn db_projects_get_by_path(path: String, state: State<'_, AppState>) -> AppResult<Option<ProjectRecord>> {
    state.db.get_project_by_path(&path)
}

#[tauri::command]
pub fn db_projects_delete(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.db.delete_project_metadata(&id)
}

#[tauri::command]
pub fn db_projects_upsert(project: ProjectRecord, state: State<'_, AppState>) -> AppResult<ProjectRecord> {
    state.db.upsert_project(&project)
}

#[tauri::command]
pub fn db_projects_list_recent(limit: Option<i64>, state: State<'_, AppState>) -> AppResult<Vec<ProjectRecord>> {
    state.db.list_recent_projects(limit.unwrap_or(12))
}

#[tauri::command]
pub fn db_projects_get(id: String, state: State<'_, AppState>) -> AppResult<Option<ProjectRecord>> {
    state.db.get_project(&id)
}

#[tauri::command]
pub fn db_conversations_upsert(conversation: ConversationRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_conversation(&conversation)
}

#[tauri::command]
pub fn db_conversations_list(
    project_id: Option<String>,
    include_archived: Option<bool>,
    state: State<'_, AppState>,
) -> AppResult<Vec<ConversationRecord>> {
    state.db.list_conversations(project_id.as_deref(), include_archived.unwrap_or(false))
}

#[tauri::command]
pub fn db_conversations_get(id: String, state: State<'_, AppState>) -> AppResult<Option<ConversationRecord>> {
    state.db.get_conversation(&id)
}

#[tauri::command]
pub fn db_conversations_archive(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.db.archive_conversation(&id)
}

#[tauri::command]
pub fn db_messages_upsert(message: MessageRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_message(&message)
}

#[tauri::command]
pub fn db_messages_list(
    conversation_id: String,
    limit: Option<i64>,
    before: Option<i64>,
    state: State<'_, AppState>,
) -> AppResult<Vec<MessageRecord>> {
    state.db.list_messages(&conversation_id, limit.unwrap_or(100), before)
}

#[tauri::command]
pub fn db_agent_runs_upsert(run: AgentRunRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_run(&run)
}

#[tauri::command]
pub fn db_agent_runs_get(id: String, state: State<'_, AppState>) -> AppResult<Option<AgentRunRecord>> {
    state.db.get_run(&id)
}

#[tauri::command]
pub fn db_agent_runs_list(
    project_id: Option<String>,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> AppResult<Vec<AgentRunRecord>> {
    state.db.list_runs(project_id.as_deref(), limit.unwrap_or(40))
}

#[tauri::command]
pub fn db_sessions_upsert(session: AgentSessionRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_session(&session)
}

#[tauri::command]
pub fn db_sessions_get(id: String, state: State<'_, AppState>) -> AppResult<Option<AgentSessionRecord>> {
    state.db.get_session(&id)
}

#[tauri::command]
pub fn db_sessions_list(
    project_id: Option<String>,
    status: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<AgentSessionRecord>> {
    state.db.list_sessions(project_id.as_deref(), status.as_deref())
}

#[tauri::command]
pub fn db_sessions_list_interrupted(
    project_id: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<AgentSessionRecord>> {
    state.db.list_interrupted_sessions(project_id.as_deref())
}

#[tauri::command]
pub fn db_tasks_upsert(task: TaskRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_task(&task)
}

#[tauri::command]
pub fn db_tasks_list(project_id: Option<String>, state: State<'_, AppState>) -> AppResult<Vec<TaskRecord>> {
    state.db.list_tasks(project_id.as_deref())
}

#[tauri::command]
pub fn db_tool_calls_upsert(call: ToolCallRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_tool_call(&call)
}

#[tauri::command]
pub fn db_tool_calls_list(agent_run_id: String, state: State<'_, AppState>) -> AppResult<Vec<ToolCallRecord>> {
    state.db.list_tool_calls(&agent_run_id)
}

#[tauri::command]
pub fn db_steps_upsert(step: AgentStepRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_step(&step)
}

#[tauri::command]
pub fn db_steps_list(agent_run_id: String, state: State<'_, AppState>) -> AppResult<Vec<AgentStepRecord>> {
    state.db.list_steps(&agent_run_id)
}

#[tauri::command]
pub fn db_event_traces_append(record: EventTraceRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.append_event_trace(&record)
}

#[tauri::command]
pub fn db_event_traces_list(run_id: String, state: State<'_, AppState>) -> AppResult<Vec<EventTraceRecord>> {
    state.db.list_event_traces(&run_id)
}

#[tauri::command]
pub fn db_agents_list(state: State<'_, AppState>) -> AppResult<Vec<AgentRecord>> {
    state.db.list_agents()
}

#[tauri::command]
pub fn db_agents_upsert(agent: AgentRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_agent(&agent)
}

#[tauri::command]
pub fn db_memory_upsert(memory: MemoryRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_memory(&memory)
}

#[tauri::command]
pub fn db_memory_get(id: String, state: State<'_, AppState>) -> AppResult<Option<MemoryRecord>> {
    state.db.get_memory(&id)
}

#[tauri::command]
pub fn db_memory_search(
    project_id: Option<String>,
    query: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<MemoryRecord>> {
    state.db.search_memory(project_id.as_deref(), &query)
}

#[tauri::command]
pub fn db_memory_delete(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.db.delete_memory(&id)
}

#[tauri::command]
pub fn db_project_files_upsert(file: ProjectFileRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_project_file(&file)
}

#[tauri::command]
pub fn db_project_files_list(project_id: String, state: State<'_, AppState>) -> AppResult<Vec<ProjectFileRecord>> {
    state.db.list_project_files(&project_id)
}

#[tauri::command]
pub fn db_project_files_delete(project_id: String, path: String, state: State<'_, AppState>) -> AppResult<()> {
    state.db.delete_project_file(&project_id, &path)
}

#[tauri::command]
pub fn db_usage_insert(usage: UsageRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.insert_usage(&usage)
}

#[tauri::command]
pub fn db_usage_list(limit: Option<i64>, state: State<'_, AppState>) -> AppResult<Vec<UsageRecord>> {
    state.db.list_usage(limit.unwrap_or(200))
}

#[tauri::command]
pub fn db_reset_application_data(state: State<'_, AppState>) -> AppResult<()> {
    state.vector.clear()?;
    state.db.reset_application_data()
}

#[tauri::command]
pub fn db_export_application_data(state: State<'_, AppState>) -> AppResult<String> {
    Ok(state.db.export_application_data()?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn db_import_application_data(_path: String) -> AppResult<String> {
    Ok("Import is prepared. Copy a backup over kursor.db after restart to restore.".to_owned())
}

#[tauri::command]
pub fn db_ai_change_sets_save(record: AiChangeSetRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.save_ai_change_set(&record)
}

#[tauri::command]
pub fn db_ai_change_sets_get(id: String, state: State<'_, AppState>) -> AppResult<Option<AiChangeSetRecord>> {
    state.db.get_ai_change_set(&id)
}

#[tauri::command]
pub fn db_ai_change_sets_list_open(project_id: String, state: State<'_, AppState>) -> AppResult<Vec<AiChangeSetRecord>> {
    state.db.list_open_ai_change_sets(&project_id)
}

#[tauri::command]
pub fn db_ai_review_decisions_insert(record: AiReviewDecisionRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.insert_ai_review_decision(&record)
}

#[tauri::command]
pub fn db_knowledge_proposals_upsert(record: KnowledgeProposalRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_knowledge_proposal(&record)
}

#[tauri::command]
pub fn db_knowledge_proposals_get(id: String, state: State<'_, AppState>) -> AppResult<Option<KnowledgeProposalRecord>> {
    state.db.get_knowledge_proposal(&id)
}

#[tauri::command]
pub fn db_knowledge_proposals_list(
    project_id: String,
    status: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<KnowledgeProposalRecord>> {
    state.db.list_knowledge_proposals(&project_id, status.as_deref())
}

#[tauri::command]
pub fn db_knowledge_proposals_list_conversation(
    conversation_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<KnowledgeProposalRecord>> {
    state.db.list_knowledge_proposals_for_conversation(&conversation_id)
}

#[tauri::command]
pub fn db_test_strategy_upsert(record: TestStrategyRecord, state: State<'_, AppState>) -> AppResult<()> {
    state.db.upsert_test_strategy(&record)
}

#[tauri::command]
pub fn db_test_strategy_get(project_id: String, state: State<'_, AppState>) -> AppResult<Option<TestStrategyRecord>> {
    state.db.get_test_strategy(&project_id)
}

#[tauri::command]
pub fn db_user_cases_replace(
    project_id: String,
    cases: Vec<UserCaseRecord>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.db.replace_user_cases(&project_id, &cases)
}

#[tauri::command]
pub fn db_user_cases_list(project_id: String, state: State<'_, AppState>) -> AppResult<Vec<UserCaseRecord>> {
    state.db.list_user_cases(&project_id)
}

#[tauri::command]
pub fn db_test_run_save(bundle: TestRunBundle, state: State<'_, AppState>) -> AppResult<()> {
    state.db.save_test_run(&bundle)
}

#[tauri::command]
pub fn db_test_monitoring_query(
    query: TestMonitoringQuery,
    state: State<'_, AppState>,
) -> AppResult<TestMonitoringBundle> {
    state.db.query_test_monitoring(&query)
}
