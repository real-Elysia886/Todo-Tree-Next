import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
    const tmpDir = path.join(os.tmpdir(), 'todo-tree-mcp-test-' + Date.now());

    beforeEach(() => {
        fs.mkdirSync(tmpDir, { recursive: true });
        delete process.env.TODO_TREE_SCANNER_PATH;
        delete process.env.TODO_TREE_TAGS;
        delete process.env.TODO_TREE_EXCLUDE_GLOBS;
        delete process.env.TODO_TREE_CONFIG;
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns default config when no overrides exist', () => {
        const config = loadConfig(tmpDir);
        expect(config.tags).toContain('TODO');
        expect(config.tags).toContain('FIXME');
        expect(config.caseSensitive).toBe(true);
        expect(config.maxFileSize).toBe(1024 * 1024);
    });

    it('reads tags from environment variable', () => {
        process.env.TODO_TREE_TAGS = 'TODO,FIXME,HACK';
        const config = loadConfig(tmpDir);
        expect(config.tags).toEqual(['TODO', 'FIXME', 'HACK']);
    });

    it('reads exclude globs from environment variable', () => {
        process.env.TODO_TREE_EXCLUDE_GLOBS = '**/vendor/**,**/dist/**';
        const config = loadConfig(tmpDir);
        expect(config.excludeGlobs).toEqual(['**/vendor/**', '**/dist/**']);
    });

    it('reads config from .todo-tree/config.json', () => {
        const configDir = path.join(tmpDir, '.todo-tree');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            path.join(configDir, 'config.json'),
            JSON.stringify({ tags: ['CUSTOM'], caseSensitive: false })
        );
        const config = loadConfig(tmpDir);
        expect(config.tags).toEqual(['CUSTOM']);
        expect(config.caseSensitive).toBe(false);
    });

    it('env vars override config file', () => {
        const configDir = path.join(tmpDir, '.todo-tree');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ tags: ['FILE_TAG'] }));
        process.env.TODO_TREE_TAGS = 'ENV_TAG';
        const config = loadConfig(tmpDir);
        expect(config.tags).toEqual(['ENV_TAG']);
    });
});
