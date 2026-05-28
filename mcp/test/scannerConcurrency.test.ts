import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanWorkspace } from '../src/scanner.js';
import { ScannerConfig } from '../src/config.js';

function config(scannerPath: string, tags: string[]): ScannerConfig {
    return {
        tags,
        regex: '(//|#|<!--|;|/\\*|^|^[ \\t]*(-|\\d+.))\\s*($TAGS)',
        caseSensitive: true,
        excludeGlobs: [],
        includeGlobs: [],
        includeHiddenFiles: false,
        maxFileSize: 1024 * 1024,
        scannerPath,
    };
}

describe('scanner concurrency', () => {
    it('uses isolated temporary config files for concurrent scans', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-tree-scanner-concurrency-'));
        try {
            fs.writeFileSync(path.join(root, 'a.js'), '// TODO one\n// FIXME two\n', 'utf8');
            const exe = process.platform === 'win32' ? 'todo-scanner.exe' : 'todo-scanner';
            const scannerPath = process.env.TODO_TREE_SCANNER_PATH || path.join(process.cwd(), '..', 'bin', exe);
            expect(fs.existsSync(scannerPath)).toBe(true);

            const [todoMatches, fixmeMatches] = await Promise.all([
                scanWorkspace(root, config(scannerPath, ['TODO'])),
                scanWorkspace(root, config(scannerPath, ['FIXME'])),
            ]);

            expect(todoMatches.map((match) => match.scanner.tag)).toEqual(['TODO']);
            expect(fixmeMatches.map((match) => match.scanner.tag)).toEqual(['FIXME']);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
