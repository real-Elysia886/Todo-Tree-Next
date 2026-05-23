/* eslint-disable @typescript-eslint/no-var-requires */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ScanOutput, ScannerMatch, TodoItem } from './types';

let currentProcess: child_process.ChildProcess | undefined;

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
        path.join(extensionRoot, 'bin', exe)
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

function enabled(context: ExtensionContextLike, options: ScannerOptions): boolean {
    const mode = scannerMode();
    if (mode === 'ripgrep') {
        return false;
    }

    if (options.multiline === true) {
        return false;
    }

    if (scannerPath(context) === undefined) {
        return false;
    }

    return true;
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

function writeConfig(context: ExtensionContextLike, options: ScannerOptions): string {
    const storagePath = context.storageUri && context.storageUri.fsPath ? context.storageUri.fsPath : os.tmpdir();
    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
    }

    const globs = splitGlobs(options.globs);
    const configPath = path.join(storagePath, 'todo-scanner-config.json');
    const scannerConfig = {
        regex: options.unquotedRegex,
        case_sensitive: options.caseSensitive !== false,
        tags: options.tags || [],
        include_globs: globs.includeGlobs,
        exclude_globs: globs.excludeGlobs,
        include_hidden_files: options.includeHiddenFiles === true,
        max_file_size: options.maxFileSize || 1024 * 1024,
        native_markdown: true
    };

    fs.writeFileSync(configPath, JSON.stringify(scannerConfig), 'utf8');
    return configPath;
}

function execScanner(context: ExtensionContextLike, command: string, args: string[], options: ScannerOptions): Promise<ScanOutput> {
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

        currentProcess = child_process.execFile(exe, fullArgs, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            currentProcess = undefined;

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
        });
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
            dueDate: item.dueDate,
            labels: item.labels
        }
    };
}

function scanWorkspace(context: ExtensionContextLike, root: string, options: ScannerOptions): Promise<ScannerMatch[]> {
    const configPath = writeConfig(context, options);
    return execScanner(context, 'scan-workspace', ['--root', root, '--config', configPath], options)
        .then((output) => {
            if (options.outputChannel) {
                options.outputChannel.appendLine(
                    'Todo Tree scanner: ' + output.total_items + ' items in ' +
                    output.scanned_files + ' files, ' + output.elapsed_ms + 'ms'
                );
            }
            return output.items.map(toMatch);
        });
}

function scanFile(context: ExtensionContextLike, root: string, filename: string, options: ScannerOptions): Promise<ScannerMatch[]> {
    const configPath = writeConfig(context, options);
    return execScanner(context, 'scan-file', ['--root', root, '--file', filename, '--config', configPath], options)
        .then((output) => output.items.map(toMatch));
}

function kill(): void {
    if (currentProcess !== undefined) {
        currentProcess.kill('SIGINT');
    }
}

module.exports.enabled = enabled;
module.exports.scanWorkspace = scanWorkspace;
module.exports.scanFile = scanFile;
module.exports.kill = kill;

