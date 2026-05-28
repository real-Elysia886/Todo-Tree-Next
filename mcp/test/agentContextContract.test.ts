import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type JsonObject = Record<string, unknown>;

function repoRoot(): string {
    return path.resolve(process.cwd(), '..');
}

function scannerExecutable(): string {
    const exe = process.platform === 'win32' ? 'todo-scanner.exe' : 'todo-scanner';
    const root = repoRoot();
    const candidates = [
        path.join(root, 'bin', exe),
        path.join(root, 'scanner', 'target', 'release', exe),
        path.join(root, 'scanner', 'target', 'debug', exe),
    ];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (!found) {
        throw new Error('todo-scanner executable not found; run npm run scanner:build before contract tests');
    }
    return found;
}

function writeScannerConfig(root: string): string {
    const configPath = path.join(root, 'todo-scanner-config.json');
    fs.writeFileSync(
        configPath,
        JSON.stringify({
            regex: '(//|#|<!--|;|/\\*|^|^[ \\t]*(-|\\d+.))\\s*(TODO|FIXME|BUG|HACK|\\[ \\]|\\[x\\])',
            case_sensitive: true,
            tags: ['TODO', 'FIXME', 'BUG', 'HACK', '[ ]', '[x]'],
            include_globs: [],
            exclude_globs: [],
            include_hidden_files: false,
            max_file_size: 1048576,
            native_markdown: true,
        }),
        'utf8'
    );
    return configPath;
}

function collectKeys(value: unknown, keys: Set<string>): void {
    if (Array.isArray(value)) {
        value.forEach((item) => collectKeys(item, keys));
        return;
    }

    if (value && typeof value === 'object') {
        Object.entries(value as JsonObject).forEach(([key, child]) => {
            keys.add(key);
            collectKeys(child, keys);
        });
    }
}

describe('Agent Context contract', () => {
    it('matches the published schema and uses camelCase field names', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-tree-agent-contract-'));
        try {
            const src = path.join(root, 'src');
            fs.mkdirSync(src, { recursive: true });
            fs.writeFileSync(
                path.join(src, 'app.ts'),
                [
                    'export function login() {',
                    '  // TODO:P0 fix auth bypass @alice due:2099-01-01 #security',
                    '  // FIXME P1 handle token refresh',
                    '}',
                ].join('\n'),
                'utf8'
            );

            const schema = JSON.parse(
                fs.readFileSync(path.join(repoRoot(), 'docs', 'schemas', 'agent-context.schema.json'), 'utf8')
            );
            const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
            const stdout = child_process.execFileSync(scannerExecutable(), [
                'agent-context',
                '--root',
                root,
                '--config',
                writeScannerConfig(root),
            ]);
            const context = JSON.parse(stdout.toString('utf8'));

            expect(validate(context), JSON.stringify(validate.errors, null, 2)).toBe(true);
            expect(context.schemaVersion).toBe(1);
            expect(context.summary.total).toBe(2);
            expect(context.summary.highPriority).toBe(2);
            expect(context.items.map((item: JsonObject) => item.recommendedOrder)).toEqual([1, 2]);

            const first = context.items[0];
            expect(first.relativePath).toBe('src/app.ts');
            expect(first.priority).toBe('P0');
            expect(first.assignee).toBe('alice');
            expect(first.dueDate).toBe('2099-01-01');
            expect(first.labels).toEqual(['security']);
            expect(first.recommendedAction).toBe('fix-first');
            expect(first.contextSnippet).toContain('TODO:P0');

            const keys = new Set<string>();
            collectKeys(context, keys);
            expect([...keys].filter((key) => key.includes('_'))).toEqual([]);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
