require('ts-node/register/transpile-only');

const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

function vscodeMock() {
    return {
        workspace: {
            getConfiguration() {
                return {
                    get(key, fallback) {
                        return fallback;
                    },
                };
            },
        },
    };
}

function scannerAvailable() {
    const exe = process.platform === 'win32' ? 'todo-scanner.exe' : 'todo-scanner';
    return [
        path.join(__dirname, '..', 'scanner', 'target', 'release', exe),
        path.join(__dirname, '..', 'bin', exe),
    ].some(fs.existsSync);
}

function options(tag) {
    return {
        unquotedRegex: '(//|#)\\s*(' + tag + ')',
        caseSensitive: true,
        tags: [tag],
        globs: [],
        maxFileSize: 1024 * 1024,
    };
}

QUnit.module('scannerClient concurrency');

QUnit.test('concurrent scans use isolated config files', async function (assert) {
    if (!scannerAvailable()) {
        assert.ok(true, 'todo-scanner binary not built; skipping concurrency test');
        return;
    }

    // scannerClient.ts requires 'vscode' lazily at call time, so keep the mock
    // installed for the duration of the awaited scans (not only during module load).
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {
            return vscodeMock();
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    const resolved = require.resolve('../src/scannerClient.ts');
    delete require.cache[resolved];
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-tree-ext-concurrency-'));

    try {
        const scannerClient = require('../src/scannerClient.ts');
        const context = { extensionPath: path.join(__dirname, '..') };
        fs.writeFileSync(path.join(root, 'a.js'), '// TODO one\n// FIXME two\n', 'utf8');

        const [todoMatches, fixmeMatches] = await Promise.all([
            scannerClient.scanWorkspace(context, root, options('TODO')),
            scannerClient.scanWorkspace(context, root, options('FIXME')),
        ]);

        assert.deepEqual(
            todoMatches.map((match) => match.scanner.tag),
            ['TODO'],
            'TODO scan only sees its own tag'
        );
        assert.deepEqual(
            fixmeMatches.map((match) => match.scanner.tag),
            ['FIXME'],
            'FIXME scan only sees its own tag'
        );
    } finally {
        try {
            require('../src/scannerClient.ts').kill();
        } catch (e) {
            // scannerClient may not have loaded if setup failed early.
        }
        Module._load = originalLoad;
        fs.rmSync(root, { recursive: true, force: true });
    }
});
