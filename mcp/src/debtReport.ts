import * as child_process from 'child_process';

export interface DebtItem {
    file: string;
    line: number;
    tag: string;
    text: string;
    status: 'added' | 'removed';
}

export interface DebtReport {
    baseBranch: string;
    currentBranch: string;
    generatedAt: string;
    added: DebtItem[];
    removed: DebtItem[];
    summary: { added: number; removed: number; net: number };
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

async function getCurrentBranch(root: string): Promise<string> {
    const out = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], root);
    return out.trim();
}

export async function getDefaultBaseBranch(root: string): Promise<string> {
    for (const candidate of ['main', 'master', 'develop']) {
        try {
            await execGit(['rev-parse', '--verify', candidate], root);
            return candidate;
        } catch {
            /* not found */
        }
    }
    return 'main';
}

export function parseDiffForTodos(diff: string, tags: string[]): DebtItem[] {
    const items: DebtItem[] = [];
    const tagPattern = new RegExp(
        '\\b(' + tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b'
    );
    let currentFile = '';
    let lineNumber = 0;

    for (const rawLine of diff.split('\n')) {
        if (rawLine.startsWith('+++ b/')) {
            currentFile = rawLine.substring(6);
            continue;
        }
        const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
        if (hunkMatch) {
            lineNumber = parseInt(hunkMatch[1], 10) - 1;
            continue;
        }
        if (rawLine.startsWith('+') || rawLine.startsWith(' ')) {
            lineNumber++;
        }
        if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
            const content = rawLine.substring(1);
            const match = content.match(tagPattern);
            if (match) {
                items.push({
                    file: currentFile,
                    line: lineNumber,
                    tag: match[1],
                    text: content.trim(),
                    status: 'added',
                });
            }
        } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
            const content = rawLine.substring(1);
            const match = content.match(tagPattern);
            if (match) {
                items.push({ file: currentFile, line: 0, tag: match[1], text: content.trim(), status: 'removed' });
            }
        }
    }
    return items;
}

export async function generateReport(root: string, baseBranch: string, tags: string[]): Promise<DebtReport> {
    const currentBranch = await getCurrentBranch(root);
    const mergeBase = (await execGit(['merge-base', baseBranch, 'HEAD'], root)).trim();
    const diff = await execGit(['diff', mergeBase, 'HEAD', '-U0'], root);
    const items = parseDiffForTodos(diff, tags);

    const added = items.filter((i) => i.status === 'added');
    const removed = items.filter((i) => i.status === 'removed');

    return {
        baseBranch,
        currentBranch,
        generatedAt: new Date().toISOString(),
        added,
        removed,
        summary: { added: added.length, removed: removed.length, net: added.length - removed.length },
    };
}

export function formatMarkdown(report: DebtReport): string {
    const lines: string[] = [
        '# TODO Debt Report',
        '',
        `Branch: \`${report.currentBranch}\` vs \`${report.baseBranch}\``,
        `Generated: ${report.generatedAt}`,
        '',
        '## Summary',
        '',
        `| Metric | Count |`,
        `| --- | --- |`,
        `| Added | ${report.summary.added} |`,
        `| Removed | ${report.summary.removed} |`,
        `| Net change | ${report.summary.net > 0 ? '+' : ''}${report.summary.net} |`,
        '',
    ];

    if (report.added.length > 0) {
        lines.push('## Added TODOs', '');
        report.added.forEach((item) => {
            lines.push(`- **${item.tag}** \`${item.file}:${item.line}\` ${item.text}`);
        });
        lines.push('');
    }

    if (report.removed.length > 0) {
        lines.push('## Removed TODOs', '');
        report.removed.forEach((item) => {
            lines.push(`- ~~**${item.tag}** \`${item.file}\` ${item.text}~~`);
        });
        lines.push('');
    }

    return lines.join('\n');
}

export function formatJson(report: DebtReport): string {
    return JSON.stringify(report, null, 2);
}
