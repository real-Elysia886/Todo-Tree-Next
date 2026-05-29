require('ts-node/register/transpile-only');

const fs = require('fs');
const os = require('os');
const path = require('path');

function scannerAvailable() {
    const exe = process.platform === 'win32' ? 'todo-scanner.exe' : 'todo-scanner';
    return [
        path.join(__dirname, '..', 'scanner', 'target', 'release', exe),
        path.join(__dirname, '..', 'scanner', 'target', 'debug', exe),
        path.join(__dirname, '..', 'bin', exe),
    ].some(fs.existsSync);
}

function context() {
    return { extensionPath: path.join(__dirname, '..') };
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

function sortedFiles(output) {
    return output.items.map((item) => path.basename(item.file)).sort();
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

QUnit.module('daemonConnector');

QUnit.test('keeps separate daemon sessions per workspace and config', async function (assert) {
    if (!scannerAvailable()) {
        assert.ok(true, 'todo-scanner binary not built; skipping daemon test');
        return;
    }

    const { DaemonConnector } = require('../src/daemonConnector.ts');
    const connector = new DaemonConnector();
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-tree-daemon-roots-'));
    const rootA = path.join(base, 'root-a');
    const rootB = path.join(base, 'root-b');
    fs.mkdirSync(rootA);
    fs.mkdirSync(rootB);
    fs.writeFileSync(path.join(rootA, 'a.js'), '// TODO one\n', 'utf8');
    fs.writeFileSync(path.join(rootB, 'b.js'), '// FIXME two\n', 'utf8');

    try {
        const [todoOutput, fixmeOutput] = await Promise.all([
            connector.request(context(), options('TODO'), rootA, 'scan-workspace', {}),
            connector.request(context(), options('FIXME'), rootB, 'scan-workspace', {}),
        ]);

        assert.deepEqual(sortedFiles(todoOutput), ['a.js']);
        assert.deepEqual(sortedFiles(fixmeOutput), ['b.js']);
    } finally {
        connector.cleanup();
        fs.rmSync(base, { recursive: true, force: true });
    }
});

QUnit.test('uses current config when the same workspace is scanned with different tags', async function (assert) {
    if (!scannerAvailable()) {
        assert.ok(true, 'todo-scanner binary not built; skipping daemon test');
        return;
    }

    const { DaemonConnector } = require('../src/daemonConnector.ts');
    const connector = new DaemonConnector();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-tree-daemon-config-'));
    fs.writeFileSync(path.join(root, 'items.js'), '// TODO one\n// FIXME two\n', 'utf8');

    try {
        const todoOutput = await connector.request(context(), options('TODO'), root, 'scan-workspace', {});
        const fixmeOutput = await connector.request(context(), options('FIXME'), root, 'scan-workspace', {});

        assert.deepEqual(
            todoOutput.items.map((item) => item.tag),
            ['TODO']
        );
        assert.deepEqual(
            fixmeOutput.items.map((item) => item.tag),
            ['FIXME']
        );
    } finally {
        connector.cleanup();
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test('refreshes workspace cache before returning scan-workspace results', async function (assert) {
    if (!scannerAvailable()) {
        assert.ok(true, 'todo-scanner binary not built; skipping daemon test');
        return;
    }

    const { DaemonConnector } = require('../src/daemonConnector.ts');
    const connector = new DaemonConnector();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-tree-daemon-refresh-'));
    fs.writeFileSync(path.join(root, 'a.js'), '// TODO one\n', 'utf8');

    try {
        const before = await connector.request(context(), options('TODO'), root, 'scan-workspace', {});
        fs.writeFileSync(path.join(root, 'b.js'), '// TODO two\n', 'utf8');
        const after = await connector.request(context(), options('TODO'), root, 'scan-workspace', {});

        assert.deepEqual(sortedFiles(before), ['a.js']);
        assert.deepEqual(sortedFiles(after), ['a.js', 'b.js']);
    } finally {
        connector.cleanup();
        fs.rmSync(root, { recursive: true, force: true });
    }
});

QUnit.test('rejects scan-file requests outside the daemon root', async function (assert) {
    if (!scannerAvailable()) {
        assert.ok(true, 'todo-scanner binary not built; skipping daemon test');
        return;
    }

    const { DaemonConnector } = require('../src/daemonConnector.ts');
    const connector = new DaemonConnector();
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-tree-daemon-outside-'));
    const root = path.join(base, 'root');
    const outside = path.join(base, 'outside.js');
    fs.mkdirSync(root);
    fs.writeFileSync(outside, '// TODO outside\n', 'utf8');

    try {
        await assert.rejects(connector.scanFileDebounced(context(), options('TODO'), root, outside), /outside root/);
    } finally {
        connector.cleanup();
        fs.rmSync(base, { recursive: true, force: true });
    }
});

QUnit.test('cleanup is intentional and does not reconnect', async function (assert) {
    if (!scannerAvailable()) {
        assert.ok(true, 'todo-scanner binary not built; skipping daemon test');
        return;
    }

    const { DaemonConnector } = require('../src/daemonConnector.ts');
    const connector = new DaemonConnector();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-tree-daemon-kill-'));
    fs.writeFileSync(path.join(root, 'a.js'), '// TODO one\n', 'utf8');

    try {
        await connector.request(context(), options('TODO'), root, 'scan-workspace', {});
        assert.true(connector.isAlive(), 'daemon is alive after initial scan');

        connector.cleanup();
        await delay(2300);

        assert.false(connector.isAlive(), 'daemon remains stopped after cleanup');
    } finally {
        connector.cleanup();
        fs.rmSync(root, { recursive: true, force: true });
    }
});
