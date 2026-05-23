// Generate a 5000-file test corpus for benchmarking
const fs = require('fs');
const path = require('path');

const CORPUS_DIR = path.join(__dirname, 'corpus');
const FILE_COUNT = 5000;
const TODO_RATE = 0.05; // 5% of files have TODOs

if (fs.existsSync(CORPUS_DIR)) {
    fs.rmSync(CORPUS_DIR, { recursive: true });
}

for (let i = 0; i < FILE_COUNT; i++) {
    const dir = path.join(CORPUS_DIR, 'src', `mod${Math.floor(i / 100)}`);
    fs.mkdirSync(dir, { recursive: true });

    const lines = [];
    const lineCount = 50 + Math.floor(Math.random() * 150);

    for (let j = 0; j < lineCount; j++) {
        lines.push(`function fn_${i}_${j}() { return ${j}; }`);
    }

    if (Math.random() < TODO_RATE) {
        const tags = ['TODO', 'FIXME', 'BUG', 'HACK'];
        const count = 1 + Math.floor(Math.random() * 3);
        for (let k = 0; k < count; k++) {
            const pos = Math.floor(Math.random() * lines.length);
            const tag = tags[Math.floor(Math.random() * tags.length)];
            lines[pos] = `// ${tag} benchmark item ${i}_${k}`;
        }
    }

    fs.writeFileSync(path.join(dir, `file_${i}.js`), lines.join('\n'));
}

console.log(`Generated ${FILE_COUNT} files in ${CORPUS_DIR}`);
