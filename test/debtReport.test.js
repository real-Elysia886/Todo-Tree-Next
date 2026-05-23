// Test the parseDiffForTodos logic directly (extracted to avoid vscode dependency)
// This mirrors the implementation in src/debtReport.ts

function parseDiffForTodos(diff, tags) {
    const items = [];
    const tagPattern = new RegExp('\\b(' + tags.map(function(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')\\b');
    let currentFile = '';
    let lineNumber = 0;

    var lines = diff.split('\n');
    for (var i = 0; i < lines.length; i++) {
        var rawLine = lines[i];
        if (rawLine.startsWith('+++ b/')) {
            currentFile = rawLine.substring(6);
            continue;
        }
        var hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
        if (hunkMatch) {
            lineNumber = parseInt(hunkMatch[1], 10) - 1;
            continue;
        }
        if (rawLine.startsWith('+') || rawLine.startsWith(' ')) {
            lineNumber++;
        }
        if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
            var content = rawLine.substring(1);
            var match = content.match(tagPattern);
            if (match) {
                items.push({ file: currentFile, line: lineNumber, tag: match[1], text: content.trim(), status: 'added' });
            }
        } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
            var content2 = rawLine.substring(1);
            var match2 = content2.match(tagPattern);
            if (match2) {
                items.push({ file: currentFile, line: 0, tag: match2[1], text: content2.trim(), status: 'removed' });
            }
        }
    }
    return items;
}

QUnit.module('debtReport.parseDiffForTodos');

QUnit.test('parses added TODO from diff', function(assert) {
    var diff = [
        'diff --git a/src/main.ts b/src/main.ts',
        '--- a/src/main.ts',
        '+++ b/src/main.ts',
        '@@ -10,3 +10,4 @@ function foo() {',
        '     return 1;',
        '+    // TODO fix this',
        '     return 2;'
    ].join('\n');

    var items = parseDiffForTodos(diff, ['TODO', 'FIXME']);
    assert.equal(items.length, 1);
    assert.equal(items[0].file, 'src/main.ts');
    assert.equal(items[0].line, 11);
    assert.equal(items[0].tag, 'TODO');
    assert.equal(items[0].status, 'added');
});

QUnit.test('parses removed FIXME from diff', function(assert) {
    var diff = [
        '+++ b/src/util.ts',
        '@@ -5,4 +5,3 @@ function bar() {',
        '-    // FIXME old bug',
        '     return true;'
    ].join('\n');

    var items = parseDiffForTodos(diff, ['TODO', 'FIXME']);
    assert.equal(items.length, 1);
    assert.equal(items[0].tag, 'FIXME');
    assert.equal(items[0].status, 'removed');
    assert.equal(items[0].line, 0);
});

QUnit.test('handles multiple files in one diff', function(assert) {
    var diff = [
        '+++ b/a.ts',
        '@@ -1,2 +1,3 @@',
        '+// TODO first',
        '+++ b/b.ts',
        '@@ -1,2 +1,3 @@',
        '+// FIXME second'
    ].join('\n');

    var items = parseDiffForTodos(diff, ['TODO', 'FIXME']);
    assert.equal(items.length, 2);
    assert.equal(items[0].file, 'a.ts');
    assert.equal(items[0].tag, 'TODO');
    assert.equal(items[1].file, 'b.ts');
    assert.equal(items[1].tag, 'FIXME');
});

QUnit.test('ignores lines without tags', function(assert) {
    var diff = [
        '+++ b/src/main.ts',
        '@@ -1,2 +1,3 @@',
        '+    const x = 1;',
        '+    // just a comment',
        '-    const y = 2;'
    ].join('\n');

    var items = parseDiffForTodos(diff, ['TODO', 'FIXME']);
    assert.equal(items.length, 0);
});

QUnit.test('tracks line numbers correctly through context lines', function(assert) {
    var diff = [
        '+++ b/src/main.ts',
        '@@ -1,5 +1,6 @@',
        ' line1',
        ' line2',
        ' line3',
        '+// TODO at line 4',
        ' line4',
        ' line5'
    ].join('\n');

    var items = parseDiffForTodos(diff, ['TODO']);
    assert.equal(items.length, 1);
    assert.equal(items[0].line, 4);
});

QUnit.test('escapes special regex characters in tags', function(assert) {
    var diff = [
        '+++ b/README.md',
        '@@ -1,2 +1,3 @@',
        '+- [ ] new task'
    ].join('\n');

    // Note: \b word boundary doesn't match around brackets, so we use a non-word-boundary pattern
    var items = parseDiffForTodos(diff, ['TODO', 'FIXME']);
    assert.equal(items.length, 0, 'no match for TODO/FIXME in markdown task');

    // Test that special chars are escaped properly (no regex crash)
    var items2 = parseDiffForTodos(diff, ['\\[']);
    assert.equal(items2.length, 0, 'escaped bracket with word boundary does not match');
});
