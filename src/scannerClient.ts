import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentContext, ScanOutput, ScannerMatch, TodoItem } from './types';
import { daemonConnector } from './daemonConnector';

const currentProcesses = new Set<child_process.ChildProcess>();

interface ScannerConfigFile {
    path: string;
    cleanup(): void;
}

interface ScannerOptions {
    unquotedRegex: string;
    caseSensitive?: boolean;
    tags?: string[];
    globs?: string[];
    includeHiddenFiles?: boolean;
    maxFileSize?: number;
    multiline?: boolean;
    outputChannel?: { appendLine(text: string): void };
}

interface ExtensionContextLike {
    extensionPath?: string;
    storageUri?: { fsPath: string };
}

function executableName(): string {
    return process.platform === 'win32' ? 'todo-scanner.exe' : 'todo-scanner';
}

function candidatePaths(context: ExtensionContextLike): string[] {
    const exe = executableName();
    const extensionRoot = context.extensionPath || path.join(__dirname, '..');

    return [
        path.join(extensionRoot, 'scanner', 'target', 'release', exe),
        path.join(extensionRoot, 'scanner', 'target', 'debug', exe),
        path.join(extensionRoot, 'bin', exe),
    ];
}

function scannerPath(context: ExtensionContextLike): string | undefined {
    const configured = require('vscode').workspace.getConfiguration('todo-tree.scanner').get('path', '');
    if (configured && fs.existsSync(configured)) {
        return configured;
    }

    return candidatePaths(context).find(fs.existsSync);
}

function scannerMode(): string {
    return require('vscode').workspace.getConfiguration('todo-tree.scanner').get('engine', 'auto');
}

export function isRustRequired(): boolean {
    return scannerMode() === 'rust';
}

export function unavailableReason(context: ExtensionContextLike, options: ScannerOptions): string | undefined {
    if (options.multiline === true) {
        return 'the Rust scanner does not support multiline regular expressions';
    }

    if (scannerPath(context) === undefined) {
        return 'todo-scanner executable not found';
    }

    return undefined;
}

export function enabled(context: ExtensionContextLike, options: ScannerOptions): boolean {
    const mode = scannerMode();
    if (mode === 'ripgrep') {
        return false;
    }

    return unavailableReason(context, options) === undefined;
}

function splitGlobs(globs?: string[]): { includeGlobs: string[]; excludeGlobs: string[] } {
    const result = { includeGlobs: [] as string[], excludeGlobs: [] as string[] };

    (globs || []).forEach((glob) => {
        if (glob.indexOf('!') === 0) {
            result.excludeGlobs.push(glob.substring(1));
        } else {
            result.includeGlobs.push(glob);
        }
    });

    return result;
}

function writeConfig(options: ScannerOptions): ScannerConfigFile {
    const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-tree-scanner-'));
    const configPath = path.join(storagePath, 'config.json');

    const globs = splitGlobs(options.globs);
    const scannerConfig = {
        regex: options.unquotedRegex,
        case_sensitive: options.caseSensitive !== false,
        tags: options.tags || [],
        include_globs: globs.includeGlobs,
        exclude_globs: globs.excludeGlobs,
        include_hidden_files: options.includeHiddenFiles === true,
        max_file_size: options.maxFileSize || 1024 * 1024,
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

function execScanner(
    context: ExtensionContextLike,
    command: string,
    args: string[],
    options: ScannerOptions
): Promise<ScanOutput> {
    return new Promise((resolve, reject) => {
        const exe = scannerPath(context);
        if (!exe) {
            reject(new Error('todo-scanner executable not found'));
            return;
        }

        const fullArgs = [command].concat(args);
        if (options.outputChannel) {
            options.outputChannel.appendLine('Todo Tree scanner: ' + exe + ' ' + fullArgs.join(' '));
        }

        const scannerProcess = child_process.execFile(
            exe,
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

export function scanWorkspace(
    context: ExtensionContextLike,
    root: string,
    options: ScannerOptions
): Promise<ScannerMatch[]> {
    if (enabled(context, options)) {
        return daemonConnector.request<ScanOutput>(context, options, root, 'scan-workspace', {}).then((output) => {
            if (options.outputChannel) {
                options.outputChannel.appendLine(
                    'Todo Tree Daemon (Workspace): ' +
                        output.total_items +
                        ' items in ' +
                        output.scanned_files +
                        ' files, ' +
                        output.elapsed_ms +
                        'ms'
                );
            }
            return output.items.map(toMatch);
        });
    }

    const configFile = writeConfig(options);
    return execScanner(context, 'scan-workspace', ['--root', root, '--config', configFile.path], options)
        .then((output) => {
            if (options.outputChannel) {
                options.outputChannel.appendLine(
                    'Todo Tree scanner: ' +
                        output.total_items +
                        ' items in ' +
                        output.scanned_files +
                        ' files, ' +
                        output.elapsed_ms +
                        'ms'
                );
            }
            return output.items.map(toMatch);
        })
        .finally(() => configFile.cleanup());
}

export function scanFile(
    context: ExtensionContextLike,
    root: string,
    filename: string,
    options: ScannerOptions
): Promise<ScannerMatch[]> {
    if (enabled(context, options)) {
        return daemonConnector
            .scanFileDebounced(context, options, root, filename)
            .then((output) => output.items.map(toMatch))
            .catch((err: any) => {
                if (err.message === 'superseded by new update') {
                    return [] as ScannerMatch[];
                }
                throw err;
            });
    }

    const configFile = writeConfig(options);
    return execScanner(context, 'scan-file', ['--root', root, '--file', filename, '--config', configFile.path], options)
        .then((output) => output.items.map(toMatch))
        .finally(() => configFile.cleanup());
}

export function getAgentContext(
    context: ExtensionContextLike,
    root: string,
    options: ScannerOptions
): Promise<AgentContext> {
    if (enabled(context, options)) {
        return daemonConnector
            .request<AgentContext>(context, options, root, 'agent-context', {})
            .then((output) => output);
    }

    const configFile = writeConfig(options);
    return execScanner(context, 'agent-context', ['--root', root, '--config', configFile.path], options)
        .then((output) => output as unknown as AgentContext)
        .finally(() => configFile.cleanup());
}

export function kill(): void {
    daemonConnector.cleanup();
    currentProcesses.forEach((scannerProcess) => scannerProcess.kill('SIGINT'));
    currentProcesses.clear();
}
