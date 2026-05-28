import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadAnnotations, addAnnotations, clearAnnotations } from '../src/annotations.js';

describe('annotations', () => {
    const tmpDir = path.join(os.tmpdir(), 'todo-tree-mcp-annotations-test-' + Date.now());

    beforeEach(() => {
        fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('loads empty annotations when no file exists', () => {
        const store = loadAnnotations(tmpDir);
        expect(store.version).toBe(1);
        expect(store.annotations).toEqual([]);
    });

    it('adds annotations and persists to file', () => {
        const count = addAnnotations(tmpDir, [
            { file: 'src/test.ts', line: 10, message: 'Test annotation', severity: 'warning', source: 'test' },
        ]);
        expect(count).toBe(1);

        const store = loadAnnotations(tmpDir);
        expect(store.annotations).toHaveLength(1);
        expect(store.annotations[0].file).toBe('src/test.ts');
        expect(store.annotations[0].message).toBe('Test annotation');
        expect(store.annotations[0].timestamp).toBeDefined();
    });

    it('clears all annotations', () => {
        addAnnotations(tmpDir, [
            { file: 'a.ts', line: 1, message: 'A' },
            { file: 'b.ts', line: 2, message: 'B' },
        ]);
        const cleared = clearAnnotations(tmpDir);
        expect(cleared).toBe(2);

        const store = loadAnnotations(tmpDir);
        expect(store.annotations).toEqual([]);
    });

    it('clears annotations by source', () => {
        addAnnotations(tmpDir, [
            { file: 'a.ts', line: 1, message: 'A', source: 'claude' },
            { file: 'b.ts', line: 2, message: 'B', source: 'codex' },
        ]);
        const cleared = clearAnnotations(tmpDir, 'claude');
        expect(cleared).toBe(1);

        const store = loadAnnotations(tmpDir);
        expect(store.annotations).toHaveLength(1);
        expect(store.annotations[0].source).toBe('codex');
    });

    it('creates .todo-tree directory if needed', () => {
        addAnnotations(tmpDir, [{ file: 'x.ts', line: 1, message: 'X' }]);
        expect(fs.existsSync(path.join(tmpDir, '.todo-tree', 'annotations.json'))).toBe(true);
    });
});
