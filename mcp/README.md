# Todo Tree MCP

Standalone MCP server for Todo Tree Next. It scans a workspace with the Rust `todo-scanner` binary and exposes TODO data, filters, debt reports, and annotations to MCP-compatible clients.

## Usage

```bash
npx @real-elysia886/todo-tree-mcp /path/to/workspace
```

Until prebuilt scanner binaries are published with the MCP package, set `TODO_TREE_SCANNER_PATH` to a local `todo-scanner` executable:

```bash
TODO_TREE_SCANNER_PATH=/path/to/todo-scanner npx @real-elysia886/todo-tree-mcp /path/to/workspace
```

## Claude/Codex MCP Config

```json
{
  "mcpServers": {
    "todo-tree": {
      "command": "npx",
      "args": ["@real-elysia886/todo-tree-mcp", "/path/to/workspace"],
      "env": {
        "TODO_TREE_SCANNER_PATH": "/path/to/todo-scanner"
      }
    }
  }
}
```

## AI Review Tools

Use `get_branch_todo_risk` before opening or reviewing a PR. It compares the current branch to a base branch and returns:

- added and removed TODO debt
- new high-priority or risky TODOs
- overdue TODOs
- TODOs in files changed by the branch
- a Markdown review checklist suitable for a PR comment

## Development

```bash
npm install
npm run build
npm test
npm pack --dry-run
```
