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

