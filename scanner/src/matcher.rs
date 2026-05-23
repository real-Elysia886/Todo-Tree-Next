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

    fn cfg() -> ScannerConfig {
        ScannerConfig {
            regex: r"(//|#|<!--|;|/\*|^|^[ \t]*(-|\d+.))\s*(TODO|FIXME|BUG|HACK|\[ \]|\[x\])".to_string(),
            case_sensitive: true,
            tags: vec!["TODO".into(), "FIXME".into(), "BUG".into(), "HACK".into(), "[ ]".into(), "[x]".into()],
            include_globs: vec![],
            exclude_globs: vec![],
            include_hidden_files: false,
            max_file_size: 1024 * 1024,
            native_markdown: true,
        }
    }

    fn m() -> TodoMatcher { TodoMatcher::new(&cfg()).unwrap() }

    // --- Tag types ---
    #[test] fn tag_todo() { let i = m().scan_text(Path::new("a.js"), "// TODO fix"); assert_eq!(i[0].tag, "TODO"); }
    #[test] fn tag_fixme() { let i = m().scan_text(Path::new("a.js"), "// FIXME broken"); assert_eq!(i[0].tag, "FIXME"); }
    #[test] fn tag_bug() { let i = m().scan_text(Path::new("a.js"), "// BUG null ptr"); assert_eq!(i[0].tag, "BUG"); }
    #[test] fn tag_hack() { let i = m().scan_text(Path::new("a.js"), "// HACK workaround"); assert_eq!(i[0].tag, "HACK"); }

    // --- Comment styles ---
    #[test] fn style_double_slash() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO x").len(), 1); }
    #[test] fn style_hash() { assert_eq!(m().scan_text(Path::new("a.py"), "# TODO x").len(), 1); }
    #[test] fn style_html() { assert_eq!(m().scan_text(Path::new("a.html"), "<!-- TODO x -->").len(), 1); }
    #[test] fn style_semicolon() { assert_eq!(m().scan_text(Path::new("a.asm"), "; TODO x").len(), 1); }
    #[test] fn style_block() { assert_eq!(m().scan_text(Path::new("a.c"), "/* TODO x */").len(), 1); }
    #[test] fn no_match_plain() { assert_eq!(m().scan_text(Path::new("a.js"), "const x = 1;").len(), 0); }

    // --- Multiple matches ---
    #[test] fn multiple_in_file() {
        let i = m().scan_text(Path::new("a.js"), "// TODO a\nlet x;\n// FIXME b\n// BUG c");
        assert_eq!(i.len(), 3);
        assert_eq!(i[0].line, 1);
        assert_eq!(i[1].line, 3);
        assert_eq!(i[2].line, 4);
    }

    // --- Priority ---
    #[test] fn prio_p0() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO:P0 x")[0].priority, "P0"); }
    #[test] fn prio_p1() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO P1 x")[0].priority, "P1"); }
    #[test] fn prio_p2() { assert_eq!(m().scan_text(Path::new("a.js"), "// FIXME P2 x")[0].priority, "P2"); }
    #[test] fn prio_p3() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO P3 x")[0].priority, "P3"); }
    #[test] fn prio_bang() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO! urgent")[0].priority, "P0"); }
    #[test] fn prio_question() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO? maybe")[0].priority, "P2"); }
    #[test] fn prio_none() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO plain")[0].priority, "none"); }

    // --- Metadata: assignee ---
    #[test] fn assignee_found() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO @alice fix")[0].assignee, Some("alice".into())); }
    #[test] fn assignee_missing() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO no one")[0].assignee, None); }

    // --- Metadata: due date ---
    #[test] fn due_found() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO due:2026-06-01")[0].due_date, Some("2026-06-01".into())); }
    #[test] fn due_missing() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO no date")[0].due_date, None); }

    // --- Metadata: labels ---
    #[test] fn label_one() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO #sec")[0].labels, Some(vec!["sec".into()])); }
    #[test] fn label_multi() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO #a #b")[0].labels, Some(vec!["a".into(), "b".into()])); }
    #[test] fn label_none() { assert_eq!(m().scan_text(Path::new("a.js"), "// TODO plain")[0].labels, None); }

    // --- Full metadata combo ---
    #[test] fn full_combo() {
        let i = m().scan_text(Path::new("a.js"), "// TODO:P0 @bob due:2026-01-01 #x #y");
        assert_eq!(i[0].priority, "P0");
        assert_eq!(i[0].assignee, Some("bob".into()));
        assert_eq!(i[0].due_date, Some("2026-01-01".into()));
        assert_eq!(i[0].labels, Some(vec!["x".into(), "y".into()]));
    }

    // --- Markdown tasks ---
    #[test] fn md_unchecked() { assert_eq!(m().scan_text(Path::new("x.md"), "- [ ] task")[0].tag, "[ ]"); }
    #[test] fn md_checked() { assert_eq!(m().scan_text(Path::new("x.md"), "- [x] done")[0].tag, "[x]"); }
    #[test] fn md_upper_x() { assert_eq!(m().scan_text(Path::new("x.md"), "- [X] done")[0].tag, "[x]"); }
    #[test] fn md_numbered() { assert_eq!(m().scan_text(Path::new("x.md"), "1. [ ] num").len(), 1); }
    #[test] fn md_star() { assert_eq!(m().scan_text(Path::new("x.md"), "* [ ] star").len(), 1); }
    #[test] fn md_indented() { assert_eq!(m().scan_text(Path::new("x.md"), "  - [ ] ind").len(), 1); }

    // --- Line/column ---
    #[test] fn line_col() {
        let i = m().scan_text(Path::new("a.js"), "x\n    // TODO here");
        assert_eq!(i[0].line, 2);
        assert_eq!(i[0].column, 5);
    }

    // --- Case sensitivity ---
    #[test] fn case_sensitive_no_match() { assert_eq!(m().scan_text(Path::new("a.js"), "// todo x").len(), 0); }
    #[test] fn case_insensitive_match() {
        let mut c = cfg(); c.case_sensitive = false;
        let m = TodoMatcher::new(&c).unwrap();
        assert_eq!(m.scan_text(Path::new("a.js"), "// todo x").len(), 1);
    }
}
