import * as vscode from 'vscode';

const attributes = require('./attributes.js');
const config = require('./config.js');
const utils = require('./utils.js');

const STATUS_BAR_TOTAL = 'total';
const STATUS_BAR_TAGS = 'tags';
const STATUS_BAR_TOP_THREE = 'top three';
const STATUS_BAR_CURRENT_FILE = 'current file';

const SCAN_MODE_OPEN_FILES = 'open files';
const SCAN_MODE_CURRENT_FILE = 'current file';

interface StatusBarProvider {
    getTagCountsForActivityBar(): Record<string, number>;
    getTagCountsForStatusBar(fileFilter?: string): Record<string, number>;
}

interface StatusBarTreeView {
    badge: { value: number };
    title: string;
    visible: boolean;
}

export function updateInformation(
    provider: StatusBarProvider,
    todoTreeView: StatusBarTreeView,
    statusBarIndicator: vscode.StatusBarItem
): void {
    const statusBar = vscode.workspace.getConfiguration('todo-tree.general').get<string>('statusBar');
    let counts = provider.getTagCountsForActivityBar();
    let total = Object.values(counts).reduce((a, b) => a + b, 0);

    const badgeTotal = config.shouldShowActivityBarBadge() ? total : 0;
    todoTreeView.badge = { value: badgeTotal };

    if (statusBar === STATUS_BAR_CURRENT_FILE) {
        let fileFilter: string | undefined;
        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
            fileFilter = vscode.window.activeTextEditor.document.fileName;
        }
        counts = provider.getTagCountsForStatusBar(fileFilter);
        total = Object.values(counts).reduce((a, b) => a + b, 0);
    }

    let title: string;
    if (config.shouldFlatten()) {
        title = 'Flat';
    } else if (config.shouldShowTagsOnly()) {
        title = 'Tags';
    } else {
        title = 'Tree';
    }

    if (total > 0 && vscode.workspace.getConfiguration('todo-tree.tree').get('showCountsInTree') === true) {
        title += ' (' + total + ')';
    }
    todoTreeView.title = title;

    if (statusBar === STATUS_BAR_TOTAL) {
        statusBarIndicator.text = '$(check) ' + total;
        statusBarIndicator.tooltip = 'Todo-Tree total';
        statusBarIndicator.show();
    } else if (
        statusBar === STATUS_BAR_TAGS ||
        statusBar === STATUS_BAR_CURRENT_FILE ||
        statusBar === STATUS_BAR_TOP_THREE
    ) {
        let sortedTags = Object.keys(counts);
        if (statusBar === STATUS_BAR_TOP_THREE) {
            sortedTags.sort((a, b) => (counts[a] < counts[b] ? 1 : counts[b] < counts[a] ? -1 : a > b ? 1 : -1));
            sortedTags = sortedTags.splice(0, 3);
        } else {
            sortedTags = config.tags();
        }

        let text = '';
        const showIcons = config.shouldShowIconsInsteadOfTagsInStatusBar();
        sortedTags.forEach((tag: string) => {
            if (counts[tag] > 0) {
                if (text.length > 0) {
                    text += ' ';
                }
                const icon = attributes.getIcon(tag);
                if (icon !== config.defaultHighlight().icon && showIcons) {
                    const iconStr = !utils.isCodicon(icon) ? '$(' + icon + ')' : icon;
                    text += iconStr + ' ' + counts[tag] + '  ';
                } else {
                    text += tag + ': ' + counts[tag] + ' ';
                }
            }
        });

        statusBarIndicator.text = showIcons ? text.trim() : '$(check) ' + text.trim();
        if (statusBar === STATUS_BAR_CURRENT_FILE) {
            statusBarIndicator.tooltip = 'Todo-Tree tags counts in current file';
        } else if (statusBar === STATUS_BAR_TOP_THREE) {
            statusBarIndicator.tooltip = 'Todo-Tree top three tag counts';
        } else {
            statusBarIndicator.tooltip = 'Todo-Tree tags counts';
        }
        if (Object.keys(counts).length === 0) {
            statusBarIndicator.text = '$(check) 0';
        }
        statusBarIndicator.show();
    } else {
        statusBarIndicator.hide();
    }

    const scanMode = config.scanMode();
    if (scanMode === SCAN_MODE_OPEN_FILES) {
        statusBarIndicator.text += ' (in open files)';
    } else if (scanMode === SCAN_MODE_CURRENT_FILE) {
        statusBarIndicator.text += ' (in current file)';
    }

    statusBarIndicator.command = 'todo-tree.onStatusBarClicked';
}

export function onStatusBarClicked(
    todoTreeView: StatusBarTreeView,
    settingLocation: (setting: string) => vscode.ConfigurationTarget
): void {
    if (config.clickingStatusBarShouldRevealTree()) {
        if (todoTreeView.visible === false) {
            vscode.commands.executeCommand('todo-tree-view.focus');
        }
    } else if (config.clickingStatusBarShouldToggleHighlights()) {
        const enabled = vscode.workspace.getConfiguration('todo-tree.highlights').get('enabled');
        const target = settingLocation('highlights.enabled');
        vscode.workspace.getConfiguration('todo-tree.highlights').update('enabled', !enabled, target);
    } else {
        let setting = vscode.workspace.getConfiguration('todo-tree.general').get<string>('statusBar');
        if (setting === STATUS_BAR_TOTAL) {
            setting = STATUS_BAR_TAGS;
            vscode.window.showInformationMessage('Todo Tree: Now showing tag counts');
        } else if (setting === STATUS_BAR_TAGS) {
            setting = STATUS_BAR_TOP_THREE;
            vscode.window.showInformationMessage('Todo Tree: Now showing top three tag counts');
        } else if (setting === STATUS_BAR_TOP_THREE) {
            setting = STATUS_BAR_CURRENT_FILE;
            vscode.window.showInformationMessage('Todo Tree: Now showing total tags in current file');
        } else {
            setting = STATUS_BAR_TOTAL;
            vscode.window.showInformationMessage('Todo Tree: Now showing total tags');
        }
        vscode.workspace.getConfiguration('todo-tree.general').update('statusBar', setting, true);
    }
}
