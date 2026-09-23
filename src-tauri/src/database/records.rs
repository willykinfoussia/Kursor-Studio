use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingRecord {
    pub key: String,
    pub value: String,
    pub updated_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountRecord {
    pub id: String,
    pub provider: String,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub onboarded: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAccountRecord {
    pub id: String,
    pub account_id: String,
    pub github_user_id: String,
    pub username: String,
    pub avatar_url: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGithubRepositoryRecord {
    pub id: String,
    pub project_id: String,
    pub github_repository_id: Option<String>,
    pub owner: Option<String>,
    pub name: Option<String>,
    pub full_name: Option<String>,
    pub html_url: Option<String>,
    pub clone_url: Option<String>,
    pub default_branch: Option<String>,
    pub private: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    #[serde(default)]
    pub account_id: Option<String>,
    pub name: String,
    pub root_path: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_opened_at: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRecord {
    pub id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRecord {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub created_at: i64,
    pub token_input: Option<i64>,
    pub token_output: Option<i64>,
    pub latency_ms: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRecord {
    pub id: String,
    #[serde(default)]
    pub account_id: Option<String>,
    pub conversation_id: Option<String>,
    pub project_id: Option<String>,
    pub agent_id: Option<String>,
    pub status: String,
    pub model: Option<String>,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub error: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub task_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionRecord {
    pub id: String,
    pub project_id: Option<String>,
    pub conversation_id: String,
    pub status: String,
    pub started_at: i64,
    pub updated_at: i64,
    pub current_step: Option<String>,
    pub current_goal: Option<String>,
    pub checkpoint_json: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRecord {
    pub id: String,
    pub project_id: Option<String>,
    pub agent_run_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub progress: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRecord {
    pub id: String,
    pub agent_run_id: String,
    pub tool_name: String,
    pub input_json: Option<String>,
    pub output_json: Option<String>,
    pub status: String,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub error: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStepRecord {
    pub id: String,
    pub agent_run_id: String,
    pub index: i64,
    pub kind: String,
    pub status: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventTraceRecord {
    pub id: String,
    pub run_id: Option<String>,
    pub session_id: Option<String>,
    pub task_id: Option<String>,
    pub seq: i64,
    pub event_type: String,
    pub payload_json: String,
    pub created_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub system_prompt: Option<String>,
    pub model: Option<String>,
    pub enabled: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRecord {
    pub id: String,
    pub agent_id: Option<String>,
    pub project_id: Option<String>,
    #[serde(default)]
    pub scope: Option<String>,
    pub memory_type: String,
    pub memory_key: Option<String>,
    pub content: String,
    pub importance: Option<f64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileRecord {
    pub id: String,
    pub project_id: String,
    pub path: String,
    pub language: Option<String>,
    pub file_type: Option<String>,
    pub file_size: Option<i64>,
    pub content_hash: Option<String>,
    pub indexed_at: Option<i64>,
    pub updated_at: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageRecord {
    pub id: String,
    pub agent_run_id: Option<String>,
    pub model: String,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub latency_ms: Option<i64>,
    pub status: Option<String>,
    pub fallback_from: Option<String>,
    pub fallback_to: Option<String>,
    pub created_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexPlan {
    pub project_id: String,
    pub to_index: Vec<IndexFilePlan>,
    pub to_delete: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexFilePlan {
    pub path: String,
    pub hash: String,
    pub size: i64,
    pub language: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagChunkInput {
    pub id: String,
    pub project_id: String,
    pub source_type: String,
    pub source_path: Option<String>,
    pub chunk_index: Option<i32>,
    pub content: String,
    pub embedding: Vec<f32>,
    pub metadata: serde_json::Value,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagSearchHit {
    pub id: String,
    pub project_id: String,
    pub source_type: String,
    pub source_path: Option<String>,
    pub chunk_index: Option<i32>,
    pub content: String,
    pub score: f32,
    pub metadata: serde_json::Value,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtsHit {
    pub chunk_id: String,
    pub project_id: String,
    pub path: String,
    pub content: String,
    pub score: f32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerRecord {
    pub id: String,
    pub name: String,
    pub display_name: Option<String>,
    pub scope: String,
    pub origin: String,
    pub transport: String,
    pub command: Option<String>,
    pub args_json: Option<String>,
    pub url: Option<String>,
    pub env_json: Option<String>,
    pub enabled: i64,
    pub status: String,
    pub trust: String,
    pub version: Option<String>,
    pub timeout_ms: Option<i64>,
    pub project_id: Option<String>,
    pub last_connected_at: Option<i64>,
    pub last_error: Option<String>,
    pub restart_count: i64,
    pub tool_count: i64,
    pub resource_count: i64,
    pub prompt_count: i64,
    pub metadata_json: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCapabilityRecord {
    pub id: String,
    pub server_id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    pub description: Option<String>,
    pub uri: Option<String>,
    pub schema_json: Option<String>,
    pub enabled: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpUsageRecord {
    pub id: String,
    pub run_id: Option<String>,
    pub server_id: String,
    pub capability_id: Option<String>,
    pub tool_name: Option<String>,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub status: String,
    pub metadata_json: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChangeHunkRecord {
    pub id: String,
    pub file_change_id: String,
    pub old_start: i64,
    pub old_lines: i64,
    pub new_start: i64,
    pub new_lines: i64,
    pub original_text: String,
    pub proposed_text: String,
    pub patch: String,
    pub reverse_patch: Option<String>,
    pub status: String,
    pub tool_call_id: Option<String>,
    #[serde(default)]
    pub hunk_index: i64,
    pub created_at: i64,
    pub reviewed_at: Option<i64>,
    pub reviewed_by: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiFileChangeRecord {
    pub id: String,
    pub change_set_id: String,
    pub path: String,
    pub previous_path: Option<String>,
    pub kind: String,
    pub base_hash: Option<String>,
    pub proposed_hash: Option<String>,
    pub current_hash: Option<String>,
    pub base_content: Option<String>,
    pub proposed_content: Option<String>,
    pub additions: i64,
    pub deletions: i64,
    pub status: String,
    #[serde(default)]
    pub binary: i64,
    #[serde(default)]
    pub too_large: i64,
    pub tool_call_ids_json: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub hunks: Vec<AiChangeHunkRecord>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChangeSetRecord {
    pub id: String,
    pub account_id: Option<String>,
    pub project_id: String,
    pub run_id: String,
    pub conversation_id: Option<String>,
    pub agent_id: Option<String>,
    pub model: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
    #[serde(default)]
    pub files: Vec<AiFileChangeRecord>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReviewDecisionRecord {
    pub id: String,
    pub change_set_id: String,
    pub file_change_id: Option<String>,
    pub hunk_id: Option<String>,
    pub scope: String,
    pub decision: String,
    pub created_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeProposalRecord {
    pub id: String,
    pub project_id: String,
    pub run_id: String,
    pub conversation_id: Option<String>,
    pub status: String,
    pub summary: String,
    pub payload_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestStrategyRecord {
    pub project_id: String,
    pub payload_json: String,
    pub updated_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserCaseRecord {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub priority: String,
    pub status: String,
    pub payload_json: String,
    pub updated_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunRecord {
    pub id: String,
    pub project_id: String,
    pub task_id: Option<String>,
    pub agent_run_id: Option<String>,
    pub commit_sha: Option<String>,
    pub branch: Option<String>,
    pub status: String,
    pub started_at: i64,
    pub duration_ms: Option<i64>,
    pub payload_json: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResultRecord {
    pub id: String,
    pub run_id: String,
    pub project_id: String,
    pub task_id: Option<String>,
    pub user_case_id: Option<String>,
    pub name: String,
    pub test_type: String,
    pub runner: String,
    pub status: String,
    pub duration_ms: Option<i64>,
    pub error: Option<String>,
    pub file: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageSnapshotRecord {
    pub id: String,
    pub run_id: String,
    pub project_id: String,
    pub lines: Option<f64>,
    pub branches: Option<f64>,
    pub functions: Option<f64>,
    pub statements: Option<f64>,
    pub created_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestArtifactRecord {
    pub id: String,
    pub run_id: String,
    pub kind: String,
    pub path: String,
    pub label: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunBundle {
    pub run: TestRunRecord,
    pub results: Vec<TestResultRecord>,
    #[serde(default)]
    pub coverage: Option<CoverageSnapshotRecord>,
    pub artifacts: Vec<TestArtifactRecord>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestMonitoringQuery {
    pub project_id: String,
    pub branch: Option<String>,
    pub commit_sha: Option<String>,
    pub task_id: Option<String>,
    pub status: Option<String>,
    pub from_ms: Option<i64>,
    pub to_ms: Option<i64>,
    pub test_type: Option<String>,
    pub runner: Option<String>,
    pub user_case_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestMonitoringBundle {
    pub runs: Vec<TestRunRecord>,
    pub user_cases: Vec<UserCaseRecord>,
    pub strategy: Option<TestStrategyRecord>,
}
