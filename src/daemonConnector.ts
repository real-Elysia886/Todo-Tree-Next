import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { ScanOutput } from './types';

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

interface ScannerConfigPayload {
    regex: string;
    case_sensitive: boolean;
    tags: string[];
    include_globs: string[];
    exclude_globs: string[];
    include_hidden_files: boolean;
    max_file_size: number;
    native_markdown: boolean;
}

interface DaemonDescriptor {
    identity: string;
    exe: string;
    root: string;
    config: ScannerConfigPayload;
    options: ScannerOptions;
}

interface PendingRequest<T = unknown> {
    resolve(value: T): void;
    reject(error: Error): void;
}

interface DebounceEntry {
    timer: NodeJS.Timeout;
    resolve(value: ScanOutput): void;
    reject(error: Error): void;
}

interface DaemonResponse<T = unknown> {
    id: number;
    result?: T;
    error?: string;
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

function configuredScannerPath(): string | undefined {
    try {
        const configured = require('vscode').workspace.getConfiguration('todo-tree.scanner').get('path', '');
        if (configured && fs.existsSync(configured)) {
            return configured;
        }
    } catch {
        // Outside VS Code, tests and scripts use the bundled candidate paths.
    }

    return undefined;
}

function getScannerPath(context: ExtensionContextLike): string | undefined {
    return configuredScannerPath() || candidatePaths(context).find(fs.existsSync);
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

function scannerConfigFromOptions(options: ScannerOptions): ScannerConfigPayload {
    const globs = splitGlobs(options.globs);
    return {
        regex: options.unquotedRegex,
        case_sensitive: options.caseSensitive !== false,
        tags: options.tags || [],
        include_globs: globs.includeGlobs,
        exclude_globs: globs.excludeGlobs,
        include_hidden_files: options.includeHiddenFiles === true,
        max_file_size: options.maxFileSize || 1024 * 1024,
        native_markdown: true,
    };
}

function normalizePath(value: string): string {
    let normalized: string;
    try {
        normalized = fs.realpathSync.native(value);
    } catch {
        normalized = path.resolve(value);
    }

    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function normalizePayloadPath(value: string): string {
    try {
        return fs.realpathSync.native(value);
    } catch {
        return path.resolve(value);
    }
}

function descriptorFor(context: ExtensionContextLike, options: ScannerOptions, root: string): DaemonDescriptor {
    const exe = getScannerPath(context);
    if (!exe) {
        throw new Error('todo-scanner executable not found');
    }

    const normalizedExe = normalizePath(exe);
    const normalizedRoot = normalizePayloadPath(root);
    const config = scannerConfigFromOptions(options);
    const identity = JSON.stringify({
        exe: normalizedExe,
        root: normalizePath(normalizedRoot),
        config,
    });

    return {
        identity,
        exe,
        root: normalizedRoot,
        config,
        options,
    };
}

export class DaemonSession {
    private process: child_process.ChildProcess | null = null;
    private reader: readline.Interface | null = null;
    private requestCounter = 0;
    private pendingRequests = new Map<number, PendingRequest>();
    private debounceTimers = new Map<string, DebounceEntry>();
    private startPromise: Promise<string> | null = null;
    private initialized = false;
    private intentionalShutdown = false;
    private processDownHandled = true;
    private reconnectAttempts = 0;
    private reconnectTimer: NodeJS.Timeout | undefined;

    public constructor(private readonly descriptor: DaemonDescriptor) {}

    public start(): Promise<string> {
        if (this.initialized) {
            return Promise.resolve('already active');
        }
        if (this.startPromise) {
            return this.startPromise;
        }

        this.intentionalShutdown = false;
        this.clearReconnectTimer();
        this.startPromise = this.launch();
        return this.startPromise;
    }

    public sendRequest<T>(method: string, params: unknown): Promise<T> {
        if (!this.initialized) {
            return this.start().then(() => this.sendDirectRequest<T>(method, params));
        }

        return this.sendDirectRequest<T>(method, params);
    }

    public scanFileDebounced(filename: string): Promise<ScanOutput> {
        return new Promise<ScanOutput>((resolve, reject) => {
            const existing = this.debounceTimers.get(filename);
            if (existing) {
                clearTimeout(existing.timer);
                existing.reject(new Error('superseded by new update'));
            }

            const timer = setTimeout(() => {
                this.debounceTimers.delete(filename);
                this.sendRequest<ScanOutput>('scan-file', { file: filename }).then(resolve).catch(reject);
            }, 100);

            this.debounceTimers.set(filename, { timer, resolve, reject });
        });
    }

    public cleanup(): void {
        this.intentionalShutdown = true;
        this.initialized = false;
        this.startPromise = null;
        this.processDownHandled = true;
        this.clearReconnectTimer();
        this.rejectDebounced(new Error('Todo Tree Daemon connection interrupted'));
        this.rejectPending(new Error('Todo Tree Daemon connection interrupted'));

        if (this.reader) {
            this.reader.close();
            this.reader = null;
        }
        if (this.process) {
            try {
                this.process.kill();
            } catch {
                // Process is already gone.
            }
            this.process = null;
        }
    }

    public isAlive(): boolean {
        return this.initialized;
    }

    private launch(): Promise<string> {
        const { exe, root, config, options } = this.descriptor;
        if (options.outputChannel) {
            options.outputChannel.appendLine(`Todo Tree Daemon: Launching background daemon at ${exe}`);
        }

        this.processDownHandled = false;
        this.process = child_process.spawn(exe, ['daemon'], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.reader = readline.createInterface({
            input: this.process.stdout!,
            terminal: false,
        });

        this.reader.on('line', (line) => this.handleLine(line));
        this.process.stderr?.on('data', (chunk: Buffer) => {
            if (options.outputChannel) {
                const text = chunk.toString().trim();
                if (text) {
                    options.outputChannel.appendLine(`Todo Tree Daemon stderr: ${text}`);
                }
            }
        });

        this.process.once('exit', (code, signal) => {
            this.handleProcessDown(`Background process exited with code ${code} signal ${signal || ''}`.trim());
        });
        this.process.once('error', (error) => {
            this.handleProcessDown(`Spawning error: ${error.message}`);
        });

        return this.sendDirectRequest<string>('initialize', { root, config })
            .then((result) => {
                this.initialized = true;
                this.startPromise = null;
                this.reconnectAttempts = 0;

                if (options.outputChannel) {
                    options.outputChannel.appendLine(
                        `Todo Tree Daemon: Successfully preheated workspace cache for ${root}`
                    );
                }

                return result;
            })
            .catch((error) => {
                this.cleanup();
                throw error;
            });
    }

    private handleLine(line: string): void {
        try {
            const response = JSON.parse(line) as DaemonResponse;
            const handler = this.pendingRequests.get(response.id);
            if (!handler) {
                return;
            }

            this.pendingRequests.delete(response.id);
            if (response.error) {
                handler.reject(new Error(response.error));
            } else {
                handler.resolve(response.result);
            }
        } catch (error) {
            if (this.descriptor.options.outputChannel) {
                this.descriptor.options.outputChannel.appendLine(`Todo Tree Daemon: IPC parse error: ${error}`);
            }
        }
    }

    private sendDirectRequest<T>(method: string, params: unknown): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (!this.process || !this.process.stdin) {
                reject(new Error('Todo Tree Daemon is currently offline'));
                return;
            }

            const id = ++this.requestCounter;
            this.pendingRequests.set(id, { resolve, reject } as PendingRequest);

            const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
            this.process.stdin.write(payload + '\n', (error) => {
                if (error) {
                    this.pendingRequests.delete(id);
                    reject(error);
                }
            });
        });
    }

    private handleProcessDown(message: string): void {
        if (this.processDownHandled) {
            return;
        }
        this.processDownHandled = true;

        if (this.descriptor.options.outputChannel) {
            this.descriptor.options.outputChannel.appendLine(`Todo Tree Daemon: ${message}`);
        }

        this.initialized = false;
        this.startPromise = null;
        this.process = null;
        if (this.reader) {
            this.reader.close();
            this.reader = null;
        }

        const error = new Error('Todo Tree Daemon connection interrupted');
        this.rejectPending(error);
        this.rejectDebounced(error);

        if (!this.intentionalShutdown) {
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
        if (this.descriptor.options.outputChannel) {
            this.descriptor.options.outputChannel.appendLine(
                `Todo Tree Daemon: Subprocess lost. Reestablishing connection in ${delay}ms...`
            );
        }

        this.reconnectTimer = setTimeout((): void => {
            this.start().catch((): undefined => undefined);
        }, delay);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }

    private rejectPending(error: Error): void {
        this.pendingRequests.forEach((request) => request.reject(error));
        this.pendingRequests.clear();
    }

    private rejectDebounced(error: Error): void {
        this.debounceTimers.forEach((entry) => {
            clearTimeout(entry.timer);
            entry.reject(error);
        });
        this.debounceTimers.clear();
    }
}

export class DaemonConnector {
    private sessions = new Map<string, DaemonSession>();

    public start(context: ExtensionContextLike, options: ScannerOptions, root: string): Promise<DaemonSession> {
        let descriptor: DaemonDescriptor;
        try {
            descriptor = descriptorFor(context, options, root);
        } catch (error) {
            return Promise.reject(error);
        }

        let session = this.sessions.get(descriptor.identity);
        if (!session) {
            session = new DaemonSession(descriptor);
            this.sessions.set(descriptor.identity, session);
        }

        return session.start().then(
            () => session,
            (error) => {
                if (session && !session.isAlive()) {
                    this.sessions.delete(descriptor.identity);
                }
                throw error;
            }
        );
    }

    public request<T>(
        context: ExtensionContextLike,
        options: ScannerOptions,
        root: string,
        method: string,
        params: unknown
    ): Promise<T> {
        return this.start(context, options, root).then((session) => session.sendRequest<T>(method, params));
    }

    public scanFileDebounced(
        context: ExtensionContextLike,
        options: ScannerOptions,
        root: string,
        filename: string
    ): Promise<ScanOutput> {
        return this.start(context, options, root).then((session) => session.scanFileDebounced(filename));
    }

    public cleanup(): void {
        this.sessions.forEach((session) => session.cleanup());
        this.sessions.clear();
    }

    public isAlive(): boolean {
        return Array.from(this.sessions.values()).some((session) => session.isAlive());
    }
}

export const daemonConnector = new DaemonConnector();
