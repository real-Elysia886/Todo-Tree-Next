require('ts-node/register/transpile-only');
const constants = require('../src/constants.ts');

QUnit.module('constants');

QUnit.test('scan mode constants are defined', function (assert) {
    assert.equal(constants.SCAN_MODE_WORKSPACE_AND_OPEN_FILES, 'workspace');
    assert.equal(constants.SCAN_MODE_OPEN_FILES, 'open files');
    assert.equal(constants.SCAN_MODE_CURRENT_FILE, 'current file');
    assert.equal(constants.SCAN_MODE_WORKSPACE_ONLY, 'workspace only');
});

QUnit.test('status bar constants are defined', function (assert) {
    assert.equal(constants.STATUS_BAR_TOTAL, 'total');
    assert.equal(constants.STATUS_BAR_TAGS, 'tags');
    assert.equal(constants.STATUS_BAR_TOP_THREE, 'top three');
    assert.equal(constants.STATUS_BAR_CURRENT_FILE, 'current file');
});

QUnit.test('button constants are defined', function (assert) {
    assert.equal(constants.MORE_INFO_BUTTON, 'More Info');
    assert.equal(constants.YES_BUTTON, 'Yes');
    assert.equal(constants.NEVER_SHOW_AGAIN_BUTTON, 'Never Show This Again');
    assert.equal(constants.OPEN_SETTINGS_BUTTON, 'Open Settings');
    assert.equal(constants.OK_BUTTON, 'OK');
});
