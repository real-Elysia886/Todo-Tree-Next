import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentContext, ScanOutput, ScannerMatch, TodoItem } from './types.js';
import { ScannerConfig } from './config.js';

const currentProcesses = new Set<child_process.ChildProcess>();

interface ScannerConfigFile {
    path: string;
    cleanup(): void;
}

function escapeRegexTag(tag: string): string {
    return tag.replace(/[|{}()[\]^$+*?.\\-]/g, '\\$&');
}

function expandTags(regex: string, tags: string[]): string {
    if (regex.indexOf('($TAGS)') === -1) return regex;
    const tagPattern = '(' + tags.slice().sort().reverse().map(escapeRegexTag).join('|') + ')';
    return regex.split('($TAGS)').join(tagPattern);
}

function splitGlobs(globs?: string[]): { includeGlobs: string[]; excludeGlobs: string[] } {
    const result = { includeGlobs: [] as string[], excludeGlobs: [] as string[] };
    (globs || []).forEach((glob) => {
        if (glob.startsWith('!')) {
            result.excludeGlobs.push(glob.substring(1));
        } else {
            result.includeGlobs.push(glob);
        }
    });
    return result;
}

function writeConfig(config: ScannerConfig): ScannerConfigFile {
    const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-tree-scanner-'));
    const configPath = path.join(storagePath, 'config.json');
    const scannerConfig = {
        regex: expandTags(config.regex, config.tags),
        case_sensitive: config.caseSensitive,
        tags: config.tags,
        include_globs: config.includeGlobs || [],
        exclude_globs: config.excludeGlobs || [],
        include_hidden_files: config.includeHiddenFiles,
        max_file_size: config.maxFileSize,
        native_markdown: true,
    };
    fs.writeFileSync(configPath, JSON.stringify(scannerConfig), 'utf8');
    return {
        path: configPath,
        cleanup(): void {
            fs.rmSync(storagePath, { recursive: true, force: true });
        },
    };
}

function execScanner(scannerPath: string, command: string, args: string[]): Promise<ScanOutput> {
    return new Promise((resolve, reject) => {
        if (!scannerPath) {
            reject(new Error('todo-scanner executable not found'));
            return;
        }

        const fullArgs = [command].concat(args);
        const scannerProcess = child_process.execFile(
            scannerPath,
            fullArgs,
            { maxBuffer: 50 * 1024 * 1024 },
            (error, stdout, stderr) => {
                currentProcesses.delete(scannerProcess);
                if (error) {
                    (error as Error & { stderr?: string }).stderr = stderr;
                    reject(error);
                    return;
                }
                try {
                    resolve(JSON.parse(stdout) as ScanOutput);
                } catch (parseError) {
                    (parseError as Error & { stderr?: string }).stderr = stderr;
                    reject(parseError);
                }
            }
        );
        currentProcesses.add(scannerProcess);
    });
}

function runScannerWithConfig<T>(
    config: ScannerConfig,
    command: string,
    args: string[],
    mapper: (output: ScanOutput) => T
): Promise<T> {
    const configFile = writeConfig(config);
    return execScanner(config.scannerPath, command, args.concat(['--config', configFile.path]))
        .then(mapper)
        .finally(() => {
            configFile.cleanup();
        });
}

function toMatch(item: TodoItem): ScannerMatch {
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
            labels: item.labels,
        },
    };
}

export function scanWorkspace(root: string, config: ScannerConfig): Promise<ScannerMatch[]> {
    return runScannerWithConfig(config, 'scan-workspace', ['--root', root], (output) => output.items.map(toMatch));
}

export function scanFile(root: string, filename: string, config: ScannerConfig): Promise<ScannerMatch[]> {
    return runScannerWithConfig(config, 'scan-file', ['--root', root, '--file', filename], (output) =>
        output.items.map(toMatch)
    );
}

export function getAgentContext(root: string, config: ScannerConfig): Promise<AgentContext> {
    return runScannerWithConfig(
        config,
        'agent-context',
        ['--root', root],
        (output) => output as unknown as AgentContext
    );
}

export function kill(): number {
    const processes = Array.from(currentProcesses);
    processes.forEach((process) => {
        process.kill('SIGINT');
    });
    return processes.length;
}
