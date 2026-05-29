import * as path from 'path';
import * as vscode from 'vscode';
import { AgentAnnotation, AgentContext, AgentTodoItem } from './types';

interface ScannerClient {
    enabled(context: vscode.ExtensionContext, options: any): boolean;
    getAgentContext(context: vscode.ExtensionContext, root: string, options: any): Promise<AgentContext>;
}

interface AgentInterfaceOptions {
    context: vscode.ExtensionContext;
    getRootFolders: () => string[];
    getOptions: (filename: string) => any;
    scannerClient: ScannerClient;
    outputChannel?: { appendLine(text: string): void };
}

type AgentAnnotationInput = AgentAnnotation | AgentTodoItem | Array<AgentAnnotation | AgentTodoItem>;

let diagnostics: vscode.DiagnosticCollection | undefined;

export function registerCommands(options: AgentInterfaceOptions): vscode.Disposable[] {
    diagnostics = vscode.languages.createDiagnosticCollection('todo-tree-agent');

    return [
        diagnostics,
        vscode.commands.registerCommand('todo-tree.getAgentContext', (request?: { root?: string }) => {
            return getAgentContext(options, request);
        }),
        vscode.commands.registerCommand('todo-tree.annotateAgentFinding', (input: AgentAnnotationInput) => {
            return annotateAgentFinding(input);
        }),
        vscode.commands.registerCommand('todo-tree.clearAgentAnnotations', () => {
            diagnostics?.clear();
        }),
    ];
}

async function getAgentContext(options: AgentInterfaceOptions, request?: { root?: string }): Promise<AgentContext> {
    const roots = request && request.root ? [request.root] : options.getRootFolders();
    if (roots.length === 0) {
        throw new Error('Todo Tree: No workspace folder available for Agent context.');
    }

    const contexts: AgentContext[] = [];
    for (const root of roots) {
        const scanOptions = options.getOptions(root);
        if (options.scannerClient.enabled(options.context, scanOptions) !== true) {
            throw new Error(
                'Todo Tree: Agent context requires the Rust scanner. Set todo-tree.scanner.engine to auto or rust.'
            );
        }
        contexts.push(await options.scannerClient.getAgentContext(options.context, root, scanOptions));
    }

    const merged = mergeAgentContexts(contexts);
    if (options.outputChannel) {
        options.outputChannel.appendLine(
            'Todo Tree Agent context: ' + merged.summary.total + ' items across ' + contexts.length + ' workspace(s)'
        );
    }
    return merged;
}

function mergeAgentContexts(contexts: AgentContext[]): AgentContext {
    if (contexts.length === 1) {
        return contexts[0];
    }

    const items = contexts
        .flatMap((context) => context.items)
        .sort((a, b) => a.recommendedOrder - b.recommendedOrder || a.file.localeCompare(b.file) || a.line - b.line)
        .map((item, index) => ({ ...item, recommendedOrder: index + 1 }));

    return {
        schemaVersion: 1,
        workspace: contexts.map((context) => context.workspace).join(';'),
        generatedAt: Math.floor(Date.now() / 1000),
        summary: {
            total: items.length,
            highPriority: contexts.reduce((sum, context) => sum + context.summary.highPriority, 0),
            overdue: contexts.reduce((sum, context) => sum + context.summary.overdue, 0),
            unassigned: contexts.reduce((sum, context) => sum + context.summary.unassigned, 0),
            changedInCurrentBranch: contexts.reduce((sum, context) => sum + context.summary.changedInCurrentBranch, 0),
        },
        items,
    };
}

function annotateAgentFinding(input: AgentAnnotationInput): number {
    if (!diagnostics) {
        diagnostics = vscode.languages.createDiagnosticCollection('todo-tree-agent');
    }

    const annotations = (Array.isArray(input) ? input : [input])
        .map(normalizeAnnotation)
        .filter((annotation): annotation is AgentAnnotation => annotation !== undefined);

    const byFile = new Map<string, vscode.Diagnostic[]>();
    annotations.forEach((annotation) => {
        const file = resolveFile(annotation.file);
        const uri = vscode.Uri.file(file);
        const existing = byFile.get(file) || Array.from(diagnostics?.get(uri) || []);
        existing.push(createDiagnostic(annotation));
        byFile.set(file, existing);
    });

    byFile.forEach((items, file) => diagnostics?.set(vscode.Uri.file(file), items));
    return annotations.length;
}

function normalizeAnnotation(input: AgentAnnotation | AgentTodoItem | undefined): AgentAnnotation | undefined {
    if (!input || !input.file || !input.line) {
        return undefined;
    }

    const candidate = input as AgentAnnotation & AgentTodoItem;
    return {
        file: candidate.file,
        line: candidate.line,
        column: candidate.column,
        message: candidate.message || agentItemMessage(candidate),
        severity: normalizeSeverity(candidate.severity) || severityForPriority(candidate.priority),
        source: candidate.source || 'Todo Tree Agent',
        code: candidate.code || candidate.recommendedAction,
    };
}

function agentItemMessage(item: AgentTodoItem): string {
    const action = item.recommendedAction ? item.recommendedAction + ': ' : '';
    return action + (item.text || item.context || item.id);
}

function severityForPriority(priority?: string): AgentAnnotation['severity'] {
    if (priority === 'P0') return 'error';
    if (priority === 'P1') return 'warning';
    if (priority === 'P2') return 'information';
    return 'hint';
}

function normalizeSeverity(severity?: string): AgentAnnotation['severity'] | undefined {
    if (severity === 'error' || severity === 'warning' || severity === 'information' || severity === 'hint') {
        return severity;
    }
    return undefined;
}

function createDiagnostic(annotation: AgentAnnotation): vscode.Diagnostic {
    const line = Math.max(0, annotation.line - 1);
    const column = Math.max(0, (annotation.column || 1) - 1);
    const range = new vscode.Range(line, column, line, column + 1);
    const diagnostic = new vscode.Diagnostic(range, annotation.message, diagnosticSeverity(annotation.severity));
    diagnostic.source = annotation.source || 'Todo Tree Agent';
    if (annotation.code) {
        diagnostic.code = annotation.code;
    }
    return diagnostic;
}

function diagnosticSeverity(severity?: string): vscode.DiagnosticSeverity {
    if (severity === 'error') return vscode.DiagnosticSeverity.Error;
    if (severity === 'information') return vscode.DiagnosticSeverity.Information;
    if (severity === 'hint') return vscode.DiagnosticSeverity.Hint;
    return vscode.DiagnosticSeverity.Warning;
}

function resolveFile(file: string): string {
    if (path.isAbsolute(file)) {
        return file;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        return path.join(folders[0].uri.fsPath, file);
    }
    return file;
}
