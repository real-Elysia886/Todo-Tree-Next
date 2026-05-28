import { describe, expect, it } from 'vitest';
import { createBranchTodoRisk } from '../src/branchRisk.js';
import { AgentContext } from '../src/types.js';
import { DebtReport } from '../src/debtReport.js';

function debtReport(): DebtReport {
    return {
        baseBranch: 'main',
        currentBranch: 'feature/todo-risk',
        generatedAt: '2026-05-29T00:00:00.000Z',
        added: [
            {
                file: 'src/auth.ts',
                line: 10,
                tag: 'TODO',
                text: '// TODO:P0 fix auth bypass @alice due:2000-01-01 #security',
                status: 'added',
            },
            {
                file: 'src/ui.ts',
                line: 4,
                tag: 'TODO',
                text: '// TODO polish empty state',
                status: 'added',
            },
        ],
        removed: [{ file: 'src/old.ts', line: 0, tag: 'FIXME', text: '// FIXME old bug', status: 'removed' }],
        summary: { added: 2, removed: 1, net: 1 },
    };
}

function agentContext(): AgentContext {
    return {
        schemaVersion: 1,
        workspace: '/repo',
        generatedAt: 1779539579,
        summary: {
            total: 3,
            highPriority: 1,
            overdue: 1,
            unassigned: 1,
            changedInCurrentBranch: 0,
        },
        items: [
            {
                id: 'src/auth.ts:10:TODO',
                file: '/repo/src/auth.ts',
                relativePath: 'src/auth.ts',
                line: 10,
                column: 3,
                tag: 'TODO',
                priority: 'P0',
                severity: 'normal',
                assignee: 'alice',
                dueDate: '2000-01-01',
                labels: ['security'],
                text: '// TODO:P0 fix auth bypass @alice due:2000-01-01 #security',
                context: '// TODO:P0 fix auth bypass @alice due:2000-01-01 #security',
                contextSnippet: 'function login() {\n  // TODO:P0 fix auth bypass @alice due:2000-01-01 #security\n}',
                recommendedOrder: 1,
                recommendedAction: 'fix-first',
            },
            {
                id: 'src/ui.ts:4:TODO',
                file: '/repo/src/ui.ts',
                relativePath: 'src/ui.ts',
                line: 4,
                column: 3,
                tag: 'TODO',
                priority: 'none',
                severity: 'normal',
                text: '// TODO polish empty state',
                context: '// TODO polish empty state',
                contextSnippet: '// TODO polish empty state',
                recommendedOrder: 2,
                recommendedAction: 'triage-owner',
            },
            {
                id: 'docs/notes.md:1:TODO',
                file: '/repo/docs/notes.md',
                relativePath: 'docs/notes.md',
                line: 1,
                column: 1,
                tag: 'TODO',
                priority: 'none',
                severity: 'normal',
                text: '- [ ] write notes',
                context: '- [ ] write notes',
                contextSnippet: '- [ ] write notes',
                recommendedOrder: 3,
                recommendedAction: 'schedule-maintenance',
            },
        ],
    };
}

describe('createBranchTodoRisk', () => {
    it('summarizes branch TODO risk and produces a PR checklist', () => {
        const report = createBranchTodoRisk(debtReport(), agentContext(), ['src/auth.ts', 'src/ui.ts']);

        expect(report.summary).toEqual({
            riskLevel: 'high',
            added: 2,
            removed: 1,
            net: 1,
            highPriorityAdded: 1,
            overdue: 1,
            changedFileTodos: 2,
            reviewRequired: true,
        });
        expect(report.risks.some((risk) => risk.kind === 'added-high-priority')).toBe(true);
        expect(report.risks.some((risk) => risk.kind === 'overdue')).toBe(true);
        expect(report.risks.some((risk) => risk.kind === 'changed-file-todo')).toBe(true);
        expect(report.markdown).toContain('Risk level: **HIGH**');
        expect(report.markdown).toContain('Review Checklist');
        expect(report.markdown).toContain('src/auth.ts:10');
    });

    it('reports low risk when there are no branch TODO changes or changed-file TODOs', () => {
        const base = debtReport();
        base.added = [];
        base.removed = [];
        base.summary = { added: 0, removed: 0, net: 0 };
        const context = agentContext();
        context.items = [];

        const report = createBranchTodoRisk(base, context, []);
        expect(report.summary.riskLevel).toBe('low');
        expect(report.summary.reviewRequired).toBe(false);
        expect(report.risks).toEqual([]);
        expect(report.markdown).toContain('No TODO risks detected');
    });
});
