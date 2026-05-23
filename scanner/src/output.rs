use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct TodoItem {
    pub file: String,
    pub line: usize,
    pub column: usize,
    pub tag: String,
    pub text: String,
    pub context: String,
    pub severity: String,
    pub priority: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanOutput {
    pub workspace: String,
    pub elapsed_ms: u128,
    pub scanned_files: usize,
    pub matched_files: usize,
    pub total_items: usize,
    pub items: Vec<TodoItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSummary {
    pub total: usize,
    pub high_priority: usize,
    pub overdue: usize,
    pub unassigned: usize,
    pub changed_in_current_branch: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTodoItem {
    pub id: String,
    pub file: String,
    pub relative_path: String,
    pub line: usize,
    pub column: usize,
    pub tag: String,
    pub priority: String,
    pub severity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age_days: Option<u64>,
    pub text: String,
    pub context: String,
    pub context_snippet: String,
    pub recommended_order: usize,
    pub recommended_action: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContext {
    pub schema_version: u32,
    pub workspace: String,
    pub generated_at: u64,
    pub summary: AgentSummary,
    pub items: Vec<AgentTodoItem>,
}
