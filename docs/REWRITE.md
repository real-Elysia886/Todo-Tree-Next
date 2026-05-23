# Todo Tree Next Rewrite

## AI Agent Interface

本阶段新增 `Agent-ready TODO Intelligence Layer`：

- Rust CLI 新增 `todo-scanner agent-context --root <workspace> --config <config.json>`。
- VS Code 新增 `todo-tree.getAgentContext`，向 AI Code 工具返回结构化 TODO 上下文。
- VS Code 新增 `todo-tree.annotateAgentFinding`，允许 Agent 把审查结果、风险提示、修复建议写入临时 Diagnostic 标注。
- VS Code 新增 `todo-tree.clearAgentAnnotations`，清理 Agent 标注。
- 输出包含文件路径、行列号、标签、优先级、负责人、截止日期、Git 状态、历史年龄、上下文片段、推荐动作和推荐处理顺序。

完整协议见 [AGENT_INTERFACE.md](AGENT_INTERFACE.md)。

本仓库正在按 `重写方案.txt` 做就地重写。当前阶段保留成熟的 VS Code
插件 UI、树视图、高亮和命令体系，同时把全工作区扫描替换为 Rust 扫描核心。

## 已落地的架构

```text
VS Code Extension (JavaScript, existing UI)
  ├─ src/extension.js         # 插件入口，优先调用 Rust 扫描器
  ├─ src/scannerClient.ts     # Rust CLI/JSON 协议客户端
  ├─ src/types.ts             # TodoItem / ScanOutput / ScannerMatch / PriorityStats 类型
  ├─ src/configMigrator.ts    # 配置迁移和 Markdown 升级提示
  ├─ src/scopeManager.ts      # 过滤作用域和文件夹过滤命令
  ├─ src/debtReport.ts        # Git diff TODO 债务报告导出
  ├─ src/commands.ts          # 命令注册辅助
  ├─ src/fileWatcher.ts       # 编辑器/文档事件监听
  ├─ src/gitScanner.ts        # Git changed/staged 扫描调度
  ├─ src/gitFiles.ts          # Git porcelain 输出解析和文件收集
  ├─ src/filterQuery.ts       # 智能过滤查询解析
  ├─ src/dashboard.ts         # Webview 仪表盘（含 SVG 饼图/柱状图/趋势图）
  ├─ src/navigationCommands.ts # 编辑器 TODO 导航和 reveal 命令
  ├─ src/statusBar.ts         # 状态栏与 Activity Bar badge
  ├─ src/exportManager.ts     # 导出内容 provider 和导出命令
  ├─ src/tree.ts              # 树视图渲染（TreeNodeProvider）
  └─ src/highlights.js        # 沿用原编辑器高亮

Rust Scanner
  └─ scanner/
     ├─ src/main.rs           # CLI 入口
     ├─ src/config.rs         # JSON 配置解析
     ├─ src/walker.rs         # .gitignore 感知文件遍历和 glob 过滤
     ├─ src/matcher.rs        # TODO/FIXME/Markdown task 匹配
     └─ src/output.rs         # 结构化 JSON 输出
```

## 扫描行为

工作区扫描会优先执行：

```bash
todo-scanner scan-workspace --root <workspace> --config <config.json>
```

扫描器输出结构化 JSON：

```json
{
  "workspace": "E:/project",
  "elapsed_ms": 42,
  "scanned_files": 1280,
  "matched_files": 37,
  "total_items": 86,
  "items": []
}
```

插件会把 `items` 转换成原树视图已有的 match 对象，所以现有跳转、分组、状态栏和导出能力继续可用。

## 兼容与回退

新增配置：

```json
{
  "todo-tree.scanner.engine": "auto",
  "todo-tree.scanner.path": "",
  "todo-tree.scanner.maxFileSize": 1048576
}
```

`auto` 模式会在找到 Rust 二进制时使用新扫描器；如果二进制不存在、正则不兼容或扫描失败，会自动回退到原 ripgrep 搜索。

## 已实现的方案点

- Rust 高性能扫描核心
- `.gitignore` 感知遍历
- include/exclude glob 过滤
- 大文件和二进制文件跳过
- Markdown task 原生识别：`- [ ]`、`- [x]`、`1. [ ]`
- TODO 优先级初步解析：`P0`、`P1`、`P2`、`P3`、`TODO!`、`TODO?`
- VS Code 插件层与 Rust CLI 的 JSON 协议通信
- workspace 扫描回退到 ripgrep
- 保存/打开文件优先使用 `todo-scanner scan-file`，失败时回退到现有内存增量刷新路径
- 树过滤升级为智能查询语法
- Webview 仪表盘集中管理扫描器、扫描模式、文件大小阈值、智能过滤和刷新操作
- Git changed/staged 文件扫描，提交前可只查看本次改动中的 TODO
- `src/extension.js` 第一轮拆分为 `commands`、`fileWatcher`、`statusBar`、`exportManager`
- 引入 TypeScript 构建，扫描结果有显式 `TodoItem` / `ScanOutput` / `ScannerMatch` 类型
- `filterQuery`、`gitFiles` 已迁移到 TypeScript，`extension.js` 中的 Git 扫描流程抽出为 `gitScanner`
- `dashboard`、`gitScanner` 已迁移到 TypeScript，编辑器导航命令抽出为 `navigationCommands`
- 配置迁移逻辑抽出为 `configMigrator.ts`（migrateSettings + checkForMarkdownUpgrade）
- 过滤作用域和文件夹过滤命令抽出为 `scopeManager.ts`（switchScope、showOnlyThisFolder、excludeThisFolder、removeFilter、resetAllFilters）
- `navigationCommands` 和 `fileWatcher` 迁移为 TypeScript，带完整接口类型
- 新增 `debtReport.ts`：基于 git diff 的 TODO 债务报告导出（Markdown/JSON），对比当前分支与基准分支的 TODO 增减
- `statusBar`、`exportManager`、`commands` 迁移为 TypeScript
- 仪表盘新增内联 SVG 图表：标签分布饼图 + 标签计数柱状图
- `types.ts` 扩展为完整结构化字段：`assignee`、`dueDate`、`labels`
- Rust 扫描器 `matcher.rs` 新增 `extract_metadata()`，解析 `@username`、`due:YYYY-MM-DD`、`#label` 语法
- `scannerClient.ts` 透传新字段到 VS Code 插件层
- `tree.ts` 迁移为 TypeScript（@ts-nocheck 渐进式迁移）
- 仪表盘新增 Git 历史趋势折线图（基于 git log + git grep）

## 智能过滤语法

树视图的过滤输入现在支持普通文本和字段查询混用：

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

字段含义：

| 字段 | 说明 |
| --- | --- |
| `tag` | 匹配 `TODO`、`FIXME`、`BUG`、`[ ]`、`[x]` 等标签 |
| `path` | 匹配完整文件路径 |
| `file` | 匹配文件名 |
| `text` | 匹配 TODO 显示文本 |
| `priority` | 匹配 `P0`、`P1`、`P2`、`P3`、`none` |
| `status` | Markdown task 状态，支持 `open` 和 `done` |

## 仪表盘

命令面板或树视图标题栏可打开：

```text
Todo Tree: Open Dashboard
```

仪表盘当前支持：

- 查看 TODO 总数、标签分布、扫描模式和扫描器模式
- 切换 `auto` / `rust` / `ripgrep`
- 切换 workspace、open files、current file 等扫描模式
- 设置 Rust 扫描器最大文件大小
- 输入并应用智能过滤语法
- 一键刷新和清除过滤
- 只扫描 Git changed files 或 staged files

## Git 集成

新增命令：

```text
Todo Tree: Scan Changed Files
Todo Tree: Scan Staged Files
Todo Tree: Export TODO Debt Report
```

### Debt Report

`Todo Tree: Export TODO Debt Report` 命令会：

1. 提示输入基准分支（默认自动检测 main/master/develop）
2. 使用 `git merge-base` 找到分叉点
3. 解析 `git diff` 中新增/删除的 TODO 行
4. 生成 Markdown 或 JSON 格式的报告，包含：
   - 新增 TODO 列表（文件、行号、标签、内容）
   - 删除 TODO 列表
   - 汇总统计（新增数、删除数、净变化）

实现方式：

1. 使用 `git status --porcelain -z` 收集工作区 changed/staged 文件。
2. 跳过已删除文件，只扫描仍存在的真实文件。
3. 优先用 Rust `todo-scanner scan-file` 逐文件扫描。
4. Rust 不可用或失败时回退到 ripgrep。

## 下一阶段

1. 逐步移除 `tree.ts` 中的 `@ts-nocheck`，添加完整类型。
2. 迁移 `highlights.js` 到 TypeScript。
3. 增加更多集成测试和 fixture 项目。
4. 完善 benchmark 性能对比报告。
5. 打包 `.vsix` 发布。
