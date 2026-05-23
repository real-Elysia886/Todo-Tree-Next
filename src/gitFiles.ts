import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface GitStatusEntry {
    indexStatus: string;
    worktreeStatus: string;
    file: string;
}

function changedFiles(roots: string[]): Promise<string[]> {
    return collect(roots, 'changed');
}

function stagedFiles(roots: string[]): Promise<string[]> {
    return collect(roots, 'staged');
}

function collect(roots: string[], mode: 'changed' | 'staged'): Promise<string[]> {
    return Promise.all(roots.map((root) => {
        return status(root).then((entries) => {
            return entries
                .filter((entry) => {
                    if (mode === 'staged') {
                        return entry.indexStatus && entry.indexStatus !== ' ' && entry.indexStatus !== '?';
                    }
                    return entry.indexStatus !== ' ' || entry.worktreeStatus !== ' ';
                })
                .map((entry) => path.resolve(root, entry.file))
                .filter((file) => {
                    try {
                        return fs.existsSync(file) && fs.statSync(file).isFile();
                    } catch (e) {
                        return false;
                    }
                });
        }).catch(() => []);
    })).then((groups) => {
        const seen: Record<string, boolean> = {};
        return ([] as string[]).concat.apply([], groups).filter((file) => {
            if (seen[file]) {
                return false;
            }
            seen[file] = true;
            return true;
        });
    });
}

function status(root: string): Promise<GitStatusEntry[]> {
    return new Promise((resolve, reject) => {
        child_process.execFile('git', ['-C', root, 'status', '--porcelain', '-z'], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(parseStatus(stdout));
        });
    });
}

function parseStatus(stdout: string): GitStatusEntry[] {
    const parts = stdout.split('\0').filter((part) => part !== '');
    const entries: GitStatusEntry[] = [];

    for (let i = 0; i < parts.length; i++) {
        const item = parts[i];
        if (item.length < 4) {
            continue;
        }

        const indexStatus = item[0];
        const worktreeStatus = item[1];
        let file = item.substring(3);

        if (indexStatus === 'R' || indexStatus === 'C') {
            i++;
            if (parts[i]) {
                file = parts[i];
            }
        }

        entries.push({
            indexStatus,
            worktreeStatus,
            file
        });
    }

    return entries;
}

module.exports.changedFiles = changedFiles;
module.exports.stagedFiles = stagedFiles;
module.exports.parseStatus = parseStatus;

