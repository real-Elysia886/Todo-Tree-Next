import * as vscode from 'vscode';

export interface ScopeContext {
    context: vscode.ExtensionContext;
    debug: (text: string) => void;
    rebuild: () => void;
    clearTreeFilter: () => void;
    locateWorkspaceNode: (fsPath: string) => { fsPath: string };
    createFolderGlob: (folderPath: string, rootPath: string, suffix: string) => string;
    toGlobArray: (globs: unknown) => string[];
}

function dumpFolderFilter(ctx: ScopeContext): void {
    const { context, debug } = ctx;
    debug("Folder filter include:" + JSON.stringify(context.workspaceState.get('includeGlobs')));
    debug("Folder filter exclude:" + JSON.stringify(context.workspaceState.get('excludeGlobs')));
}

export function registerCommands(ctx: ScopeContext): vscode.Disposable[] {
    const { context, rebuild, clearTreeFilter, locateWorkspaceNode, createFolderGlob, toGlobArray } = ctx;
    const disposables: vscode.Disposable[] = [];

    disposables.push(vscode.commands.registerCommand('todo-tree.showOnlyThisFolder', (node: { fsPath: string }) => {
        const rootNode = locateWorkspaceNode(node.fsPath);
        const includeGlobs = [createFolderGlob(node.fsPath, rootNode.fsPath, "/*")];
        context.workspaceState.update('includeGlobs', includeGlobs);
        rebuild();
        dumpFolderFilter(ctx);
    }));

    disposables.push(vscode.commands.registerCommand('todo-tree.showOnlyThisFolderAndSubfolders', (node: { fsPath: string }) => {
        const rootNode = locateWorkspaceNode(node.fsPath);
        const includeGlobs = [createFolderGlob(node.fsPath, rootNode.fsPath, "/**/*")];
        context.workspaceState.update('includeGlobs', includeGlobs);
        rebuild();
        dumpFolderFilter(ctx);
    }));

    disposables.push(vscode.commands.registerCommand('todo-tree.excludeThisFolder', (node: { fsPath: string }) => {
        const rootNode = locateWorkspaceNode(node.fsPath);
        const glob = createFolderGlob(node.fsPath, rootNode.fsPath, "/**/*");
        const excludeGlobs: string[] = context.workspaceState.get('excludeGlobs') || [];
        if (excludeGlobs.indexOf(glob) === -1) {
            excludeGlobs.push(glob);
            context.workspaceState.update('excludeGlobs', excludeGlobs);
            rebuild();
            dumpFolderFilter(ctx);
        }
    }));

    disposables.push(vscode.commands.registerCommand('todo-tree.excludeThisFile', (node: { fsPath: string }) => {
        const excludeGlobs: string[] = context.workspaceState.get('excludeGlobs') || [];
        if (excludeGlobs.indexOf(node.fsPath) === -1) {
            excludeGlobs.push(node.fsPath);
            context.workspaceState.update('excludeGlobs', excludeGlobs);
            rebuild();
            dumpFolderFilter(ctx);
        }
    }));

    disposables.push(vscode.commands.registerCommand('todo-tree.switchScope', () => {
        const scopes = vscode.workspace.getConfiguration('todo-tree.filtering').get<Array<{ name: string; includeGlobs?: unknown; excludeGlobs?: unknown }>>('scopes');

        if (!scopes || scopes.length === 0) {
            vscode.window.showWarningMessage(
                "Todo-Tree: No scopes configured (see todo-tree.filtering.scopes setting)",
                "Open Settings", "OK"
            ).then(button => {
                if (button === "Open Settings") {
                    vscode.workspace.getConfiguration('todo-tree.filtering').update('scopes', [], vscode.ConfigurationTarget.Global).then(() => {
                        vscode.commands.executeCommand('workbench.action.openSettingsJson', 'todo-tree.filtering.scopes');
                    });
                }
            });
            return;
        }

        const currentIncludeGlobs = JSON.stringify(context.workspaceState.get('includeGlobs') || []);
        const currentExcludeGlobs = JSON.stringify(context.workspaceState.get('excludeGlobs') || []);

        const items = scopes.map(s => {
            const item: vscode.QuickPickItem = { label: s.name };
            const inc = JSON.stringify(toGlobArray(s.includeGlobs));
            const exc = JSON.stringify(toGlobArray(s.excludeGlobs));
            if (currentIncludeGlobs === inc && currentExcludeGlobs === exc) {
                item.description = "$(check)";
            }
            return item;
        });

        vscode.window.showQuickPick(items, { placeHolder: "Select scope..." }).then(selected => {
            if (selected) {
                const cfg = scopes.find(s => s.name === selected.label);
                if (cfg) {
                    context.workspaceState.update('includeGlobs', toGlobArray(cfg.includeGlobs));
                    context.workspaceState.update('excludeGlobs', toGlobArray(cfg.excludeGlobs));
                    rebuild();
                    dumpFolderFilter(ctx);
                }
            }
        });
    }));

    disposables.push(vscode.commands.registerCommand('todo-tree.removeFilter', () => {
        const CLEAR_TREE_FILTER = "Clear Tree Filter";
        const excludeGlobs: string[] = context.workspaceState.get('excludeGlobs') || [];
        const includeGlobs: string[] = context.workspaceState.get('includeGlobs') || [];
        const currentFilter = context.workspaceState.get<string>('currentFilter');
        const choices: Record<string, { include?: string; exclude?: string }> = {};

        if (currentFilter) {
            choices[CLEAR_TREE_FILTER] = {};
        }

        excludeGlobs.forEach(glob => {
            if (glob.endsWith("/**/*")) {
                choices["Exclude Folder: " + glob.slice(0, -5)] = { exclude: glob };
            } else if (glob.indexOf('*') === -1) {
                choices["Exclude File: " + glob] = { exclude: glob };
            } else {
                choices["Exclude: " + glob] = { exclude: glob };
            }
        });

        includeGlobs.forEach(glob => {
            if (glob.endsWith("/**/*")) {
                choices["Include Folder and Subfolders: " + glob.slice(0, -5)] = { include: glob };
            } else if (glob.endsWith("/*")) {
                choices["Include Folder: " + glob.slice(0, -2)] = { include: glob };
            } else {
                choices["Include: " + glob] = { include: glob };
            }
        });

        vscode.window.showQuickPick(Object.keys(choices), {
            matchOnDetail: true, matchOnDescription: true, canPickMany: true,
            placeHolder: "Select filters to remove"
        }).then(selection => {
            if (!selection) return;

            if (selection.indexOf(CLEAR_TREE_FILTER) === 0) {
                clearTreeFilter();
                selection.shift();
            }

            let newInclude = [...includeGlobs];
            let newExclude = [...excludeGlobs];

            selection.forEach(choice => {
                if (choices[choice]?.include) {
                    newInclude = newInclude.filter(f => choices[choice].include !== f);
                } else if (choices[choice]?.exclude) {
                    newExclude = newExclude.filter(f => choices[choice].exclude !== f);
                }
            });

            context.workspaceState.update('includeGlobs', newInclude);
            context.workspaceState.update('excludeGlobs', newExclude);
            rebuild();
            dumpFolderFilter(ctx);
        });
    }));

    disposables.push(vscode.commands.registerCommand('todo-tree.resetAllFilters', () => {
        context.workspaceState.update('includeGlobs', []);
        context.workspaceState.update('excludeGlobs', []);
        rebuild();
        dumpFolderFilter(ctx);
        clearTreeFilter();
    }));

    return disposables;
}
