# Feature Compatibility with Original Todo Tree

This document maps every core feature of the original [Todo Tree](https://github.com/Gruntfuggly/todo-tree) to its implementation status in Todo Tree Next.

## Core Features

| Original Feature | Status | Implementation |
|-----------------|--------|----------------|
| Workspace scan | ✅ Supported | `scannerClient.ts` → Rust `scan-workspace` |
| Current file scan | ✅ Supported | `fileWatcher.ts` → Rust `scan-file` |
| Open files scan | ✅ Supported | `fileWatcher.ts` |
| Tree view (file tree) | ✅ Supported | `tree.ts` TreeNodeProvider |
| Tree view (flat) | ✅ Supported | `tree.ts` flat mode |
| Tree view (tags only) | ✅ Supported | `tree.ts` tags-only mode |
| Click to jump | ✅ Supported | `navigationCommands.ts` revealInFile |
| Editor highlighting | ✅ Supported | `highlights.ts` |
| Custom tags | ✅ Supported | `config.js` tags setting |
| Include/exclude globs | ✅ Supported | `scopeManager.ts` + Rust walker |
| Refresh command | ✅ Supported | `extension.js` rebuild |
| Status bar count | ✅ Supported | `statusBar.ts` |
| Export tree | ✅ Supported | `exportManager.ts` |
| Group by tag | ✅ Supported | `tree.ts` |
| Group by sub-tag | ✅ Supported | `tree.ts` |
| Compact folders | ✅ Supported | `tree.ts` getTreeItem |
| Filter tree | ✅ Enhanced | `filterQuery.ts` (structured queries) |
| Go to next/previous | ✅ Supported | `navigationCommands.ts` |
| Activity bar badge | ✅ Supported | `statusBar.ts` |
| Custom highlight colors | ✅ Supported | `highlights.ts` + `attributes.js` |
| Gutter icons | ✅ Supported | `highlights.ts` + `icons.js` |
| Overview ruler marks | ✅ Supported | `highlights.ts` |
| Regex configuration | ✅ Supported | `config.js` regex settings |
| Case sensitivity toggle | ✅ Supported | `config.js` + Rust matcher |
| .gitignore respect | ✅ Supported | Rust `walker.rs` (ignore crate) |
| Schemes filter | ✅ Supported | `config.js` |
| Label format | ✅ Supported | `utils.js` formatLabel |
| Tooltip format | ✅ Supported | `tree.ts` getTreeItem |
| Reveal behaviour | ✅ Supported | `tree.ts` + `configMigrator.ts` |
| Settings migration | ✅ Supported | `configMigrator.ts` |

## Enhanced Features

| Feature | Enhancement | Implementation |
|---------|-------------|----------------|
| Filtering | Structured query syntax (tag/path/file/text/priority/status) | `filterQuery.ts` |
| Markdown TODOs | Native support, zero config | Rust `matcher.rs` |
| Scan performance | Rust parallel scanner, 7–140x faster incremental | `scannerClient.ts` + Rust |
| Scanner fallback | Auto-fallback to ripgrep if Rust unavailable | `scannerClient.ts` |
| AI agent context | Structured TODO data for code agents | `agentInterface.ts` + Rust `agent-context` |
| Agent annotations | AI tools can write temporary editor diagnostics | `agentInterface.ts` |

## New Features (not in original)

| Feature | Implementation |
|---------|----------------|
| Priority tracking (P0–P3) | Rust `matcher.rs` + `types.ts` |
| @assignee parsing | Rust `matcher.rs` extract_metadata |
| due:date parsing | Rust `matcher.rs` extract_metadata |
| #label parsing | Rust `matcher.rs` extract_metadata |
| Interactive dashboard | `dashboard.ts` (Webview + SVG charts) |
| Git changed files scan | `gitScanner.ts` + `gitFiles.ts` |
| Git staged files scan | `gitScanner.ts` + `gitFiles.ts` |
| TODO debt report | `debtReport.ts` (git diff analysis) |
| Benchmark CLI | Rust `main.rs` benchmark command |
| Folder scope switching | `scopeManager.ts` |
| TODO trend chart | `dashboard.ts` (git history) |
| Agent-ready TODO context | `todo-tree.getAgentContext` + `todo-scanner agent-context` |
| Agent finding annotations | `todo-tree.annotateAgentFinding` + VS Code diagnostics |

## Configuration Compatibility

All original `todo-tree.*` settings are preserved. New settings added under `todo-tree.scanner.*`:

| Setting | Default | Description |
|---------|---------|-------------|
| `todo-tree.scanner.engine` | `"auto"` | Scanner engine: auto, rust, ripgrep |
| `todo-tree.scanner.path` | `""` | Custom path to Rust scanner binary |
| `todo-tree.scanner.maxFileSize` | `1048576` | Max file size for Rust scanner (bytes) |
