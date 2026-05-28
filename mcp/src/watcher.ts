import * as chokidar from 'chokidar';
import { loadConfig } from './config.js';
import * as scanner from './scanner.js';
import { loadAnnotations } from './annotations.js';
import { AgentContext } from './types.js';

type ChangeCallback = (uri: string) => void;

export class FileWatcher {
    private watcher: ReturnType<typeof chokidar.watch> | undefined;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private root: string;
    private onChange: ChangeCallback;
    private cachedContext: AgentContext | undefined;
    private debounceMs: number;

    constructor(root: string, onChange: ChangeCallback, debounceMs = 500) {
        this.root = root;
        this.onChange = onChange;
        this.debounceMs = debounceMs;
    }

    start(): void {
        this.watcher = chokidar.watch(this.root, {
            ignored: [
                '**/node_modules/**',
                '**/.git/**',
                '**/.todo-tree/**',
                '**/dist/**',
                '**/build/**',
                '**/coverage/**',
            ],
            persistent: true,
            ignoreInitial: true,
            depth: 20,
        });

        this.watcher.on('all', (_event: string, filePath: string) => {
            if (this.isSourceFile(filePath)) {
                this.debounceNotify();
            }
        });
    }

    private isSourceFile(filePath: string): boolean {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const sourceExts = [
            'ts',
            'tsx',
            'js',
            'jsx',
            'mjs',
            'cjs',
            'py',
            'rb',
            'go',
            'rs',
            'java',
            'kt',
            'swift',
            'c',
            'cpp',
            'h',
            'hpp',
            'cs',
            'php',
            'vue',
            'svelte',
            'html',
            'css',
            'scss',
            'md',
            'txt',
            'json',
            'yaml',
            'yml',
            'toml',
        ];
        return sourceExts.includes(ext);
    }

    private debounceNotify(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.cachedContext = undefined;
            this.onChange(`todo-tree://agent-context/${encodeURIComponent(this.root)}`);
        }, this.debounceMs);
    }

    async getCachedContext(): Promise<AgentContext> {
        if (!this.cachedContext) {
            const config = loadConfig(this.root);
            this.cachedContext = await scanner.getAgentContext(this.root, config);
        }
        return this.cachedContext;
    }

    getAnnotations(): ReturnType<typeof loadAnnotations> {
        return loadAnnotations(this.root);
    }

    stop(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        if (this.watcher) {
            this.watcher.close();
        }
    }
}
