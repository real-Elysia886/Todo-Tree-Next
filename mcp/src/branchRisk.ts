import * as child_process from 'child_process';
import { AgentContext, AgentTodoItem, TodoPriority } from './types.js';
import { DebtItem, DebtReport } from './debtReport.js';

export type BranchRiskLevel = 'low' | 'medium' | 'high';
export type BranchRiskSeverity = 'info' | 'warning' | 'error';
export type BranchRiskKind = 'added-high-priority' | 'added-todo' | 'overdue' | 'changed-file-todo';

export interface BranchRiskItem {
    kind: BranchRiskKind;
    severity: BranchRiskSeverity;
    file: string;
    line?: number;
    tag: string;
    priority?: TodoPriority;
    text: string;
    message: string;
}

export interface BranchTodoRiskReport {
    baseBranch: string;
    currentBranch: string;
    generatedAt: string;
    summary: {
        riskLevel: BranchRiskLevel;
        added: number;
        removed: number;
        net: number;
        highPriorityAdded: number;
        overdue: number;
        changedFileTodos: number;
        reviewRequired: boolean;
    };
    added: DebtItem[];
    removed: DebtItem[];
    risks: BranchRiskItem[];
    markdown: string;
}

function execGit(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        child_process.execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(stdout);
        });
    });
}

export async function getChangedFilesSinceBase(root: string, baseBranch: string): Promise<string[]> {
    const mergeBase = (await execGit(['merge-base', baseBranch, 'HEAD'], root)).trim();
    const out = await execGit(['diff', '--name-only', mergeBase, 'HEAD', '--'], root);
    return out
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

export function createBranchTodoRisk(
    debtReport: DebtReport,
    agentContext: AgentContext,
    changedFiles: string[]
): BranchTodoRiskReport {
    const changed = new Set(changedFiles.map((file) => normalizePath(file)));
    const addedHighPriority = debtReport.added.filter((item) => isHighPriorityText(item.text) || isRiskTag(item.tag));
    const overdueItems = agentContext.items.filter((item) => isOverdue(item.dueDate));
    const changedFileTodos = agentContext.items.filter((item) => changed.has(normalizePath(item.relativePath)));

    const risks = dedupeRisks([
        ...addedHighPriority.map((item) => riskFromDebtItem(item, 'added-high-priority', 'error')),
        ...debtReport.added
            .filter((item) => !addedHighPriority.includes(item))
            .map((item) => riskFromDebtItem(item, 'added-todo', 'warning')),
        ...overdueItems.map((item) => riskFromAgentItem(item, 'overdue', 'error')),
        ...changedFileTodos.map((item) =>
            riskFromAgentItem(item, 'changed-file-todo', riskSeverityForPriority(item.priority))
        ),
    ]);

    const riskLevel = determineRiskLevel(addedHighPriority.length, overdueItems.length, changedFileTodos, debtReport);
    const report: BranchTodoRiskReport = {
        baseBranch: debtReport.baseBranch,
        currentBranch: debtReport.currentBranch,
        generatedAt: debtReport.generatedAt,
        summary: {
            riskLevel,
            added: debtReport.summary.added,
            removed: debtReport.summary.removed,
            net: debtReport.summary.net,
            highPriorityAdded: addedHighPriority.length,
            overdue: overdueItems.length,
            changedFileTodos: changedFileTodos.length,
            reviewRequired: riskLevel !== 'low',
        },
        added: debtReport.added,
        removed: debtReport.removed,
        risks,
        markdown: '',
    };
    report.markdown = formatBranchRiskMarkdown(report);
    return report;
}

function riskFromDebtItem(item: DebtItem, kind: BranchRiskKind, severity: BranchRiskSeverity): BranchRiskItem {
    const priority = extractPriority(item.text);
    return {
        kind,
        severity,
        file: item.file,
        line: item.line || undefined,
        tag: item.tag,
        priority,
        text: item.text,
        message:
            kind === 'added-high-priority'
                ? `New high-risk ${item.tag} added on this branch.`
                : `New ${item.tag} added on this branch.`,
    };
}

function riskFromAgentItem(item: AgentTodoItem, kind: BranchRiskKind, severity: BranchRiskSeverity): BranchRiskItem {
    return {
        kind,
        severity,
        file: item.relativePath,
        line: item.line,
        tag: item.tag,
        priority: item.priority,
        text: item.text,
        message:
            kind === 'overdue'
                ? `TODO is past its due date${item.dueDate ? ` (${item.dueDate})` : ''}.`
                : 'TODO is in a file changed by this branch.',
    };
}

function dedupeRisks(items: BranchRiskItem[]): BranchRiskItem[] {
    const seen = new Set<string>();
    const result: BranchRiskItem[] = [];
    for (const item of items) {
        const key = [item.kind, normalizePath(item.file), item.line || 0, item.tag, item.text].join('|');
        if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
        }
    }
    return result;
}

function determineRiskLevel(
    highPriorityAdded: number,
    overdue: number,
    changedFileTodos: AgentTodoItem[],
    debtReport: DebtReport
): BranchRiskLevel {
    if (highPriorityAdded > 0 || overdue > 0 || changedFileTodos.some((item) => item.priority === 'P0')) {
        return 'high';
    }
    if (debtReport.summary.added > 0 || changedFileTodos.some((item) => item.priority === 'P1')) {
        return 'medium';
    }
    return 'low';
}

export function formatBranchRiskMarkdown(report: BranchTodoRiskReport): string {
    const lines = [
        '# Branch TODO Risk',
        '',
        `Branch: \`${report.currentBranch}\` vs \`${report.baseBranch}\``,
        `Risk level: **${report.summary.riskLevel.toUpperCase()}**`,
        '',
        '| Metric | Count |',
        '| --- | --- |',
        `| Added TODOs | ${report.summary.added} |`,
        `| Removed TODOs | ${report.summary.removed} |`,
        `| Net TODO change | ${report.summary.net > 0 ? '+' : ''}${report.summary.net} |`,
        `| New high-priority/risk TODOs | ${report.summary.highPriorityAdded} |`,
        `| Overdue TODOs | ${report.summary.overdue} |`,
        `| TODOs in changed files | ${report.summary.changedFileTodos} |`,
        '',
    ];

    if (report.risks.length === 0) {
        lines.push('No TODO risks detected for this branch.', '');
        return lines.join('\n');
    }

    lines.push('## Review Checklist', '');
    report.risks.slice(0, 20).forEach((risk) => {
        const location = risk.line ? `${risk.file}:${risk.line}` : risk.file;
        const priority = risk.priority ? ` ${risk.priority}` : '';
        lines.push(`- [ ] **${risk.severity.toUpperCase()}** \`${location}\` ${risk.tag}${priority} - ${risk.message}`);
    });

    if (report.risks.length > 20) {
        lines.push(`- ...and ${report.risks.length - 20} more TODO risk(s).`);
    }

    lines.push('');
    return lines.join('\n');
}

function normalizePath(file: string): string {
    return file.replace(/\\/g, '/');
}

function isRiskTag(tag: string): boolean {
    return tag === 'FIXME' || tag === 'BUG';
}

function isHighPriorityText(text: string): boolean {
    return extractPriority(text) === 'P0' || extractPriority(text) === 'P1';
}

function extractPriority(text: string): TodoPriority | undefined {
    const upper = text.toUpperCase();
    const match = upper.match(/\bP[0-3]\b/);
    if (match) return match[0] as TodoPriority;
    if (upper.includes('TODO!')) return 'P0';
    if (upper.includes('TODO?')) return 'P2';
    return undefined;
}

function riskSeverityForPriority(priority: TodoPriority): BranchRiskSeverity {
    if (priority === 'P0') return 'error';
    if (priority === 'P1') return 'warning';
    return 'info';
}

function isOverdue(dueDate: string | undefined): boolean {
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return false;
    }
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(today.getUTCDate()).padStart(2, '0');
    return dueDate < `${yyyy}-${mm}-${dd}`;
}
