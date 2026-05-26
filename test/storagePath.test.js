require('ts-node/register/transpile-only');

const os = require('os');
const path = require('path');
const storagePath = require('../src/storagePath.ts');

QUnit.module('storagePath');

QUnit.test('prefers storageUri over older storage locations', function(assert) {
    assert.equal(storagePath.getStoragePath({
        storageUri: { fsPath: '/storage' },
        storagePath: '/legacy',
        globalStorageUri: { fsPath: '/global' },
    }), '/storage');
});

QUnit.test('falls back through legacy storage path and global storage uri', function(assert) {
    assert.equal(storagePath.getStoragePath({ storagePath: '/legacy' }), '/legacy');
    assert.equal(storagePath.getStoragePath({ globalStorageUri: { fsPath: '/global' } }), '/global');
});

QUnit.test('uses temp todo-tree folder when no VS Code storage path exists', function(assert) {
    assert.equal(storagePath.getStoragePath({}), path.join(os.tmpdir(), 'todo-tree'));
});
