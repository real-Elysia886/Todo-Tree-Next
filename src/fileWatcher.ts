import * as vscode from 'vscode';
import * as path from 'path';

import * as searchResults from './searchResults';

const SCAN_MODE_WORKSPACE_AND_OPEN_FILES = 'workspace';
const SCAN_MODE_CURRENT_FILE = 'current file';
const SCAN_MODE_WORKSPACE_ONLY = 'workspace only';

interface FileWatcherConfig {
    scanMode: () => string;
    isValidScheme: (uri: vscode.Uri) => boolean;
}

interface FileWatcherOptions {
    config: FileWatcherConfig;
    provider: {
        clear: (workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined) => void;
        remove: (callback: (() => void) | null, uri: vscode.Uri) => void;
    };
    openDocuments: Record<string, vscode.TextDocument>;
    getSelectedDocument: () => string | undefined;
    setSelectedDocument: (value: string | undefined) => void;
    showInTree: (uri: vscode.Uri) => void;
    refreshFile: (document: vscode.TextDocument) => void;
    shouldRefreshFile: () => boolean;
    isIncluded: (uri: vscode.Uri) => boolean;
    updateInformation: () => void;
    documentChanged: (document: vscode.TextDocument | undefined) => void;
    refreshTree: () => void;
    getRootFolders: () => string[];
    searchWorkspaces: (list: string[]) => void;
}

export function register(context: vscode.ExtensionContext, options: FileWatcherOptions): void {
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((e) => {
            if (e && e.document) {
                options.openDocuments[e.document.uri.toString()] = e.document;

                if (options.config.scanMode() === SCAN_MODE_CURRENT_FILE) {
                    options.provider.clear(vscode.workspace.workspaceFolders);
                    options.refreshFile(e.document);
                }

                if (
                    vscode.workspace.getConfiguration('todo-tree.tree').get('autoRefresh') === true &&
                    vscode.workspace.getConfiguration('todo-tree.tree').get('trackFile') === true
                ) {
                    if (e.document.uri && options.config.isValidScheme(e.document.uri)) {
                        if (options.getSelectedDocument() !== e.document.fileName) {
                            setTimeout(options.showInTree, 500, e.document.uri);
                        }
                        options.setSelectedDocument(undefined);
                    }
                }

                if (e.document.fileName === undefined || options.isIncluded(e.document.uri)) {
                    options.updateInformation();
                }

                options.documentChanged(e.document);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (options.config.isValidScheme(document.uri) && path.basename(document.fileName) !== 'settings.json') {
                if (options.shouldRefreshFile()) {
                    options.refreshFile(document);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document) => {
            if (options.shouldRefreshFile()) {
                if (options.config.isValidScheme(document.uri)) {
                    options.openDocuments[document.uri.toString()] = document;
                    options.refreshFile(document);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document) => {
            function removeFromTree(uri: vscode.Uri): void {
                searchResults.remove(uri);
                options.provider.remove(() => {
                    options.refreshTree();
                    options.updateInformation();
                }, uri);
            }

            delete options.openDocuments[document.uri.toString()];

            if (
                vscode.workspace.getConfiguration('todo-tree.tree').get('autoRefresh') === true &&
                options.config.scanMode() !== SCAN_MODE_WORKSPACE_ONLY
            ) {
                if (options.config.isValidScheme(document.uri)) {
                    if (options.config.scanMode() !== SCAN_MODE_WORKSPACE_AND_OPEN_FILES) {
                        removeFromTree(document.uri);
                    } else {
                        let keep = false;
                        const tempSearchList = options.getRootFolders();

                        if (tempSearchList.length === 0) {
                            options.searchWorkspaces(tempSearchList);
                        }

                        tempSearchList.forEach((p) => {
                            if (document.fileName === p || document.fileName.indexOf(p + path.sep) === 0) {
                                keep = true;
                            }
                        });

                        if (!keep) {
                            removeFromTree(document.uri);
                        }
                    }
                }
            }
        })
    );
}
