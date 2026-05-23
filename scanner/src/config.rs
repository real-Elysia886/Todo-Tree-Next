use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannerConfig {
    pub regex: String,
    pub case_sensitive: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub include_globs: Vec<String>,
    #[serde(default)]
    pub exclude_globs: Vec<String>,
    #[serde(default)]
    pub include_hidden_files: bool,
    #[serde(default = "default_max_file_size")]
    pub max_file_size: u64,
    #[serde(default = "default_native_markdown")]
    pub native_markdown: bool,
}

fn default_max_file_size() -> u64 {
    1024 * 1024
}

fn default_native_markdown() -> bool {
    true
}

impl ScannerConfig {
    pub fn from_path(path: &Path) -> Result<Self> {
        let content = fs::read_to_string(path)
            .with_context(|| format!("failed to read config {}", path.display()))?;
        Self::from_json(&content)
    }

    pub fn from_json(content: &str) -> Result<Self> {
        serde_json::from_str(content.trim_start_matches('\u{feff}')).context("failed to parse scanner config")
    }
}
