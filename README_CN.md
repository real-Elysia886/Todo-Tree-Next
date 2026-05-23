<h1 align="center">
  <br>
  <img src="resources/todo-tree.png" alt="Todo Tree Next" width="100">
  <br>
  Todo Tree Next
  <br>
</h1>

<p align="center">
  <strong>Todo Tree 的现代化重写 — TypeScript + Rust 架构，极速 TODO 扫描。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-4.x-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Rust-Scanner-orange?logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visual-studio-code" alt="VS Code">
  <img src="https://img.shields.io/badge/Tests-131%20passing-brightgreen" alt="Tests">
</p>

---

## ✨ 项目简介

本项目是对 VS Code 插件 [Todo Tree](https://github.com/Gruntfuggly/todo-tree) 的**现代化重写**。保留原插件的 UI 和操作习惯，引入 Rust 高性能扫描核心和多项新特性。

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
git clone https://github.com/real-Elysia886/new-todo-tree.git
cd new-todo-tree
npm install
npm run scanner:build   # 需要 Rust 工具链
npm run webpack
npm test                # 93 QUnit + 38 Rust = 131 个测试
```

在 VS Code 中按 `F5` 启动开发调试。

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

命令面板打开 `Todo Tree: Open Dashboard`：

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
Todo Tree: Export TODO Debt Report — 对比分支 TODO 增减
```

---

## 🏷️ 优先级与元数据

```javascript
// TODO:P0 修复认证漏洞 @alice due:2026-06-01 #security
// FIXME:P1 内存泄漏 @bob #backend
// TODO! 紧急任务          → P0
// TODO? 待讨论            → P2
```

---

## 📈 性能数据

基于 5000 文件测试语料库（约 50 万行代码）实测：

| 场景 | 耗时 |
|------|------|
| 全量工作区扫描 (5000 文件) | **122 ms** |
| 单文件增量扫描 | **17 ms** |
| 增量提升 (vs 全量) | **7–140x** |

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

## 🙏 致谢

基于 [Todo Tree](https://github.com/Gruntfuggly/todo-tree)（作者 Gruntfuggly）。

架构文档见 [docs/REWRITE.md](docs/REWRITE.md) | 功能兼容列表见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。
