import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ScannerConfig {
    tags: string[];
    regex: string;
    caseSensitive: boolean;
    excludeGlobs: string[];
    includeGlobs: string[];
    includeHiddenFiles: boolean;
    maxFileSize: number;
    scannerPath: string;
}

const DEFAULT_CONFIG: ScannerConfig = {
    tags: ['BUG', 'HACK', 'FIXME', 'TODO', 'XXX', '[ ]', '[x]'],
    regex: '(//|#|<!--|;|/\\*|^|^[ \\t]*(-|\\d+.))\\s*($TAGS)',
    caseSensitive: true,
    excludeGlobs: ['**/node_modules/*/**'],
    includeGlobs: [],
    includeHiddenFiles: false,
    maxFileSize: 1024 * 1024,
    scannerPath: '',
};

function executableName(): string {
    return process.platform === 'win32' ? 'todo-scanner.exe' : 'todo-scanner';
}

function candidateScannerPaths(): string[] {
    const exe = executableName();
    const mcpDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

    return [
        path.join(mcpDir, '..', '..', 'bin', exe),
        path.join(process.cwd(), 'bin', exe),
        path.join(process.cwd(), 'scanner', 'target', 'release', exe),
        path.join(process.cwd(), 'scanner', 'target', 'debug', exe),
    ];
}

function findScannerPath(): string {
    const envPath = process.env.TODO_TREE_SCANNER_PATH;
    if (envPath && fs.existsSync(envPath)) {
        return envPath;
    }

    return candidateScannerPaths().find((p) => fs.existsSync(p)) || '';
}

function loadConfigFile(root: string): Partial<ScannerConfig> {
    const candidates = [
        path.join(root, '.todo-tree', 'config.json'),
        path.join(os.homedir(), '.config', 'todo-tree', 'config.json'),
    ];

    const envConfig = process.env.TODO_TREE_CONFIG;
    if (envConfig) {
        candidates.unshift(envConfig);
    }

    for (const configPath of candidates) {
        try {
            if (fs.existsSync(configPath)) {
                const raw = fs.readFileSync(configPath, 'utf8');
                return JSON.parse(raw);
            }
        } catch {
            // ignore parse errors
        }
    }

    return {};
}

function parseEnvTags(): string[] | undefined {
    const raw = process.env.TODO_TREE_TAGS;
    if (!raw) return undefined;
    return raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
}

function parseEnvGlobs(): string[] | undefined {
    const raw = process.env.TODO_TREE_EXCLUDE_GLOBS;
    if (!raw) return undefined;
    return raw
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
}

export function loadConfig(root: string): ScannerConfig {
    const fileConfig = loadConfigFile(root);

    const config: ScannerConfig = {
        tags: parseEnvTags() || fileConfig.tags || DEFAULT_CONFIG.tags,
        regex: fileConfig.regex || DEFAULT_CONFIG.regex,
        caseSensitive: fileConfig.caseSensitive ?? DEFAULT_CONFIG.caseSensitive,
        excludeGlobs: parseEnvGlobs() || fileConfig.excludeGlobs || DEFAULT_CONFIG.excludeGlobs,
        includeGlobs: fileConfig.includeGlobs || DEFAULT_CONFIG.includeGlobs,
        includeHiddenFiles: fileConfig.includeHiddenFiles ?? DEFAULT_CONFIG.includeHiddenFiles,
        maxFileSize: fileConfig.maxFileSize || DEFAULT_CONFIG.maxFileSize,
        scannerPath: findScannerPath(),
    };

    return config;
}
