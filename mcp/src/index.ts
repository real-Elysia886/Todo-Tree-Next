#!/usr/bin/env node

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as path from 'path';
import { loadConfig } from './config.js';
import * as scanner from './scanner.js';
import { createMatcher } from './filterQuery.js';
import { loadAnnotations, addAnnotations, clearAnnotations } from './annotations.js';
import { generateReport, formatMarkdown, formatJson, getDefaultBaseBranch } from './debtReport.js';
import { createBranchTodoRisk, getChangedFilesSinceBase } from './branchRisk.js';
import { FileWatcher } from './watcher.js';

const server = new McpServer({
    name: 'todo-tree-mcp',
    version: '0.1.0',
});

const watchers = new Map<string, FileWatcher>();

function getWatcher(root: string): FileWatcher {
    let watcher = watchers.get(root);
    if (!watcher) {
        watcher = new FileWatcher(root, (uri) => {
            server.server.sendResourceListChanged();
        });
        watcher.start();
        watchers.set(root, watcher);
    }
    return watcher;
}

function resolveRoot(root?: string): string {
    return path.resolve(root || process.argv[2] || process.cwd());
}

function getConfig(root: string) {
    return loadConfig(root);
}

// Tool: scan_workspace
server.tool(
    'scan_workspace',
    'Scan a workspace directory for TODO/FIXME/BUG comments. Returns all matched items with file, line, tag, priority, and metadata.',
    {
        root: z.string().optional().describe('Absolute path to workspace root. Defaults to current working directory.'),
        tags: z
            .array(z.string())
            .optional()
            .describe('Tags to scan for. Defaults to [TODO, FIXME, BUG, HACK, XXX, [ ], [x]].'),
        includeGlobs: z.array(z.string()).optional().describe('Glob patterns to include.'),
        excludeGlobs: z.array(z.string()).optional().describe('Glob patterns to exclude.'),
        caseSensitive: z.boolean().optional().describe('Case-sensitive matching. Default true.'),
        maxFileSize: z.number().optional().describe('Max file size in bytes. Default 1048576.'),
    },
    async (params) => {
        const root = resolveRoot(params.root);
        const config = getConfig(root);
        if (params.tags) config.tags = params.tags;
        if (params.includeGlobs) config.includeGlobs = params.includeGlobs;
        if (params.excludeGlobs) config.excludeGlobs = params.excludeGlobs;
        if (params.caseSensitive !== undefined) config.caseSensitive = params.caseSensitive;
        if (params.maxFileSize) config.maxFileSize = params.maxFileSize;

        const result = await scanner.scanWorkspace(root, config);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
);

// Tool: scan_file
server.tool(
    'scan_file',
    'Scan a single file for TODO/FIXME comments.',
    {
        root: z.string().optional().describe('Workspace root path.'),
        file: z.string().describe('Absolute or relative path to the file.'),
        tags: z.array(z.string()).optional(),
        caseSensitive: z.boolean().optional(),
    },
    async (params) => {
        const root = resolveRoot(params.root);
        const config = getConfig(root);
        if (params.tags) config.tags = params.tags;
        if (params.caseSensitive !== undefined) config.caseSensitive = params.caseSensitive;

        const filePath = path.isAbsolute(params.file) ? params.file : path.join(root, params.file);
        const result = await scanner.scanFile(root, filePath, config);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
);

// Tool: get_agent_context
server.tool(
    'get_agent_context',
    'Get ranked TODO context for AI agents. Returns TODOs sorted by urgency with git status, age analysis, priority, and recommended actions. Use this for code review, task planning, or technical debt analysis.',
    {
        root: z.string().optional().describe('Workspace root. Defaults to current working directory.'),
        tags: z.array(z.string()).optional(),
        excludeGlobs: z.array(z.string()).optional(),
    },
    async (params) => {
        const root = resolveRoot(params.root);
        const config = getConfig(root);
        if (params.tags) config.tags = params.tags;
        if (params.excludeGlobs) config.excludeGlobs = params.excludeGlobs;

        const result = await scanner.getAgentContext(root, config);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
);

// Tool: filter_todos
server.tool(
    'filter_todos',
    'Filter TODOs using structured queries like "tag:TODO path:src priority:P0". Supports field:value pairs and free-text search.',
    {
        root: z.string().optional().describe('Workspace root. Defaults to current working directory.'),
        query: z
            .string()
            .describe('Filter query. Supports: tag:, path:, file:, text:, priority:, status:. Free text also works.'),
        tags: z.array(z.string()).optional(),
        caseSensitive: z.boolean().optional(),
    },
    async (params) => {
        const root = resolveRoot(params.root);
        const config = getConfig(root);
        if (params.tags) config.tags = params.tags;
        const caseSensitive = params.caseSensitive ?? config.caseSensitive;

        const matches = await scanner.scanWorkspace(root, config);
        const matcher = createMatcher(params.query, caseSensitive);
        const filtered = matches.filter((m) =>
            matcher({
                fsPath: m.fsPath,
                actualTag: m.scanner.tag,
                tag: m.scanner.tag,
                priority: m.scanner.priority,
                label: m.match,
            })
        );
        return { content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }] };
    }
);

// Tool: annotate_finding
server.tool(
    'annotate_finding',
    'Write annotations (findings, warnings, suggestions) for specific files and lines. Annotations are stored in .todo-tree/annotations.json and can be viewed by other tools or the VS Code extension.',
    {
        root: z.string().optional().describe('Workspace root.'),
        annotations: z
            .array(
                z.object({
                    file: z.string(),
                    line: z.number(),
                    column: z.number().optional(),
                    message: z.string(),
                    severity: z.enum(['error', 'warning', 'information', 'hint']).optional(),
                    source: z.string().optional(),
                    code: z.string().optional(),
                })
            )
            .describe('Array of annotations to store.'),
    },
    async (params) => {
        const root = resolveRoot(params.root);
        const stored = addAnnotations(root, params.annotations);
        return { content: [{ type: 'text', text: JSON.stringify({ stored }) }] };
    }
);

// Tool: clear_annotations
server.tool(
    'clear_annotations',
    'Clear all agent annotations, optionally filtered by source.',
    {
        root: z.string().optional().describe('Workspace root.'),
        source: z.string().optional().describe('Only clear annotations from this source. Omit to clear all.'),
    },
    async (params) => {
        const root = resolveRoot(params.root);
        const cleared = clearAnnotations(root, params.source);
        return { content: [{ type: 'text', text: JSON.stringify({ cleared }) }] };
    }
);

// Tool: get_debt_report
server.tool(
    'get_debt_report',
    'Generate a TODO debt report comparing the current branch to a base branch. Shows added and removed TODOs in the diff.',
    {
        root: z.string().optional().describe('Workspace root.'),
        baseBranch: z.string().optional().describe('Base branch to compare against. Auto-detected if omitted.'),
        tags: z.array(z.string()).optional().describe('Tags to look for in the diff.'),
        format: z.enum(['json', 'markdown']).optional().describe('Output format. Default json.'),
    },
    async (params) => {
        const root = resolveRoot(params.root);
        const config = getConfig(root);
        const tags = params.tags || config.tags;
        const baseBranch = params.baseBranch || (await getDefaultBaseBranch(root));
        const report = await generateReport(root, baseBranch, tags);
        const content = params.format === 'markdown' ? formatMarkdown(report) : formatJson(report);
        return { content: [{ type: 'text', text: content }] };
    }
);

// Tool: get_branch_todo_risk
server.tool(
    'get_branch_todo_risk',
    'Assess TODO risk for the current branch compared to a base branch. Returns added/removed TODO debt, high-risk TODOs, overdue TODOs, TODOs in changed files, and a PR-ready Markdown checklist.',
    {
        root: z.string().optional().describe('Workspace root.'),
        baseBranch: z.string().optional().describe('Base branch to compare against. Auto-detected if omitted.'),
        tags: z.array(z.string()).optional().describe('Tags to include in branch diff analysis.'),
        excludeGlobs: z.array(z.string()).optional().describe('Additional scanner exclude globs.'),
        markdownOnly: z.boolean().optional().describe('Return only the Markdown checklist. Default false.'),
    },
    async (params) => {
        const root = resolveRoot(params.root);
        const config = getConfig(root);
        if (params.tags) config.tags = params.tags;
        if (params.excludeGlobs) config.excludeGlobs = params.excludeGlobs;

        const baseBranch = params.baseBranch || (await getDefaultBaseBranch(root));
        const [debtReport, agentContext, changedFiles] = await Promise.all([
            generateReport(root, baseBranch, config.tags),
            scanner.getAgentContext(root, config),
            getChangedFilesSinceBase(root, baseBranch),
        ]);
        const risk = createBranchTodoRisk(debtReport, agentContext, changedFiles);
        const text = params.markdownOnly ? risk.markdown : JSON.stringify(risk, null, 2);
        return { content: [{ type: 'text', text }] };
    }
);

// Resource: agent context (live, updates on file changes)
server.resource(
    'agent-context',
    new ResourceTemplate('todo-tree://agent-context/{root}', { list: () => ({ resources: [] }) }),
    async (uri, params) => {
        const root = resolveRoot(typeof params.root === 'string' ? params.root : undefined);
        const watcher = getWatcher(root);
        const context = await watcher.getCachedContext();
        return {
            contents: [
                {
                    uri: uri.href,
                    text: JSON.stringify(context, null, 2),
                    mimeType: 'application/json',
                },
            ],
        };
    }
);

// Resource: annotations
server.resource(
    'annotations',
    new ResourceTemplate('todo-tree://annotations/{root}', { list: () => ({ resources: [] }) }),
    async (uri, params) => {
        const root = resolveRoot(typeof params.root === 'string' ? params.root : undefined);
        const watcher = getWatcher(root);
        const annotations = watcher.getAnnotations();
        return {
            contents: [
                {
                    uri: uri.href,
                    text: JSON.stringify(annotations, null, 2),
                    mimeType: 'application/json',
                },
            ],
        };
    }
);

async function main() {
    function shutdown(): void {
        watchers.forEach((w) => w.stop());
        scanner.kill();
        process.exit(0);
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    process.stderr.write('Fatal error: ' + err.message + '\n');
    process.exit(1);
});
