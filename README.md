<h1 align="center">
  <br>
  <img src="resources/todo-tree.png" alt="Todo Tree Next" width="100">
  <br>
  Todo Tree Next
  <br>
</h1>

<p align="center">
  <strong>A modern rewrite of Todo Tree — TypeScript + Rust architecture for blazing-fast TODO scanning in VS Code.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-4.x-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Rust-Scanner-orange?logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/Tests-135%20passing-brightgreen" alt="Tests">
</p>

---

## ✨ What's New

This is a **modern rewrite** of the popular [Todo Tree](https://github.com/Gruntfuggly/todo-tree) VS Code extension. It preserves the familiar UI while introducing a high-performance Rust scanning core and a suite of new features.

| Feature | Original | This Rewrite |
|---------|----------|--------------|
| Scanner | ripgrep subprocess | **Rust native scanner** + ripgrep fallback |
| Update mode | Full workspace rescan | **Incremental file-level scan** |
| Markdown TODOs | Manual regex config | **Native support, zero config** |
| Filtering | Plain text only | **Structured query syntax** |
| Git integration | Minimal | **Changed/staged scan + debt reports** |
| Dashboard | None | **Interactive Webview with charts** |
| Priority tracking | None | **P0–P3, @assignee, due:date, #labels** |
| AI agent interface | None | **Agent-ready TODO context + editor annotations** |
| Architecture | Monolithic JS | **Modular TypeScript + Rust** |

---

## 📦 安装

**方式一：VS Code 插件市场**

在 VS Code 扩展商店搜索 **Todo Tree_Next** 即可安装。

**方式二：离线安装 .vsix**

从 [Releases](https://github.com/real-Elysia886/Todo-Tree-Next/releases) 页面下载最新 `.vsix` 文件，然后在 VS Code 中：

1. 打开扩展面板 (`Ctrl+Shift+X`)
2. 点击 `...` → **从 VSIX 安装...**
3. 选择下载的 `.vsix` 文件

---

## 🚀 开发构建

```bash
git clone https://github.com/real-Elysia886/new-todo-tree.git
cd new-todo-tree
npm install
npm run scanner:build   # Requires Rust toolchain
npm run webpack
npm test                # 97 QUnit + 38 Rust = 135 tests
```

Press `F5` in VS Code to launch the extension in a development host.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│  VS Code Extension Layer (TypeScript)               │
│                                                     │
│  extension.js → scannerClient.ts → Rust CLI (JSON)  │
│       ↓              ↓                              │
│  tree.ts    dashboard.ts   filterQuery.ts           │
│  statusBar  gitScanner     debtReport               │
└─────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌─────────────────────┐
│  Rust Scanner   │    │  ripgrep (fallback)  │
│  walker.rs      │    └─────────────────────┘
│  matcher.rs     │
│  output.rs      │
└─────────────────┘
```

---

## 🔍 Smart Filtering

```
tag:TODO path:src priority:P0
tag:FIXME file:main.ts
status:open text:refactor
```

| Field | Matches |
|-------|---------|
| `tag` | TODO, FIXME, BUG, [ ], [x] |
| `path` | Full file path |
| `file` | File name only |
| `text` | TODO content text |
| `priority` | P0, P1, P2, P3, none |
| `status` | open, done (markdown tasks) |

---

## 📊 Dashboard

Open with `Todo Tree: Open Dashboard`:

- **Tag distribution** — SVG pie chart
- **Tag counts** — SVG bar chart
- **TODO trend** — Line chart from Git history
- **Scanner controls** — Switch engine, scan mode, file size limit
- **Smart filter** — Apply structured queries
- **Git actions** — Scan changed/staged files

---

## 🔗 Git Integration

```
Todo Tree: Scan Changed Files     — TODOs in uncommitted changes
Todo Tree: Scan Staged Files      — TODOs in staged files
Todo Tree: Export TODO Debt Report — Compare branch vs base
```

---

## AI Agent Interface

Todo Tree Next exposes TODO debt as structured data for AI coding tools. Agents can read ranked TODO context and write temporary editor annotations back into VS Code.

Programmatic VS Code commands:

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

The JSON output includes file path, line/column, tag, priority, assignee, due date, labels, Git status, approximate age, context snippet, recommended action, and recommended processing order. See [docs/AGENT_INTERFACE.md](docs/AGENT_INTERFACE.md) for the schema.

---

## 🏷️ Priority & Metadata

```javascript
// TODO:P0 fix auth bug @alice due:2026-06-01 #security
// FIXME:P1 memory leak @bob #backend
// TODO! urgent task          → P0
// TODO? needs discussion     → P2
```

---

## 📈 Performance

Benchmarked on a 5000-file test corpus (~500k lines):

| Scenario | Result |
|----------|--------|
| Full workspace scan (5000 files) | **122 ms** |
| Single file rescan | **17 ms** |
| Incremental improvement | **7–140x** faster than full rescan |

See [docs/BENCHMARK.md](docs/BENCHMARK.md) for full report.

---

## 🧪 Testing

| Type | Count | Coverage |
|------|-------|----------|
| Rust unit tests | 38 | Tag matching, priority, metadata, markdown, file skip |
| QUnit unit tests | 97 | Filter query, debt report, scanner mapping, git files, scope guards |
| **Total** | **135** | |

---

## 📁 Project Structure

```
src/
├── extension.js          # Entry point
├── scannerClient.ts      # Rust CLI JSON protocol
├── tree.ts               # TreeView provider
├── highlights.ts         # Editor highlighting
├── dashboard.ts          # Webview dashboard + charts
├── filterQuery.ts        # Smart query parser
├── debtReport.ts         # Git diff debt report
├── agentInterface.ts     # AI agent context + annotations
├── gitScanner.ts         # Git changed/staged scan
├── configMigrator.ts     # Settings migration
├── scopeManager.ts       # Folder filter commands
├── statusBar.ts          # Status bar manager
├── fileWatcher.ts        # Document event handling
├── navigationCommands.ts # Go to next/previous TODO
├── commands.ts           # Command registration
├── exportManager.ts      # Tree export
└── types.ts              # Shared TypeScript types

scanner/src/
├── main.rs               # CLI: scan-workspace, scan-file, agent-context, benchmark
├── config.rs             # JSON config parsing
├── walker.rs             # .gitignore-aware file traversal
├── matcher.rs            # Regex matching + metadata extraction
└── output.rs             # Structured JSON output
```

---

## ⚙️ Configuration

```json
{
  "todo-tree.scanner.engine": "auto",
  "todo-tree.scanner.path": "",
  "todo-tree.scanner.maxFileSize": 1048576
}
```

| Value | Behavior |
|-------|----------|
| `auto` | Use Rust scanner if available, fallback to ripgrep |
| `rust` | Force Rust scanner (error if unavailable) |
| `ripgrep` | Use original ripgrep scanning |

---

## 🔒 Security

- Read-only scanning — never modifies user code
- Path traversal protection — refuses files outside workspace root
- No shell command injection — uses `spawn` with argument arrays
- Binary file detection and skip
- Configurable max file size limit

---

## 📄 License

MIT — see [LICENSE](LICENSE).

## 🙏 Credits

Based on [Todo Tree](https://github.com/Gruntfuggly/todo-tree) by Gruntfuggly.

See [docs/REWRITE.md](docs/REWRITE.md) for architecture docs | [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for feature compatibility | [docs/AGENT_INTERFACE.md](docs/AGENT_INTERFACE.md) for AI agent integration.
