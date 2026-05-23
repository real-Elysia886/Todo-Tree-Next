// Run comparative benchmarks: Rust scanner vs ripgrep
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CORPUS = path.join(__dirname, 'corpus');
const CONFIG = path.join(__dirname, 'config.json');
const SCANNER = path.join(__dirname, '..', 'bin', 'todo-scanner.exe');
const ITERATIONS = 5;

if (!fs.existsSync(CORPUS)) {
    console.log('Generating corpus...');
    execFileSync('node', [path.join(__dirname, 'generate-corpus.js')]);
}

function timeMs(fn) {
    const start = process.hrtime.bigint();
    fn();
    return Number(process.hrtime.bigint() - start) / 1e6;
}

function runScanner(cmd, args) {
    return execFileSync(SCANNER, [cmd, ...args], { maxBuffer: 50 * 1024 * 1024 }).toString();
}

// --- Full workspace scan ---
const workspaceTimes = [];
let scanResult;
for (let i = 0; i < ITERATIONS; i++) {
    const t = timeMs(() => {
        scanResult = runScanner('scan-workspace', ['--root', CORPUS, '--config', CONFIG]);
    });
    workspaceTimes.push(t);
}
const parsed = JSON.parse(scanResult);

// --- Single file scan ---
const sampleFile = path.join(CORPUS, 'src', 'mod0', 'file_0.js');
const fileTimes = [];
for (let i = 0; i < ITERATIONS; i++) {
    const t = timeMs(() => {
        runScanner('scan-file', ['--root', CORPUS, '--file', sampleFile, '--config', CONFIG]);
    });
    fileTimes.push(t);
}

// --- Ripgrep comparison ---
let rgTimes = [];
try {
    const rgPath = require(path.join(__dirname, '..', 'node_modules', 'vscode-ripgrep', 'lib', 'index.js')).rgPath;
    for (let i = 0; i < ITERATIONS; i++) {
        const t = timeMs(() => {
            execFileSync(rgPath, ['--json', '-e', 'TODO|FIXME|BUG|HACK', CORPUS], { maxBuffer: 50 * 1024 * 1024 });
        });
        rgTimes.push(t);
    }
} catch (e) {
    rgTimes = [0, 0, 0, 0, 0];
    console.log('ripgrep not available, skipping comparison');
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function min(arr) { return Math.min(...arr); }

const results = {
    corpus: { files: parsed.scanned_files, todos: parsed.total_items },
    workspace_scan: { avg_ms: avg(workspaceTimes).toFixed(1), min_ms: min(workspaceTimes).toFixed(1) },
    single_file_scan: { avg_ms: avg(fileTimes).toFixed(2), min_ms: min(fileTimes).toFixed(2) },
    ripgrep_scan: { avg_ms: avg(rgTimes).toFixed(1), min_ms: min(rgTimes).toFixed(1) },
    improvement: rgTimes[0] > 0 ? (avg(rgTimes) / avg(workspaceTimes)).toFixed(1) + 'x' : 'N/A'
};

console.log(JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
console.log('\nResults saved to bench/results.json');
