// Test the toMatch mapping logic from scannerClient.ts
// Extracted to avoid vscode dependency

function toMatch(item) {
    return {
        fsPath: item.file,
        line: item.line,
        column: item.column,
        match: item.text,
        scanner: {
            tag: item.tag,
            severity: item.severity,
            priority: item.priority,
            assignee: item.assignee,
            dueDate: item.dueDate || item.due_date,
            labels: item.labels
        }
    };
}

QUnit.module('scannerClient.toMatch');

QUnit.test('maps basic TodoItem fields', function(assert) {
    var match = toMatch({
        file: '/src/main.ts',
        line: 10,
        column: 5,
        tag: 'TODO',
        text: '// TODO fix this',
        severity: 'normal',
        priority: 'P0'
    });

    assert.equal(match.fsPath, '/src/main.ts');
    assert.equal(match.line, 10);
    assert.equal(match.column, 5);
    assert.equal(match.match, '// TODO fix this');
    assert.equal(match.scanner.tag, 'TODO');
    assert.equal(match.scanner.severity, 'normal');
    assert.equal(match.scanner.priority, 'P0');
});

QUnit.test('passes through assignee field', function(assert) {
    var match = toMatch({
        file: 'a.js', line: 1, column: 1, tag: 'TODO',
        text: '// TODO @alice', severity: 'normal', priority: 'none',
        assignee: 'alice'
    });
    assert.equal(match.scanner.assignee, 'alice');
});

QUnit.test('passes through dueDate field', function(assert) {
    var match = toMatch({
        file: 'a.js', line: 1, column: 1, tag: 'TODO',
        text: '// TODO due:2026-06-01', severity: 'normal', priority: 'none',
        dueDate: '2026-06-01'
    });
    assert.equal(match.scanner.dueDate, '2026-06-01');
});

QUnit.test('maps scanner due_date field to dueDate', function(assert) {
    var match = toMatch({
        file: 'a.js', line: 1, column: 1, tag: 'TODO',
        text: '// TODO due:2026-06-01', severity: 'normal', priority: 'none',
        due_date: '2026-06-01'
    });
    assert.equal(match.scanner.dueDate, '2026-06-01');
});

QUnit.test('passes through labels field', function(assert) {
    var match = toMatch({
        file: 'a.js', line: 1, column: 1, tag: 'TODO',
        text: '// TODO #sec #perf', severity: 'normal', priority: 'none',
        labels: ['sec', 'perf']
    });
    assert.deepEqual(match.scanner.labels, ['sec', 'perf']);
});

QUnit.test('handles undefined optional fields', function(assert) {
    var match = toMatch({
        file: 'a.js', line: 1, column: 1, tag: 'FIXME',
        text: '// FIXME plain', severity: 'normal', priority: 'none'
    });
    assert.equal(match.scanner.assignee, undefined);
    assert.equal(match.scanner.dueDate, undefined);
    assert.equal(match.scanner.labels, undefined);
});

QUnit.test('maps all fields in full metadata item', function(assert) {
    var match = toMatch({
        file: '/project/src/auth.ts',
        line: 42,
        column: 3,
        tag: 'TODO',
        text: '// TODO:P0 fix auth @bob due:2026-01-15 #security #urgent',
        severity: 'normal',
        priority: 'P0',
        assignee: 'bob',
        dueDate: '2026-01-15',
        labels: ['security', 'urgent']
    });

    assert.equal(match.fsPath, '/project/src/auth.ts');
    assert.equal(match.line, 42);
    assert.equal(match.scanner.tag, 'TODO');
    assert.equal(match.scanner.priority, 'P0');
    assert.equal(match.scanner.assignee, 'bob');
    assert.equal(match.scanner.dueDate, '2026-01-15');
    assert.deepEqual(match.scanner.labels, ['security', 'urgent']);
});
