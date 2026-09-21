use crate::error::AppResult;

/// Boundary for the future planner, memory and multi-agent orchestrator.
pub trait AgentRuntime: Send + Sync {
    fn send_message(&self, message: &str) -> AppResult<()>;
    fn cancel_task(&self, task_id: &str) -> AppResult<()>;
}
