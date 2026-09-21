use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const MCP_TIMEOUT_MS: u64 = 30_000;
pub const MAX_MCP_TOOL_OUTPUT_CHARS: usize = 20_000;
pub const MCP_MAX_RETRIES: u32 = 3;
pub const MCP_EVENT: &str = "mcp-event";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpEnvironmentVariable {
    pub name: String,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub secret_ref: Option<String>,
    #[serde(default)]
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInput {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_transport")]
    pub transport: String,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub env: Option<Vec<McpEnvironmentVariable>>,
    #[serde(default = "default_scope")]
    pub scope: String,
    #[serde(default = "default_origin")]
    pub origin: String,
    #[serde(default = "default_trust")]
    pub trust: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

fn default_transport() -> String {
    "stdio".into()
}
fn default_scope() -> String {
    "global".into()
}
fn default_origin() -> String {
    "user".into()
}
fn default_trust() -> String {
    "untrusted".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerSnapshot {
    pub id: String,
    pub name: String,
    pub display_name: Option<String>,
    pub enabled: bool,
    pub transport: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub url: Option<String>,
    pub env: Option<Vec<McpEnvironmentVariable>>,
    pub scope: String,
    pub origin: String,
    pub trust: String,
    pub version: Option<String>,
    pub timeout_ms: Option<u64>,
    pub project_id: Option<String>,
    pub status: String,
    pub last_connected_at: Option<i64>,
    pub last_error: Option<String>,
    pub restart_count: i64,
    pub tool_count: i64,
    pub resource_count: i64,
    pub prompt_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpHealthCheck {
    pub id: String,
    pub label: String,
    pub status: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpHealthReport {
    pub server_id: String,
    pub ok: bool,
    pub checks: Vec<McpHealthCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCallResult {
    pub success: bool,
    pub data: Option<Value>,
    pub error: Option<McpCallError>,
    pub truncated: Option<bool>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCallError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpEvent {
    #[serde(rename = "type")]
    pub kind: String,
    pub server_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpDiscovery {
    pub tools: Vec<Value>,
    pub resources: Vec<Value>,
    pub prompts: Vec<Value>,
}
