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
  <a href="#-whats-new">English</a> | <a href="#-项目简介">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-4.x-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Rust-Scanner-orange?logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/Tests-131%20passing-brightgreen" alt="Tests">
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


---

<h1 align="center">🇨🇳 中文文档</h1>

## 📖 项目简介

本项目是对 VS Code 插件 [Todo Tree](https://github.com/Gruntfuggly/todo-tree) 的**现代化重写**。采用 TypeScript + Rust 双语言架构，保留原插件的 TODO/FIXME 扫描、树视图展示、跳转、高亮等核心功能，同时引入 Rust 高性能扫描核心和多项新特性。

| 特性 | 原版 | 本项目 |
|------|------|--------|
| 扫描引擎 | ripgrep 子进程 | **Rust 原生扫描器** + ripgrep 回退 |
| 更新方式 | 全量重扫工作区 | **增量文件级扫描** |
| Markdown 任务 | 需手动配置正则 | **原生支持，零配置** |
| 过滤功能 | 纯文本 | **结构化查询语法** |
| Git 集成 | 基础 | **变更/暂存扫描 + 债务报告** |
| 仪表盘 | 无 | **交互式 Webview + SVG 图表** |
| 优先级追踪 | 无 | **P0–P3、@负责人、due:日期、#标签** |
| 架构 | 单体 JS | **模块化 TypeScript + Rust** |

---

## 🚀 快速开始

```bash
# 克隆并安装
git clone https://github.com/real-Elysia886/new-todo-tree.git
cd new-todo-tree
npm install

# 构建 Rust 扫描器（需要 Rust 工具链）
npm run scanner:build

# 构建插件
npm run webpack

# 运行测试
npm test          # 93 个 QUnit 测试
cargo test        # 38 个 Rust 单元测试
```

在 VS Code 中打开项目，按 `F5` 启动开发调试。

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────┐
│  VS Code 插件层 (TypeScript)                         │
│                                                     │
│  extension.js → scannerClient.ts → Rust CLI (JSON)  │
│       ↓              ↓                              │
│  tree.ts    dashboard.ts   filterQuery.ts           │
│  statusBar  gitScanner     debtReport               │
└─────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌─────────────────────┐
│  Rust 扫描器     │    │  ripgrep (回退方案)   │
│  walker.rs      │    └─────────────────────┘
│  matcher.rs     │
│  output.rs      │
└─────────────────┘
```

---

## 🔍 智能过滤

树视图过滤支持结构化查询语法：

```
tag:TODO path:src priority:P0
tag:FIXME file:main.ts
status:open text:refactor
```

| 字段 | 匹配内容 |
|------|---------|
| `tag` | TODO、FIXME、BUG、[ ]、[x] |
| `path` | 完整文件路径 |
| `file` | 文件名 |
| `text` | TODO 内容文本 |
| `priority` | P0、P1、P2、P3、none |
| `status` | open、done（Markdown 任务） |

---

## 📊 仪表盘

通过命令面板打开 `Todo Tree: Open Dashboard`：

- **标签分布** — SVG 饼图
- **标签计数** — SVG 柱状图
- **TODO 趋势** — 基于 Git 历史的折线图
- **扫描器控制** — 切换引擎、扫描模式、文件大小限制
- **智能过滤** — 应用结构化查询
- **Git 操作** — 扫描变更/暂存文件

---

## 🔗 Git 集成

```
Todo Tree: Scan Changed Files     — 扫描未提交变更中的 TODO
Todo Tree: Scan Staged Files      — 扫描暂存文件中的 TODO
Todo Tree: Export TODO Debt Report — 对比当前分支与基准分支的 TODO 增减
```

**债务报告**展示当前分支相对于 main 新增/删除的 TODO，支持导出为 Markdown 或 JSON。

---

## 🏷️ 优先级与元数据

扫描器识别 TODO 注释中的结构化元数据：

```javascript
// TODO:P0 修复认证漏洞 @alice due:2026-06-01 #security
// FIXME:P1 内存泄漏 @bob #backend
// TODO! 紧急任务          → P0
// TODO? 待讨论            → P2
```

字段：`priority`、`assignee`、`dueDate`、`labels` — 均可用于过滤查询和扫描输出。

---

## 📈 性能数据

基于 5000 文件测试语料库的实测数据：

| 场景 | 耗时 | 说明 |
|------|------|------|
| 全量工作区扫描 (5000 文件) | **122ms** | Rust 并行扫描 (rayon) |
| 单文件增量扫描 | **17ms** | 保存文件后仅扫描变更文件 |
| 增量提升 (vs 全量) | **7–140x** | 项目越大提升越明显 |

详细报告见 [docs/BENCHMARK.md](docs/BENCHMARK.md)。

---

## 🧪 测试覆盖

| 测试类型 | 数量 | 覆盖内容 |
|---------|------|---------|
| Rust 单元测试 | 38 | 标签匹配、优先级、元数据、Markdown、文件跳过 |
| QUnit 单元测试 | 93 | 过滤查询、债务报告、扫描器映射、Git 文件解析 |
| **总计** | **131** | |

---

## 🔒 安全性

- 只读扫描 — 不修改用户代码
- 路径穿越保护 — 拒绝扫描工作区外的文件
- 无命令注入 — 使用 `spawn` + 参数数组
- 二进制文件检测并跳过
- 可配置最大文件大小限制

---

## 📄 许可证

MIT — 详见 [LICENSE](LICENSE)。

---

## 🙏 致谢

基于 [Todo Tree](https://github.com/Gruntfuggly/todo-tree)（作者 Gruntfuggly）。本项目保留原插件的 UI 兼容性，同时引入全新架构。

详细架构文档和实现进度见 [docs/REWRITE.md](docs/REWRITE.md)。
