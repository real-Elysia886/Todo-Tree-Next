use crate::config::ScannerConfig;
use crate::output::TodoItem;
use anyhow::{Context, Result};
use regex::{Regex, RegexBuilder};
use std::path::Path;

pub struct TodoMatcher {
    regex: Regex,
    markdown_regex: Regex,
    native_markdown: bool,
    tags: Vec<String>,
    case_sensitive: bool,
}

impl TodoMatcher {
    pub fn new(config: &ScannerConfig) -> Result<Self> {
        let regex = RegexBuilder::new(&config.regex)
            .case_insensitive(!config.case_sensitive)
            .multi_line(true)
            .build()
            .context("failed to compile todo regex")?;

        let markdown_regex = Regex::new(r"^\s*(?:[-*+]|\d+[.)])\s+\[(?P<state>[ xX])\]")
            .context("failed to compile markdown task regex")?;

        Ok(Self {
            regex,
            markdown_regex,
            native_markdown: config.native_markdown,
            tags: sorted_tags(&config.tags),
            case_sensitive: config.case_sensitive,
        })
    }

    pub fn scan_text(&self, path: &Path, content: &str) -> Vec<TodoItem> {
        let file = clean_path(path);
        let mut items = Vec::new();

        for (line_index, line) in content.lines().enumerate() {
            if let Some(found) = self.regex.find(line) {
                let tag = extract_tag(&self.tags, self.case_sensitive, line).unwrap_or_default();
                let meta = extract_metadata(line);
                items.push(TodoItem {
                    file: file.clone(),
                    line: line_index + 1,
                    column: found.start() + 1,
                    tag,
                    text: line.to_string(),
                    context: line.trim().to_string(),
                    severity: "normal".to_string(),
                    priority: extract_priority(line),
                    assignee: meta.assignee,
                    due_date: meta.due_date,
                    labels: meta.labels,
                });
                continue;
            }

            if self.native_markdown {
                if let Some(found) = self.markdown_regex.find(line) {
                    let tag = if line[found.start()..found.end()].to_ascii_lowercase().contains("[x]") {
                        "[x]"
                    } else {
                        "[ ]"
                    };
                    let meta = extract_metadata(line);
                    items.push(TodoItem {
                        file: file.clone(),
                        line: line_index + 1,
                        column: found.start() + 1,
                        tag: tag.to_string(),
                        text: line.to_string(),
                        context: line.trim().to_string(),
                        severity: "normal".to_string(),
                        priority: extract_priority(line),
                        assignee: meta.assignee,
                        due_date: meta.due_date,
                        labels: meta.labels,
                    });
                }
            }
        }

        items
    }
}

fn clean_path(path: &Path) -> String {
    path.display()
        .to_string()
        .trim_start_matches("\\\\?\\")
        .to_string()
}

fn sorted_tags(tags: &[String]) -> Vec<String> {
    let mut tags = tags.to_vec();
    tags.sort_by(|a, b| b.len().cmp(&a.len()).then_with(|| a.cmp(b)));
    tags
}

fn extract_tag(tags: &[String], case_sensitive: bool, line: &str) -> Option<String> {
    if case_sensitive {
        return tags.iter().find(|tag| line.contains(tag.as_str())).cloned();
    }

    let lower = line.to_ascii_lowercase();
    tags.iter()
        .find(|tag| lower.contains(&tag.to_ascii_lowercase()))
        .cloned()
}

fn extract_priority(line: &str) -> String {
    let upper = line.to_ascii_uppercase();
    for priority in ["P0", "P1", "P2", "P3"] {
        if upper.contains(priority) {
            return priority.to_string();
        }
    }
    if upper.contains("TODO!") {
        return "P0".to_string();
    }
    if upper.contains("TODO?") {
        return "P2".to_string();
    }
    "none".to_string()
}

struct Metadata {
    assignee: Option<String>,
    due_date: Option<String>,
    labels: Option<Vec<String>>,
}

fn extract_metadata(line: &str) -> Metadata {
    let assignee = line
        .split_whitespace()
        .find(|w| w.starts_with('@') && w.len() > 1)
        .map(|w| w.trim_start_matches('@').to_string());

    let due_date = line
        .split_whitespace()
        .find(|w| w.starts_with("due:"))
        .map(|w| w.trim_start_matches("due:").to_string());

    let labels: Vec<String> = line
        .split_whitespace()
        .filter(|w| w.starts_with('#') && w.len() > 1 && !w.starts_with("#!") && !w.starts_with("#["))
        .map(|w| w.trim_start_matches('#').to_string())
        .collect();

    Metadata {
        assignee,
        due_date,
        labels: if labels.is_empty() { None } else { Some(labels) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ScannerConfig;
    use std::path::Path;

    fn config() -> ScannerConfig {
        ScannerConfig {
            regex: r"(//|#|<!--|;|/\*|^|^[ \t]*(-|\d+.))\s*(TODO|FIXME|\[ \]|\[x\])".to_string(),
            case_sensitive: true,
            tags: vec!["TODO".to_string(), "FIXME".to_string(), "[ ]".to_string(), "[x]".to_string()],
            include_globs: vec![],
            exclude_globs: vec![],
            include_hidden_files: false,
            max_file_size: 1024 * 1024,
            native_markdown: true,
        }
    }

    #[test]
    fn scans_code_tags_and_priority() {
        let matcher = TodoMatcher::new(&config()).unwrap();
        let items = matcher.scan_text(Path::new("src/main.js"), "// TODO:P0 fix it");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].tag, "TODO");
        assert_eq!(items[0].line, 1);
        assert_eq!(items[0].column, 1);
        assert_eq!(items[0].priority, "P0");
    }

    #[test]
    fn scans_markdown_tasks_without_custom_regex() {
        let mut config = config();
        config.regex = "TODO".to_string();
        config.tags = vec!["TODO".to_string(), "[ ]".to_string(), "[x]".to_string()];

        let matcher = TodoMatcher::new(&config).unwrap();
        let items = matcher.scan_text(Path::new("README.md"), "- [ ] write docs\n1. [x] done");

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].tag, "[ ]");
        assert_eq!(items[1].tag, "[x]");
    }
}
