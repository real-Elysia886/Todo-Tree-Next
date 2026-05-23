require('ts-node/register/transpile-only');

const Module = require('module');

function loadScopeManager(vscodeMock) {
    const resolved = require.resolve('../src/scopeManager.ts');
    delete require.cache[resolved];

    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (request === 'vscode') {
            return vscodeMock;
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        return require('../src/scopeManager.ts');
    } finally {
        Module._load = originalLoad;
    }
}

function createHarness(options) {
    const handlers = {};
    const warnings = [];
    const updates = [];
    const state = {
        includeGlobs: [],
        excludeGlobs: [],
    };
    let rebuildCount = 0;

    const vscodeMock = {
        commands: {
            registerCommand(command, handler) {
                handlers[command] = handler;
                return { dispose() {} };
            },
            executeCommand() {
                return Promise.resolve();
            },
        },
        window: {
            showWarningMessage(message) {
                warnings.push(message);
                return Promise.resolve();
            },
            showQuickPick() {
                return Promise.resolve(undefined);
            },
        },
        workspace: {
            getConfiguration() {
                return {
                    get() {
                        return [];
                    },
                    update() {
                        return Promise.resolve();
                    },
                };
            },
        },
        ConfigurationTarget: {
            Global: 1,
            Workspace: 2,
            WorkspaceFolder: 3,
        },
    };

    const scopeManager = loadScopeManager(vscodeMock);
    const context = {
        subscriptions: [],
        workspaceState: {
            get(key) {
                return state[key];
            },
            update(key, value) {
                state[key] = value;
                updates.push({ key, value });
                return Promise.resolve();
            },
        },
    };

    scopeManager.registerCommands({
        context,
        debug() {},
        rebuild() {
            rebuildCount += 1;
        },
        clearTreeFilter() {},
        locateWorkspaceNode: options && options.locateWorkspaceNode ? options.locateWorkspaceNode : () => ({ fsPath: '/workspace' }),
        createFolderGlob(folderPath, rootPath, suffix) {
            return folderPath + '|' + rootPath + '|' + suffix;
        },
        toGlobArray(value) {
            return Array.isArray(value) ? value : [];
        },
    });

    return {
        handlers,
        warnings,
        updates,
        state,
        get rebuildCount() {
            return rebuildCount;
        },
    };
}

function assertNoThrow(assert, callback, message) {
    try {
        callback();
        assert.ok(true, message);
    } catch (e) {
        assert.pushResult({
            result: false,
            actual: e,
            expected: undefined,
            message,
        });
    }
}

QUnit.module('scopeManager node guards', function() {
QUnit.test('folder and file commands do not throw without tree node context', function(assert) {
    const h = createHarness();
    const commands = [
        'todo-tree.showOnlyThisFolder',
        'todo-tree.showOnlyThisFolderAndSubfolders',
        'todo-tree.excludeThisFolder',
        'todo-tree.excludeThisFile',
    ];

    commands.forEach(command => {
        assertNoThrow(assert, () => h.handlers[command](), command + ' accepts undefined node');
        assertNoThrow(assert, () => h.handlers[command]({}), command + ' accepts node without fsPath');
        assertNoThrow(assert, () => h.handlers[command]({ fsPath: '' }), command + ' accepts empty fsPath');
    });

    assert.equal(h.rebuildCount, 0, 'missing nodes do not rebuild');
    assert.equal(h.updates.length, 0, 'missing nodes do not update filters');
    assert.equal(h.warnings.length, 12, 'missing nodes show a warning');
});

QUnit.test('folder commands do not throw when workspace root cannot be found', function(assert) {
    const h = createHarness({ locateWorkspaceNode: () => undefined });

    assertNoThrow(assert, () => h.handlers['todo-tree.showOnlyThisFolder']({ fsPath: '/outside/src' }), 'showOnlyThisFolder accepts missing root');
    assertNoThrow(assert, () => h.handlers['todo-tree.excludeThisFolder']({ fsPath: '/outside/src' }), 'excludeThisFolder accepts missing root');

    assert.equal(h.rebuildCount, 0, 'missing root does not rebuild');
    assert.equal(h.updates.length, 0, 'missing root does not update filters');
    assert.equal(h.warnings.length, 2, 'missing root shows a warning');
});

QUnit.test('folder and file commands still update filters with a valid node', function(assert) {
    const h = createHarness();

    h.handlers['todo-tree.showOnlyThisFolder']({ fsPath: '/workspace/src' });
    assert.deepEqual(h.state.includeGlobs, ['/workspace/src|/workspace|/*']);

    h.handlers['todo-tree.showOnlyThisFolderAndSubfolders']({ fsPath: '/workspace/app' });
    assert.deepEqual(h.state.includeGlobs, ['/workspace/app|/workspace|/**/*']);

    h.handlers['todo-tree.excludeThisFolder']({ fsPath: '/workspace/build' });
    assert.deepEqual(h.state.excludeGlobs, ['/workspace/build|/workspace|/**/*']);

    h.handlers['todo-tree.excludeThisFile']({ fsPath: '/workspace/src/main.ts' });
    assert.deepEqual(h.state.excludeGlobs, [
        '/workspace/build|/workspace|/**/*',
        '/workspace/src/main.ts',
    ]);

    assert.equal(h.rebuildCount, 4, 'valid commands still rebuild');
});
});
