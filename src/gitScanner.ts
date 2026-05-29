import * as path from 'path';
import * as vscode from 'vscode';

import * as searchResults from './searchResults';
import * as gitFiles from './gitFiles';

interface GitScannerOptions {
    context: vscode.ExtensionContext;
    provider: {
        clear(folders: readonly vscode.WorkspaceFolder[] | undefined): void;
    };
    todoTreeView: vscode.TreeView<unknown> & { message?: string };
    statusBarIndicator: vscode.StatusBarItem;
    searchList: string[];
    getGitRoots(): string[];
    getRootForFile(filename: string): string;
    getOptions(filename: string): any;
    scannerClient: any;
    ripgrep: any;
    addMatches(matches: unknown[], options: Record<string, unknown>, source: string): void;
    addResultsToTree(): void;
    debug(text: string): void;
    setInterrupted(value: boolean): void;
}

export function scanGitFiles(options: GitScannerOptions, staged: boolean): void {
    const roots = options.getGitRoots();
    if (roots.length === 0) {
        vscode.window.showInformationMessage('Todo Tree: No workspace folders available for Git scanning.');
        return;
    }

    options.todoTreeView.message = '';
    searchResults.clear();
    options.searchList.length = 0;
    options.provider.clear(vscode.workspace.workspaceFolders);
    options.setInterrupted(false);

    options.statusBarIndicator.text = staged
        ? 'Todo-Tree: Scanning staged files...'
        : 'Todo-Tree: Scanning changed files...';
    options.statusBarIndicator.show();

    const collector = staged ? gitFiles.stagedFiles : gitFiles.changedFiles;
    collector(roots)
        .then((files: string[]) => {
            if (files.length === 0) {
                options.todoTreeView.message = staged ? 'No staged Git files found.' : 'No changed Git files found.';
                options.addResultsToTree();
                return undefined;
            }

            options.debug('Scanning ' + files.length + ' Git file(s)');
            return files
                .reduce((promise, file) => {
                    return promise.then(() => scanFilePath(options, file));
                }, Promise.resolve())
                .then(options.addResultsToTree);
        })
        .catch((e: Error) => {
            vscode.window.showErrorMessage('Todo Tree: Git scan failed: ' + e.message);
            options.addResultsToTree();
        });
}

function scanFilePath(options: GitScannerOptions, filename: string): Promise<void> {
    const root = options.getRootForFile(filename);
    let scanOptions = options.getOptions(root);

    if (options.scannerClient.enabled(options.context, scanOptions) === true) {
        return options.scannerClient
            .scanFile(options.context, root, filename, scanOptions)
            .then((matches: any) => {
                options.addMatches(matches, { filename: filename }, 'Rust Git File');
            })
            .catch((e: Error) => {
                options.debug('Rust git file scan failed; falling back to ripgrep: ' + e.message);
                const fallbackOptions = options.getOptions(filename);
                return options.ripgrep.search('/', fallbackOptions).then((matches: any) => {
                    options.addMatches(matches, fallbackOptions, 'Git File');
                });
            });
    }

    scanOptions = options.getOptions(filename);
    return options.ripgrep.search('/', scanOptions).then((matches: any) => {
        options.addMatches(matches, scanOptions, 'Git File');
    });
}

export function getGitRoots(getRootFolders: () => string[]): string[] {
    let roots = getRootFolders() || [];

    if (roots.length === 0 && vscode.workspace.workspaceFolders) {
        roots = vscode.workspace.workspaceFolders
            .filter((folder) => folder.uri && folder.uri.scheme === 'file')
            .map((folder) => folder.uri.fsPath);
    }

    return roots;
}

export function getRootForFile(filename: string, getRootFolders: () => string[]): string {
    let roots = getRootFolders() || [];

    if (roots.length === 0 && vscode.workspace.workspaceFolders) {
        roots = vscode.workspace.workspaceFolders
            .filter((folder) => folder.uri && folder.uri.scheme === 'file')
            .map((folder) => folder.uri.fsPath);
    }

    roots = roots.sort((a, b) => b.length - a.length);

    return (
        roots.find((root) => {
            return filename === root || filename.indexOf(root + path.sep) === 0;
        }) || path.dirname(filename)
    );
}
