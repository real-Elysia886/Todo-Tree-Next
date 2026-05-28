import * as vscode from 'vscode';

interface MigrationContext {
    context: vscode.ExtensionContext;
    debug: (text: string) => void;
    addTag: (tag: string) => void;
}

let markdownUpdatePopupOpen = false;

function migrateIfRequired(
    c: vscode.WorkspaceConfiguration,
    setting: string,
    type: string,
    destination: string,
    debug: (text: string) => void
): boolean {
    function typeMatch(item: unknown, t: string): boolean {
        return typeof item === t || (t === 'array' && Array.isArray(item) && item.length > 0);
    }

    const details = c.inspect(setting);
    if (!details) return false;

    let migrated = false;

    if (typeMatch(details.globalValue, type)) {
        debug("Migrating global setting '" + setting + "'");
        c.update(destination + '.' + setting, details.globalValue, vscode.ConfigurationTarget.Global);
        migrated = true;
    }
    if (typeMatch(details.workspaceValue, type)) {
        debug("Migrating workspace setting '" + setting + "'");
        c.update(destination + '.' + setting, details.workspaceValue, vscode.ConfigurationTarget.Workspace);
        migrated = true;
    }
    if (typeMatch(details.workspaceFolderValue, type)) {
        debug("Migrating workspaceFolder setting '" + setting + "'");
        c.update(destination + '.' + setting, details.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder);
        migrated = true;
    }

    return migrated;
}

export function migrateSettings(ctx: MigrationContext): void {
    const c = vscode.workspace.getConfiguration('todo-tree');
    const { context, debug } = ctx;

    migrateIfRequired(c, 'autoRefresh', 'boolean', 'tree', debug);
    migrateIfRequired(c, 'customHighlight', 'object', 'highlights', debug);
    migrateIfRequired(c, 'debug', 'boolean', 'general', debug);
    migrateIfRequired(c, 'defaultHighlight', 'object', 'highlights', debug);
    migrateIfRequired(c, 'excludedWorkspaces', 'array', 'filtering', debug);
    migrateIfRequired(c, 'excludeGlobs', 'array', 'filtering', debug);
    migrateIfRequired(c, 'expanded', 'boolean', 'tree', debug);
    migrateIfRequired(c, 'filterCaseSensitive', 'boolean', 'tree', debug);
    migrateIfRequired(c, 'flat', 'boolean', 'tree', debug);
    migrateIfRequired(c, 'grouped', 'boolean', 'tree', debug);
    migrateIfRequired(c, 'hideIconsWhenGroupedByTag', 'boolean', 'tree', debug);
    migrateIfRequired(c, 'hideTreeWhenEmpty', 'boolean', 'tree', debug);
    migrateIfRequired(c, 'highlightDelay', 'number', 'highlights', debug);
    migrateIfRequired(c, 'includedWorkspaces', 'array', 'filtering', debug);
    migrateIfRequired(c, 'includeGlobs', 'array', 'filtering', debug);
    migrateIfRequired(c, 'labelFormat', 'string', 'tree', debug);
    migrateIfRequired(c, 'passGlobsToRipgrep', 'boolean', 'filtering', debug);
    migrateIfRequired(c, 'regex', 'string', 'regex', debug);
    migrateIfRequired(c, 'regexCaseSensitive', 'boolean', 'regex', debug);
    migrateIfRequired(c, 'revealBehaviour', 'string', 'general', debug);
    migrateIfRequired(c, 'ripgrep', 'string', 'ripgrep', debug);
    migrateIfRequired(c, 'ripgrepArgs', 'string', 'ripgrep', debug);
    migrateIfRequired(c, 'ripgrepMaxBuffer', 'number', 'ripgrep', debug);
    migrateIfRequired(c, 'rootFolder', 'string', 'general', debug);
    migrateIfRequired(c, 'showBadges', 'boolean', 'tree', debug);
    migrateIfRequired(c, 'showCountsInTree', 'boolean', 'tree', debug);
    migrateIfRequired(c, 'sortTagsOnlyViewAlphabetically', 'boolean', 'tree', debug);
    migrateIfRequired(c, 'statusBar', 'string', 'general', debug);
    migrateIfRequired(c, 'statusBarClickBehaviour', 'string', 'general', debug);
    migrateIfRequired(c, 'tags', 'array', 'general', debug);
    migrateIfRequired(c, 'tagsOnly', 'boolean', 'tree', debug);
    migrateIfRequired(c, 'trackFile', 'boolean', 'tree', debug);

    const OPEN_SETTINGS_BUTTON = 'Open Settings';
    const NEVER_SHOW_AGAIN_BUTTON = 'Never Show This Again';
    const MORE_INFO_BUTTON = 'More Info';

    if (context.globalState.get('migratedVersion', 0) < 189) {
        if (vscode.workspace.getConfiguration('todo-tree.tree').get('showInExplorer') === true) {
            vscode.commands.executeCommand('vscode.moveViews', {
                viewIds: ['todo-tree-view'],
                destinationId: 'workbench.view.explorer',
            });
            vscode.window
                .showInformationMessage(
                    "Todo-Tree: 'showInExplorer' has been deprecated. If needed, the view can now be dragged to where you want it.",
                    OPEN_SETTINGS_BUTTON,
                    NEVER_SHOW_AGAIN_BUTTON
                )
                .then((button) => {
                    if (button === OPEN_SETTINGS_BUTTON) {
                        vscode.commands.executeCommand(
                            'workbench.action.openSettingsJson',
                            'todo-tree.tree.showInExplorer'
                        );
                    } else if (button === NEVER_SHOW_AGAIN_BUTTON) {
                        context.globalState.update('migratedVersion', 189);
                    }
                });
        }
    }

    if (context.globalState.get('migratedVersion', 0) < 210) {
        const validValues = ['start of line', 'start of todo', 'end of todo'];
        if (
            validValues.indexOf(
                vscode.workspace.getConfiguration('todo-tree.general').get('revealBehaviour') as string
            ) === -1
        ) {
            vscode.window
                .showInformationMessage(
                    "Todo-Tree: some 'revealBehaviour' settings have been removed to make the extension more consistent with VSCode.",
                    OPEN_SETTINGS_BUTTON,
                    NEVER_SHOW_AGAIN_BUTTON
                )
                .then((button) => {
                    if (button === OPEN_SETTINGS_BUTTON) {
                        vscode.commands.executeCommand(
                            'workbench.action.openSettings',
                            'todo-tree.general.revealBehaviour'
                        );
                    } else if (button === NEVER_SHOW_AGAIN_BUTTON) {
                        context.globalState.update('migratedVersion', 210);
                    }
                });
        }
    }

    if (context.globalState.get('migratedVersion', 0) < 223) {
        if (vscode.workspace.getConfiguration('todo-tree.general').get('enableFileWatcher') === true) {
            vscode.window
                .showInformationMessage(
                    'Todo-Tree: File watcher functionality will be removed in the next version of the extension.',
                    MORE_INFO_BUTTON,
                    OPEN_SETTINGS_BUTTON,
                    NEVER_SHOW_AGAIN_BUTTON
                )
                .then((button) => {
                    if (button === MORE_INFO_BUTTON) {
                        vscode.env.openExternal(
                            vscode.Uri.parse('https://github.com/Gruntfuggly/todo-tree/issues/723')
                        );
                    } else if (button === OPEN_SETTINGS_BUTTON) {
                        vscode.commands.executeCommand(
                            'workbench.action.openSettingsJson',
                            'todo-tree.general.enableFileWatcher'
                        );
                    } else if (button === NEVER_SHOW_AGAIN_BUTTON) {
                        context.globalState.update('migratedVersion', 223);
                    }
                });
        }
    }

    // Migrate schemes from highlights to general
    const currentSchemes = vscode.workspace.getConfiguration('todo-tree.highlights').get('schemes');
    if (currentSchemes !== undefined) {
        const schemesSettings = vscode.workspace.getConfiguration('todo-tree.general').inspect('schemes');
        if (schemesSettings && currentSchemes !== schemesSettings.defaultValue) {
            const current = vscode.workspace.getConfiguration('todo-tree').inspect('highlights.schemes');
            let target = vscode.ConfigurationTarget.Global;
            if (current?.workspaceFolderValue !== undefined) {
                target = vscode.ConfigurationTarget.WorkspaceFolder;
            } else if (current?.workspaceValue !== undefined) {
                target = vscode.ConfigurationTarget.Workspace;
            }
            vscode.workspace.getConfiguration('todo-tree.general').update('schemes', currentSchemes, target);
        }
    }
}

export function checkForMarkdownUpgrade(ctx: MigrationContext): void {
    const { context, addTag } = ctx;
    const ignoreMarkdownUpdate = context.globalState.get('ignoreMarkdownUpdate', false);

    if (markdownUpdatePopupOpen || ignoreMarkdownUpdate) return;

    const c = vscode.workspace.getConfiguration('todo-tree');
    const regex = c.get<string>('regex.regex') || '';
    if (regex.indexOf('|^\\s*- \\[ \\])') === -1) return;

    markdownUpdatePopupOpen = true;
    setTimeout(() => {
        markdownUpdatePopupOpen = false;
    }, 15000);

    const MORE_INFO_BUTTON = 'More Info';
    const YES_BUTTON = 'Yes';
    const NEVER_SHOW_AGAIN_BUTTON = 'Never Show This Again';

    let message = 'Todo Tree: There is now an improved method of locating markdown TODOs.';
    const buttons: string[] = [MORE_INFO_BUTTON, NEVER_SHOW_AGAIN_BUTTON];

    const defaultRegex = c.inspect('regex.regex')?.defaultValue;
    if (regex === defaultRegex) {
        message += ' Would you like to update your settings automatically?';
        buttons.unshift(YES_BUTTON);
    }

    vscode.window.showInformationMessage(message, ...buttons).then((button) => {
        markdownUpdatePopupOpen = false;
        if (button === undefined) {
            // dismissed
        } else if (button === YES_BUTTON) {
            addTag('[ ]');
            addTag('[x]');
            c.update(
                'regex.regex',
                '(//|#|<!--|;|/\\*|^|^[ \\t]*(-|\\d+.))\\s*($TAGS)',
                vscode.ConfigurationTarget.Global
            );
        } else if (button === MORE_INFO_BUTTON) {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/Gruntfuggly/todo-tree#markdown-support'));
        } else if (button === NEVER_SHOW_AGAIN_BUTTON) {
            context.globalState.update('ignoreMarkdownUpdate', true);
        }
    });
}
