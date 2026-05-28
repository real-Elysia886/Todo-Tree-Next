<h1 align="center">
  <br>
  <img src="resources/todo-tree.png" alt="Todo Tree_Next" width="104">
  <br>
  Todo Tree_Next
  <br>
</h1>

<p align="center">
  <strong>A faster, smarter TODO tree for VS Code, rebuilt with TypeScript, Rust, Git awareness, and AI Agent context.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README_CN.md">中文</a> ·
  <a href="docs/AGENT_INTERFACE.md">AI Agent Interface</a> ·
  <a href="docs/BENCHMARK.md">Benchmarks</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Marketplace-Todo%20Tree__Next-007ACC?logo=visualstudiocode" alt="VS Code Marketplace">
  <img src="https://img.shields.io/badge/Rust-scanner-orange?logo=rust" alt="Rust scanner">
  <img src="https://img.shields.io/badge/TypeScript-modular-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/AI%20Agent-ready-6f42c1" alt="AI Agent ready">
  <img src="https://img.shields.io/badge/tests-177%20passing-brightgreen" alt="Tests">
</p>

<p align="center">
  <img src="resources/screenshot.png" alt="Todo Tree_Next screenshot" width="860">
</p>

## Why Todo Tree_Next

Todo Tree_Next keeps the familiar Todo Tree workflow, then turns it into a modern project-maintenance surface:

- Find TODO, FIXME, BUG, markdown tasks, and custom tags across large workspaces.
- Scan quickly with a native Rust engine while keeping ripgrep as a fallback.
- See priority, ownership, labels, due dates, Git status, and branch-level TODO debt.
- Use the dashboard to understand where work is concentrated.
- Give AI coding tools structured TODO context and let them annotate findings back into VS Code.

## Feature Snapshot

| Capability | What you get |
| --- | --- |
| Fast scanning | Rust workspace scanner, file-level incremental refresh, max file size guard |
| Rich TODO metadata | `P0`-`P3`, `TODO!`, `TODO?`, `@assignee`, `due:YYYY-MM-DD`, `#labels` |
| Smart filtering | Queries like `tag:TODO path:src priority:P0 status:open` |
| Native markdown tasks | `- [ ]`, `- [x]`, numbered tasks, and normal code comments |
| Git workflows | Scan changed/staged files and export branch TODO debt reports |
| Dashboard | Counts, charts, trend view, scanner controls, filter controls, Git actions |
| AI Agent interface | `getAgentContext`, `annotateAgentFinding`, and `agent-context` CLI JSON |
| Compatibility | Original tree, highlights, export, status bar, grouping, and navigation remain available |

## Install

1. Download or build a `.vsix`.
2. Open the VS Code Extensions view.
3. Choose `...` > `Install from VSIX...`.
4. Select the generated package.

## Everyday Commands

```text
Todo Tree: Refresh
Todo Tree: Open Dashboard
Todo Tree: Scan Changed Files
Todo Tree: Scan Staged Files
Todo Tree: Export TODO Debt Report
Todo Tree: Get Agent TODO Context
Todo Tree: Clear Agent Annotations
```

## Smart Filtering

Mix plain text with structured fields:

```text
auth
tag:TODO
path:src
file:README.md
text:refactor
priority:P0
status:open
tag:FIXME path:src priority:P1
```

| Field | Matches |
| --- | --- |
| `tag` | `TODO`, `FIXME`, `BUG`, `[ ]`, `[x]`, custom tags |
| `path` | Full file path |
| `file` | File name |
| `text` | TODO content |
| `priority` | `P0`, `P1`, `P2`, `P3`, `none` |
| `status` | Markdown task status: `open` or `done` |

## Priority And Metadata

```javascript
// TODO:P0 fix auth bug @alice due:2026-06-01 #security
// FIXME:P1 memory leak @bob #backend
// TODO! urgent task      -> P0
// TODO? needs discussion -> P2
```

The scanner turns these hints into structured data used by the tree, dashboard, exports, Git reports, and AI Agent interface.

## Dashboard And Git

`Todo Tree: Open Dashboard` gives you a compact control center:

- tag and priority distribution
- TODO trend chart
- scanner engine switch: `auto`, `rust`, `ripgrep`
- scan mode controls
- smart filter input
- changed/staged scan shortcuts

Git-focused commands help review TODO debt before merge:

```text
Todo Tree: Scan Changed Files
Todo Tree: Scan Staged Files
Todo Tree: Export TODO Debt Report
```

## AI Agent Interface

Todo Tree_Next exposes TODO debt as a machine-readable project index. AI coding tools can read ranked TODO context, then write temporary editor diagnostics as review notes or suggested actions.

VS Code command API:

```javascript
const context = await vscode.commands.executeCommand('todo-tree.getAgentContext');

await vscode.commands.executeCommand('todo-tree.annotateAgentFinding', {
  file: 'src/auth.ts',
  line: 42,
  column: 5,
  severity: 'warning',
  message: 'P0 TODO touches authentication code; review before merge.'
});

await vscode.commands.executeCommand('todo-tree.clearAgentAnnotations');
```

CLI:

```bash
todo-scanner agent-context --root . --config todo-scanner-config.json
```

Agent context includes file path, line/column, tag, priority, assignee, due date, labels, Git status, approximate age, code snippet, recommended action, and recommended order.

Full schema: [docs/AGENT_INTERFACE.md](docs/AGENT_INTERFACE.md)

## MCP Server

The MCP (Model Context Protocol) server is published independently from the VS Code extension as `@real-elysia886/todo-tree-mcp`. This keeps the VSIX small and lets CLI tools use TODO intelligence without depending on a VS Code installation.

### Setup

```json
// .claude/settings.json
{
  "mcpServers": {
    "todo-tree": {
      "command": "npx",
      "args": ["@real-elysia886/todo-tree-mcp", "path/to/workspace"],
      "env": {
        "TODO_TREE_SCANNER_PATH": "path/to/todo-scanner"
      }
    }
  }
}
```

Or run directly:

```bash
TODO_TREE_SCANNER_PATH=path/to/todo-scanner npx @real-elysia886/todo-tree-mcp path/to/workspace
```

### Available Tools

| Tool | Description |
| --- | --- |
| `scan_workspace` | Scan workspace for TODO/FIXME/BUG comments |
| `scan_file` | Scan a single file |
| `get_agent_context` | Ranked TODO context with git status, age analysis, and recommended actions |
| `filter_todos` | Structured query filtering (`tag:TODO path:src priority:P0`) |
| `annotate_finding` | Write annotations to `.todo-tree/annotations.json` |
| `clear_annotations` | Clear annotations, optionally by source |
| `get_debt_report` | TODO debt report (current branch vs base) |
| `get_branch_todo_risk` | PR-ready TODO risk summary with added debt, overdue items, and changed-file TODOs |

### MCP Resources

| Resource | URI | Description |
| --- | --- | --- |
| Agent Context | `todo-tree://agent-context/{root}` | Live TODO context, updates on file changes |
| Annotations | `todo-tree://annotations/{root}` | Current annotations |

### Configuration

The MCP server reads configuration from (in priority order):

1. Environment variables: `TODO_TREE_SCANNER_PATH`, `TODO_TREE_TAGS`, `TODO_TREE_EXCLUDE_GLOBS`
2. Config file: `.todo-tree/config.json` in workspace root
3. Defaults matching the VS Code extension

## Architecture

```text
MCP server (standalone, no VS Code required)
  mcp/src/index.ts      MCP server entry point (stdio transport)
  mcp/src/scanner.ts    Rust CLI subprocess adapter
  mcp/src/config.ts     Configuration from env/file/defaults
  mcp/src/annotations.ts  JSON file-based annotation storage
  mcp/src/debtReport.ts Git TODO debt report
  mcp/src/filterQuery.ts  Structured filter parser
  mcp/src/watcher.ts    File watching + MCP resource notifications

VS Code extension
  extension.js          entry point and legacy glue
  scannerClient.ts      Rust CLI JSON protocol
  agentInterface.ts     AI Agent context and diagnostics
  dashboard.ts          Webview dashboard
  tree.ts               Tree data provider
  filterQuery.ts        Structured filter parser
  gitScanner.ts         Git changed/staged scan
  debtReport.ts         Git TODO debt report
  constants.ts          Shared constants (scan modes, status bar, buttons)
  globUtils.ts          Glob building utilities for ripgrep
  config.js             Configuration reader with caching layer
  searchResults.js      Map-indexed search result store

Rust scanner
  main.rs               scan-workspace, scan-file, agent-context, benchmark
  walker.rs             .gitignore-aware traversal
  matcher.rs            TODO matching and metadata extraction
  output.rs             JSON output schema
```

## Develop And Package

```bash
npm install
npm run scanner:build
npm run webpack
npm test
npm run lint:check
npm run format:check
npm run test:coverage
cargo test --manifest-path scanner/Cargo.toml

# MCP server
cd mcp && npm install && npm run build && npm test
```

Package:

```bash
npm run vscode:prepublish
npx --yes @vscode/vsce package
```

Test coverage:

| Type | Count |
| --- | ---: |
| QUnit tests | 120 |
| Rust tests | 38 |
| MCP tests | 19 |
| Total | 177 |

## Configuration

```json
{
  "todo-tree.scanner.engine": "auto",
  "todo-tree.scanner.path": "",
  "todo-tree.scanner.maxFileSize": 1048576
}
```

| Value | Behavior |
| --- | --- |
| `auto` | Use Rust scanner when available, fallback to ripgrep |
| `rust` | Force Rust scanner |
| `ripgrep` | Use the original ripgrep scanner |

## More Documentation

- [Rewrite notes](docs/REWRITE.md)
- [Feature compatibility](docs/COMPATIBILITY.md)
- [AI Agent interface](docs/AGENT_INTERFACE.md)
- [Benchmark report](docs/BENCHMARK.md)

## License

MIT. Based on the original [Todo Tree](https://github.com/Gruntfuggly/todo-tree) extension by Gruntfuggly.
