import * as child_process from 'child_process';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

function gitTimeoutMs(): number {
    const raw = process.env.TODO_TREE_GIT_TIMEOUT_MS;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export function execGit(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        child_process.execFile(
            'git',
            args,
            { cwd, maxBuffer: DEFAULT_MAX_BUFFER, timeout: gitTimeoutMs() },
            (err, stdout, stderr) => {
                if (err) {
                    const message = stderr ? `${err.message}: ${stderr}` : err.message;
                    reject(new Error(`git ${args.join(' ')} failed: ${message}`));
                    return;
                }
                resolve(stdout);
            }
        );
    });
}
