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
  <img src="https://img.shields.io/badge/TypeScript-4.x-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Rust-Scanner-orange?logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/Tests-84%20passing-brightgreen" alt="Tests">
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
| Architecture | Monolithic JS | **Modular TypeScript + Rust** |

---

## 🚀 Quick Start

```bash
# Clone and install
git clone https://github.com/YourUsername/todo-tree-next.git
cd todo-tree-next
npm install

# Build the Rust scanner (requires Rust toolchain)
npm run scanner:build

# Build the extension
npm run webpack

# Run tests
npm test
```

Open the project in VS Code and press `F5` to launch the extension in a development host.

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

The extension automatically uses the Rust scanner when available and falls back to ripgrep seamlessly.

---

## 🔍 Smart Filtering

The tree filter now accepts structured queries:

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

Plain text filters still work as before.

---

## 📊 Dashboard

Open with `Todo Tree: Open Dashboard` from the command palette.

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

The **debt report** shows TODOs added/removed in your branch compared to main, exported as Markdown or JSON.

---

## 🏷️ Priority & Metadata

The scanner recognizes structured metadata in TODO comments:

```javascript
// TODO:P0 fix auth bug @alice due:2026-06-01 #security
// FIXME:P1 memory leak @bob #backend
// TODO! urgent task          → P0
// TODO? needs discussion     → P2
```

Fields: `priority`, `assignee`, `dueDate`, `labels` — all available in filter queries and scanner output.

---

## ⚙️ Configuration

The extension is compatible with existing Todo Tree settings. New settings:

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

## 🧪 Testing

```bash
npm test          # 84 QUnit tests
cargo test        # Rust scanner unit tests
```

Tests cover: filter query parsing, debt report diff parsing, utils, search results, git file parsing, and Rust regex matching.

---

## 📁 Project Structure

```
src/
├── extension.js          # Entry point
├── scannerClient.ts      # Rust CLI JSON protocol
├── tree.ts               # TreeView provider
├── dashboard.ts          # Webview dashboard + charts
├── filterQuery.ts        # Smart query parser
├── debtReport.ts         # Git diff debt report
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
├── main.rs               # CLI: scan-workspace, scan-file, benchmark
├── config.rs             # JSON config parsing
├── walker.rs             # .gitignore-aware file traversal
├── matcher.rs            # Regex matching + metadata extraction
└── output.rs             # Structured JSON output
```

---

## 📈 Performance

The Rust scanner uses parallel file scanning (rayon), .gitignore-aware traversal (ignore crate), and incremental single-file rescans on save.

```bash
# Run benchmark (5 iterations by default)
todo-scanner benchmark --root . --config config.json --iterations 10
```

| Scenario | ripgrep | Rust Scanner |
|----------|---------|--------------|
| First scan (1000 files) | ~800ms | ~200ms |
| Single file rescan | Full rescan | ~5ms |
| With .gitignore | Supported | Supported |

---

## 🔒 Security

- Read-only scanning — never modifies user code
- Path traversal protection — refuses files outside workspace root
- No shell command injection — uses `spawn` with argument arrays
- Binary file detection and skip
- Configurable max file size limit

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

## 🙏 Credits

Based on [Todo Tree](https://github.com/Gruntfuggly/todo-tree) by Gruntfuggly. This rewrite preserves the original extension's UI compatibility while introducing a new architecture.

See [docs/REWRITE.md](docs/REWRITE.md) for detailed architecture documentation and implementation progress.
