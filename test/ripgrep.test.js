const EventEmitter = require('events');
const childProcess = require('child_process');

function createFakeProcess() {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.killSignals = [];
    proc.kill = function (signal) {
        proc.killSignals.push(signal);
    };
    return proc;
}

QUnit.module('ripgrep command execution', function (hooks) {
    let originalExecFile;
    let ripgrep;

    hooks.beforeEach(function () {
        originalExecFile = childProcess.execFile;
        delete require.cache[require.resolve('../src/ripgrep.ts')];
        ripgrep = require('../src/ripgrep.ts');
    });

    hooks.afterEach(function () {
        childProcess.execFile = originalExecFile;
        ripgrep.kill();
    });

    QUnit.test('splits quoted additional arguments before execFile', async function (assert) {
        const done = assert.async();
        let capturedArgs;

        childProcess.execFile = function (file, args) {
            capturedArgs = args;
            const proc = createFakeProcess();
            setImmediate(function () {
                proc.stdout.emit('data', 'src/a file.js:2:4:// TODO quoted arg\n');
                proc.emit('close', 0);
            });
            return proc;
        };

        const matches = await ripgrep.search(process.cwd(), {
            rgPath: process.execPath,
            additional: '--glob "src/a file.js" --type-not test',
            regex: '"TODO"',
            unquotedRegex: 'TODO',
            globs: ['*.js', '!dist/**'],
        });

        assert.deepEqual(capturedArgs.slice(0, 7), [
            '--no-messages',
            '--vimgrep',
            '-H',
            '--column',
            '--line-number',
            '--color',
            'never',
        ]);
        assert.ok(capturedArgs.includes('--glob'), 'keeps additional flag');
        assert.ok(capturedArgs.includes('src/a file.js'), 'keeps quoted additional value as one arg');
        assert.ok(capturedArgs.includes('--type-not'), 'keeps following additional flag');
        assert.ok(capturedArgs.includes('test'), 'keeps following additional value');
        assert.ok(capturedArgs.includes('-e'), 'passes regex as an arg');
        assert.ok(capturedArgs.includes('TODO'), 'passes unquoted regex');
        assert.ok(capturedArgs.includes('*.js'), 'passes include glob');
        assert.ok(capturedArgs.includes('!dist/**'), 'passes exclude glob');
        assert.equal(matches.length, 1);
        assert.equal(matches[0].fsPath, 'src/a file.js');
        done();
    });

    QUnit.test('kill sends SIGINT to the active ripgrep process', function (assert) {
        const done = assert.async();
        const proc = createFakeProcess();

        childProcess.execFile = function () {
            return proc;
        };

        ripgrep.search(process.cwd(), {
            rgPath: process.execPath,
            additional: '',
            regex: '"TODO"',
            unquotedRegex: 'TODO',
            globs: [],
        });

        ripgrep.kill();
        assert.deepEqual(proc.killSignals, ['SIGINT']);

        proc.emit('close', 0);
        done();
    });
});

QUnit.module('ripgrep argument helpers', function () {
    QUnit.test('splitArgs preserves quoted strings and escaped spaces', function (assert) {
        const helpers = require('../src/ripgrep.ts').__test;

        assert.deepEqual(helpers.splitArgs('--glob "src/a file.js" --fixed-strings foo\\ bar'), [
            '--glob',
            'src/a file.js',
            '--fixed-strings',
            'foo bar',
        ]);
    });
});
