# AI Agent TODO Interface

Todo Tree Next exposes a small protocol layer for AI coding tools. The goal is not to add chat inside the extension; the goal is to make TODO debt readable and writable by agents.

The interface has two parts:

- Agent context: machine-readable TODO data ranked for action.
- Agent annotations: temporary VS Code diagnostics written by an AI tool.

## VS Code Commands

### `todo-tree.getAgentContext`

Returns the current workspace TODO context as JSON.

```javascript
const context = await vscode.commands.executeCommand('todo-tree.getAgentContext');
```

Optional root override:

```javascript
const context = await vscode.commands.executeCommand('todo-tree.getAgentContext', {
  root: 'E:/project'
});
```

### `todo-tree.annotateAgentFinding`

Adds one or more temporary diagnostics to the editor. This is intended for AI review results, TODO risk notes, PR warnings, or suggested follow-up actions.

```javascript
await vscode.commands.executeCommand('todo-tree.annotateAgentFinding', {
  file: 'src/auth.ts',
  line: 42,
  column: 5,
  severity: 'warning',
  message: 'P0 TODO touches authentication code; review before merge.',
  source: 'My Agent',
  code: 'review-before-merge'
});
```

You can also pass an array of annotations, or pass `items` from `todo-tree.getAgentContext` directly. Agent TODO items are converted into diagnostics using their priority and recommended action.

### `todo-tree.clearAgentAnnotations`

Clears all diagnostics created through `todo-tree.annotateAgentFinding`.

```javascript
await vscode.commands.executeCommand('todo-tree.clearAgentAnnotations');
```

## CLI

The Rust scanner also exposes the context directly:

```bash
todo-scanner agent-context --root . --config todo-scanner-config.json
```

This lets external tools, scripts, CI jobs, and future MCP servers consume the same data without launching VS Code.

## Agent Context Schema

The canonical machine-readable schema is versioned at
[`docs/schemas/agent-context.schema.json`](schemas/agent-context.schema.json). Contract tests run the Rust scanner
against this schema so VS Code commands, MCP tools, and CLI output keep the same camelCase protocol.

```json
{
  "schemaVersion": 1,
  "workspace": "E:/project",
  "generatedAt": 1779539579,
  "summary": {
    "total": 128,
    "highPriority": 6,
    "overdue": 2,
    "unassigned": 31,
    "changedInCurrentBranch": 7
  },
  "items": [
    {
      "id": "src/auth.ts:42:TODO",
      "file": "E:/project/src/auth.ts",
      "relativePath": "src/auth.ts",
      "line": 42,
      "column": 5,
      "tag": "TODO",
      "priority": "P0",
      "severity": "normal",
      "assignee": "alice",
      "dueDate": "2026-06-01",
      "labels": ["security"],
      "gitStatus": "modified",
      "ageDays": 86,
      "text": "// TODO:P0 fix auth bypass @alice due:2026-06-01 #security",
      "context": "// TODO:P0 fix auth bypass @alice due:2026-06-01 #security",
      "contextSnippet": "function validateToken(token) {\n  // TODO:P0 fix auth bypass @alice due:2026-06-01 #security\n}",
      "recommendedOrder": 1,
      "recommendedAction": "fix-first"
    }
  ]
}
```

## Ranking Rules

`recommendedOrder` is calculated from a simple deterministic score:

- `P0` and overdue items rank first.
- TODOs in changed or staged files are raised because they affect the current branch.
- Unassigned TODOs receive a triage bump.
- Older files receive a small age bump.

`recommendedAction` currently uses these values:

| Action | Meaning |
| --- | --- |
| `fix-first` | Highest urgency, usually `P0` or overdue |
| `review-before-merge` | High priority, should be considered before PR merge |
| `triage-owner` | No assignee is present |
| `investigate-risk` | `FIXME` or `BUG` needs investigation |
| `schedule-maintenance` | Lower-risk maintenance item |

## Annotation Schema

```json
{
  "file": "src/auth.ts",
  "line": 42,
  "column": 5,
  "severity": "warning",
  "message": "Review before merge.",
  "source": "Todo Tree Agent",
  "code": "review-before-merge"
}
```

Supported severities:

- `error`
- `warning`
- `information`
- `hint`

Relative paths are resolved against the first workspace folder. Absolute paths are used as-is.

## Intended Agent Workflows

- Code review: flag TODOs that affect files touched by the current branch.
- Technical debt analysis: group TODOs by owner, age, priority, and tag.
- Task decomposition: turn TODOs into ordered implementation tasks.
- Auto-fix suggestions: annotate TODOs where a safe local fix appears possible.
- PR risk warnings: surface newly added or modified high-priority TODOs.
