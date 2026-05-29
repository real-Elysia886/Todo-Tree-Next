import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as child_process from 'child_process';

import * as ripgrep from './ripgrep';
import * as scannerClient from './scannerClient';
import * as tree from './tree';
import * as colours from './colours';
import * as icons from './icons';
import * as highlights from './highlights';
import * as config from './config';
import * as utils from './utils';
import * as attributes from './attributes';
import * as searchResults from './searchResults';
import * as dashboard from './dashboard';
import * as statusBar from './statusBar';
import * as exportManager from './exportManager';
import * as commands from './commands';
import * as fileWatcher from './fileWatcher';
import * as gitScanner from './gitScanner';
import * as navigationCommands from './navigationCommands';
import * as configMigrator from './configMigrator';
import * as scopeManager from './scopeManager';
import * as debtReport from './debtReport';
import * as agentInterface from './agentInterface';
import * as storagePath from './storagePath';
import * as constants from './constants';
import * as globUtils from './globUtils';

let searchList: string[] = [];
let currentFilter: string | undefined;
let interrupted = false;
let selectedDocument: string | undefined;
let refreshTimeout: any;
let fileRefreshTimeout: any;
let hideTimeout: any;
let autoGitRefreshTimer: any;
let periodicRefreshTimer: any;
const lastGitHead: Record<string, string> = {};
const openDocuments: Record<string, vscode.TextDocument> = {};
let provider: any;
let ignoreMarkdownUpdate = false;
const markdownUpdatePopupOpen = false;

const SCAN_MODE_WORKSPACE_AND_OPEN_FILES = constants.SCAN_MODE_WORKSPACE_AND_OPEN_FILES;
const SCAN_MODE_OPEN_FILES = constants.SCAN_MODE_OPEN_FILES;
const SCAN_MODE_CURRENT_FILE = constants.SCAN_MODE_CURRENT_FILE;
const SCAN_MODE_WORKSPACE_ONLY = constants.SCAN_MODE_WORKSPACE_ONLY;

const STATUS_BAR_TOTAL = constants.STATUS_BAR_TOTAL;
const STATUS_BAR_TAGS = constants.STATUS_BAR_TAGS;
const STATUS_BAR_TOP_THREE = constants.STATUS_BAR_TOP_THREE;
const STATUS_BAR_CURRENT_FILE = constants.STATUS_BAR_CURRENT_FILE;

const MORE_INFO_BUTTON = constants.MORE_INFO_BUTTON;
const YES_BUTTON = constants.YES_BUTTON;
const NEVER_SHOW_AGAIN_BUTTON = constants.NEVER_SHOW_AGAIN_BUTTON;
const OPEN_SETTINGS_BUTTON = constants.OPEN_SETTINGS_BUTTON;
const OK_BUTTON = 'OK';

export function activate(context: vscode.ExtensionContext): void {
    let outputChannel: vscode.OutputChannel | undefined;

    function settingLocation(setting: string) {
        const current = vscode.workspace.getConfiguration('todo-tree').inspect(setting);
        if (current && current.workspaceFolderValue !== undefined) {
            return vscode.ConfigurationTarget.WorkspaceFolder;
        } else if (current && current.workspaceValue !== undefined) {
            return vscode.ConfigurationTarget.Workspace;
        }
        return vscode.ConfigurationTarget.Global;
    }

    function debug(text: string) {
        if (outputChannel) {
            const now = new Date();
            outputChannel.appendLine(
                now.toLocaleTimeString('en', { hour12: false }) +
                    '.' +
                    String(now.getMilliseconds()).padStart(3, '0') +
                    ' ' +
                    text
            );
        }
    }

    let buildCounter = context.workspaceState.get<number>('buildCounter', 1);
    context.workspaceState.update('buildCounter', ++buildCounter);

    currentFilter = context.workspaceState.get<string>('currentFilter');

    config.init(context);
    highlights.init(context, debug);
    utils.init(config);
    attributes.init(config);

    provider = new tree.TreeNodeProvider(context, debug, setButtonsAndContext);
    const statusBarIndicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);

    const todoTreeView = vscode.window.createTreeView('todo-tree-view', { treeDataProvider: provider });

    let fileSystemWatcher;

    context.subscriptions.push(provider);
    context.subscriptions.push(statusBarIndicator);
    context.subscriptions.push(todoTreeView);

    exportManager.registerContentProvider(context, provider);

    ignoreMarkdownUpdate = context.globalState.get<boolean>('ignoreMarkdownUpdate', false);

    function resetOutputChannel() {
        if (outputChannel) {
            outputChannel.dispose();
            outputChannel = undefined;
        }
        if (vscode.workspace.getConfiguration('todo-tree.general').get<boolean>('debug') === true) {
            outputChannel = vscode.window.createOutputChannel('Todo Tree');
            context.subscriptions.push(outputChannel);
        }
    }

    function refreshTree() {
        clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(function () {
            provider.refresh();
            setButtonsAndContext();
        }, 200);
    }

    function addResultsToTree() {
        if (searchResults.containsMarkdown()) {
            checkForMarkdownUpgrade();
        }

        searchResults.addToTree(provider);

        if (interrupted === false) {
            updateInformation();
        }

        provider.filter(currentFilter);
        refreshTree();
        dashboard.refresh(context, provider);
    }

    function updateInformation() {
        statusBar.updateInformation(provider, todoTreeView, statusBarIndicator);
    }

    function onStatusBarClicked() {
        statusBar.onStatusBarClicked(todoTreeView, settingLocation);
    }

    function search(options: any): Promise<any> {
        debug('Searching ' + options.filename + '...');

        function runRipgrep() {
            return ripgrep
                .search('/', options)
                .then(function (matches) {
                    addMatches(matches, options, 'File');
                })
                .catch((e) => {
                    let message = e.message;
                    if (e.stderr) {
                        message += ' (' + e.stderr + ')';
                    }
                    vscode.window.showErrorMessage('Todo-Tree: ' + message);
                });
        }

        function showRustScannerError(message: string) {
            vscode.window.showErrorMessage(
                'Todo-Tree: Rust scanner is selected but unavailable: ' + (message || 'unknown error') + '.'
            );
            return Promise.resolve();
        }

        if (options.filename && scannerClient.isRustRequired() && !scannerClient.enabled(context, options)) {
            return showRustScannerError(scannerClient.unavailableReason(context, options));
        }

        if (options.filename && scannerClient.enabled(context, options)) {
            return scannerClient
                .scanWorkspace(context, options.filename, options)
                .then(function (matches) {
                    addMatches(matches, options, 'Rust Workspace');
                })
                .catch((e) => {
                    if (scannerClient.isRustRequired()) {
                        return showRustScannerError(e.message);
                    }
                    debug('Rust scanner failed; falling back to ripgrep: ' + e.message);
                    return runRipgrep();
                });
        }

        return runRipgrep();
    }

    function addMatches(matches: any[], options: any, source: string) {
        if (matches.length > 0) {
            matches.forEach((match) => {
                match.uri = vscode.Uri.file(match.fsPath);
                debug(' Match (' + source + '): ' + JSON.stringify(match));
                searchResults.add(match);
            });
        } else if (options && options.filename) {
            searchResults.remove(vscode.Uri.file(options.filename));
        }
    }

    function buildGlobsForRipgrep(
        includeGlobs: string[],
        excludeGlobs: string[],
        tempIncludeGlobs: string[],
        tempExcludeGlobs: string[],
        submoduleExcludeGlobs: string[]
    ) {
        return globUtils.buildGlobsForRipgrep(
            includeGlobs,
            excludeGlobs,
            tempIncludeGlobs,
            tempExcludeGlobs,
            submoduleExcludeGlobs,
            config.shouldUseBuiltInFileExcludes(),
            config.shouldUseBuiltInSearchExcludes(),
            config.shouldIgnoreGitSubmodules()
        );
    }

    function getOptions(filename?: string) {
        const c = vscode.workspace.getConfiguration('todo-tree');
        const localStoragePath = storagePath.getStoragePath(context);

        const tempIncludeGlobs = context.workspaceState.get<string[]>('includeGlobs') || [];
        const tempExcludeGlobs = context.workspaceState.get<string[]>('excludeGlobs') || [];
        const submoduleExcludeGlobs = context.workspaceState.get<string[]>('submoduleExcludeGlobs') || [];

        const options: any = {
            regex: '"' + utils.getRegexSource() + '"',
            unquotedRegex: utils.getRegexSource(),
            rgPath: config.ripgrepPath(),
        };
        options.tags = config.tags();

        const globs =
            c.get('filtering.passGlobsToRipgrep') === true
                ? buildGlobsForRipgrep(
                      c.get<string[]>('filtering.includeGlobs', []),
                      c.get<string[]>('filtering.excludeGlobs', []),
                      tempIncludeGlobs,
                      tempExcludeGlobs,
                      submoduleExcludeGlobs
                  )
                : undefined;

        if (globs && globs.length > 0) {
            options.globs = globs;
        }
        if (filename) {
            options.filename = filename;
        }

        if (localStoragePath && !fs.existsSync(localStoragePath)) {
            debug('Attempting to create local storage folder ' + localStoragePath);
            fs.mkdirSync(localStoragePath, { recursive: true });
        }

        options.outputChannel = outputChannel;
        options.additional = c.get('ripgrep.ripgrepArgs');
        options.maxBuffer = c.get('ripgrep.ripgrepMaxBuffer');
        options.multiline = utils.getRegexSource().indexOf('\\n') > -1 || c.get('regex.enableMultiLine') === true;

        if (localStoragePath && fs.existsSync(localStoragePath) === true && c.get('ripgrep.usePatternFile') === true) {
            const patternFileName = crypto.randomBytes(6).readUIntLE(0, 6).toString(36) + '.txt';
            options.patternFilePath = path.join(localStoragePath, patternFileName);
        }

        if (c.get('filtering.includeHiddenFiles')) {
            options.additional += ' --hidden ';
            options.includeHiddenFiles = true;
        }
        if (c.get('regex.regexCaseSensitive') === false) {
            options.additional += ' -i ';
        }
        options.caseSensitive = c.get('regex.regexCaseSensitive') !== false;
        options.maxFileSize = vscode.workspace.getConfiguration('todo-tree.scanner').get('maxFileSize', 1024 * 1024);

        return options;
    }

    function searchWorkspaces(searchList: string[]) {
        const scanMode = config.scanMode();
        if (scanMode === SCAN_MODE_WORKSPACE_AND_OPEN_FILES || scanMode === SCAN_MODE_WORKSPACE_ONLY) {
            const includes = vscode.workspace
                .getConfiguration('todo-tree.filtering')
                .get<string[]>('includedWorkspaces', []);
            const excludes = vscode.workspace
                .getConfiguration('todo-tree.filtering')
                .get<string[]>('excludedWorkspaces', []);
            if (vscode.workspace.workspaceFolders) {
                vscode.workspace.workspaceFolders.map(function (folder) {
                    if (
                        folder.uri &&
                        folder.uri.scheme === 'file' &&
                        utils.isIncluded(folder.uri.fsPath, includes, excludes)
                    ) {
                        searchList.push(folder.uri.fsPath);
                    }
                });
            }
        }
    }

    function refreshOpenFiles() {
        if (config.scanMode() !== SCAN_MODE_WORKSPACE_ONLY) {
            Object.keys(openDocuments).map(function (document) {
                refreshFile(openDocuments[document]);
            });
        }
    }

    function applyGlobs() {
        const includeGlobs = vscode.workspace.getConfiguration('todo-tree.filtering').get<string[]>('includeGlobs', []);
        const excludeGlobs = vscode.workspace.getConfiguration('todo-tree.filtering').get<string[]>('excludeGlobs', []);

        const tempIncludeGlobs = context.workspaceState.get<string[]>('includeGlobs') || [];
        const tempExcludeGlobs = context.workspaceState.get<string[]>('excludeGlobs') || [];

        if (includeGlobs.length + excludeGlobs.length + tempIncludeGlobs.length + tempExcludeGlobs.length > 0) {
            debug('Applying globs to ' + searchResults.count() + ' items...');

            searchResults.filter(function (match) {
                return utils.isIncluded(
                    match.uri.fsPath,
                    includeGlobs.concat(tempIncludeGlobs),
                    excludeGlobs.concat(tempExcludeGlobs)
                );
            });

            debug('Remaining items: ' + searchResults.count());
        }
    }

    function iterateSearchList() {
        if (searchList.length > 0) {
            return searchList
                .reduce((p, entry) => p.finally(() => search(getOptions(entry))), Promise.resolve())
                .finally(() => {
                    debug('Found ' + searchResults.count() + ' items');
                    if (vscode.workspace.getConfiguration('todo-tree.filtering').get('passGlobsToRipgrep') !== true) {
                        applyGlobs();
                    }
                    addResultsToTree();
                    setButtonsAndContext();
                });
        } else {
            addResultsToTree();
            setButtonsAndContext();
            return Promise.resolve();
        }
    }

    function getRootFolders(): string[] | undefined {
        let rootFolders: string[] = [];
        let valid = true;
        const rootFolder = vscode.workspace.getConfiguration('todo-tree.general').get<string>('rootFolder', '');
        if (rootFolder.indexOf('${workspaceFolder}') > -1) {
            if (vscode.workspace.workspaceFolders) {
                vscode.workspace.workspaceFolders.map(function (folder) {
                    let path = rootFolder;
                    path = path.replace(/\$\{workspaceFolder\}/g, folder.uri.fsPath);
                    rootFolders.push(path);
                });
            } else {
                valid = false;
            }
        } else if (rootFolder !== '') {
            //Using the VS Code URI api to get the fspath, which will follow case sensitivity of platform
            rootFolders.push(vscode.Uri.file(rootFolder).fsPath);
        }

        rootFolders = rootFolders.map(function (rootFolder) {
            return utils.replaceEnvironmentVariables(rootFolder);
        });

        const includes = vscode.workspace
            .getConfiguration('todo-tree.filtering')
            .get<string[]>('includedWorkspaces', []);
        const excludes = vscode.workspace
            .getConfiguration('todo-tree.filtering')
            .get<string[]>('excludedWorkspaces', []);

        if (valid === true) {
            rootFolders = rootFolders.filter(function (folder) {
                return utils.isIncluded(folder, includes, excludes);
            });
        }

        return valid === true ? rootFolders : undefined;
    }

    function rebuild() {
        todoTreeView.message = '';

        searchResults.clear();
        searchList = [];

        provider.clear(vscode.workspace.workspaceFolders);

        interrupted = false;

        statusBarIndicator.text = 'Todo-Tree: Scanning...';
        statusBarIndicator.show();
        statusBarIndicator.command = 'todo-tree.stopScan';
        statusBarIndicator.tooltip = 'Click to interrupt scan';

        searchList = getRootFolders() || [];

        if (searchList.length === 0) {
            searchWorkspaces(searchList);
        }

        if (config.shouldIgnoreGitSubmodules()) {
            let submoduleExcludeGlobs: string[] = [];
            searchList.forEach(function (rootPath) {
                submoduleExcludeGlobs = submoduleExcludeGlobs.concat(utils.getSubmoduleExcludeGlobs(rootPath));
            });
            context.workspaceState.update('submoduleExcludeGlobs', submoduleExcludeGlobs);
        }

        iterateSearchList().finally(refreshOpenFiles).then(addResultsToTree);
    }

    function triggerRescan() {
        clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(function () {
            rebuild();
        }, 1000);
    }

    function resetGitWatcher() {
        function checkGitHead() {
            if (vscode.workspace.workspaceFolders) {
                vscode.workspace.workspaceFolders.map(function (folder) {
                    child_process.execFile(
                        'git',
                        ['rev-parse', 'HEAD'],
                        { cwd: folder.uri.fsPath },
                        (err, stdout, stderr) => {
                            const gitHead = stdout.toString();
                            if (
                                lastGitHead[folder.uri.fsPath] !== undefined &&
                                gitHead !== lastGitHead[folder.uri.fsPath]
                            ) {
                                debug('Rescan triggered by change to git repository');
                                triggerRescan();
                            }
                            lastGitHead[folder.uri.fsPath] = gitHead;
                        }
                    );
                });
            }
        }

        const timerInterval = vscode.workspace
            .getConfiguration('todo-tree.general')
            .get<number>('automaticGitRefreshInterval', 0);

        if (autoGitRefreshTimer) {
            clearInterval(autoGitRefreshTimer);
        }

        if (timerInterval > 0) {
            debug('Setting automatic Git refresh interval to ' + timerInterval + ' seconds');
            autoGitRefreshTimer = setInterval(checkGitHead, timerInterval * 1000);
        } else {
            debug('Automatic Git refresh disabled');
        }
    }

    function resetPeriodicRefresh() {
        const timerInterval = vscode.workspace
            .getConfiguration('todo-tree.general')
            .get<number>('periodicRefreshInterval', 0);

        if (periodicRefreshTimer) {
            clearInterval(periodicRefreshTimer);
        }

        if (timerInterval > 0) {
            debug('Setting periodic refresh interval to ' + timerInterval + ' minutes');
            periodicRefreshTimer = setInterval(triggerRescan, timerInterval * 1000 * 60);
        } else {
            debug('Periodic refresh disabled');
        }
    }

    function setButtonsAndContext() {
        const c = vscode.workspace.getConfiguration('todo-tree');
        const isTagsOnly = context.workspaceState.get('tagsOnly', c.get('tree.tagsOnly', false));
        const isGroupedByTag = context.workspaceState.get('groupedByTag', c.get('tree.groupedByTag', false));
        const isGroupedBySubTag = context.workspaceState.get('groupedBySubTag', c.get('tree.groupedBySubTag', false));
        const isCollapsible = !isTagsOnly || isGroupedByTag || isGroupedBySubTag;
        const includeGlobs = context.workspaceState.get<string[]>('includeGlobs') || [];
        const excludeGlobs = context.workspaceState.get<string[]>('excludeGlobs') || [];
        const hasSubTags = provider.hasSubTags();

        const buttons = c.get<any>('tree.buttons', {});
        const showRevealButton = buttons.reveal === true;
        const showScanModeButton = buttons.scanMode === true;
        const showViewStyleButton = buttons.viewStyle === true;
        const showGroupByTagButton = buttons.groupByTag === true;
        const showGroupBySubTagButton = buttons.groupBySubTag === true;
        const showFilterButton = buttons.filter === true;
        const showRefreshButton = buttons.refresh === true;
        const showExpandButton = buttons.expand === true;
        const showExportButton = buttons.export === true;

        vscode.commands.executeCommand(
            'setContext',
            'todo-tree-show-reveal-button',
            showRevealButton && !c.get('tree.trackFile', false)
        );
        vscode.commands.executeCommand('setContext', 'todo-tree-show-scan-mode-button', showScanModeButton);
        vscode.commands.executeCommand('setContext', 'todo-tree-show-view-style-button', showViewStyleButton);
        vscode.commands.executeCommand('setContext', 'todo-tree-show-group-by-tag-button', showGroupByTagButton);
        vscode.commands.executeCommand('setContext', 'todo-tree-show-group-by-sub-tag-button', showGroupBySubTagButton);
        vscode.commands.executeCommand('setContext', 'todo-tree-show-filter-button', showFilterButton);
        vscode.commands.executeCommand('setContext', 'todo-tree-show-refresh-button', showRefreshButton);
        vscode.commands.executeCommand('setContext', 'todo-tree-show-expand-button', showExpandButton);
        vscode.commands.executeCommand('setContext', 'todo-tree-show-export-button', showExportButton);

        vscode.commands.executeCommand(
            'setContext',
            'todo-tree-expanded',
            context.workspaceState.get('expanded', c.get('tree.expanded', false))
        );
        vscode.commands.executeCommand(
            'setContext',
            'todo-tree-flat',
            context.workspaceState.get('flat', c.get('tree.flat', false))
        );
        vscode.commands.executeCommand('setContext', 'todo-tree-tags-only', isTagsOnly);
        vscode.commands.executeCommand('setContext', 'todo-tree-grouped-by-tag', isGroupedByTag);
        vscode.commands.executeCommand('setContext', 'todo-tree-grouped-by-sub-tag', isGroupedBySubTag);
        vscode.commands.executeCommand(
            'setContext',
            'todo-tree-filtered',
            context.workspaceState.get('filtered', false)
        );
        vscode.commands.executeCommand('setContext', 'todo-tree-collapsible', isCollapsible);
        vscode.commands.executeCommand(
            'setContext',
            'todo-tree-folder-filter-active',
            includeGlobs.length + excludeGlobs.length > 0
        );
        vscode.commands.executeCommand('setContext', 'todo-tree-global-filter-active', currentFilter);
        vscode.commands.executeCommand(
            'setContext',
            'todo-tree-can-toggle-compact-folders',
            vscode.workspace.getConfiguration('explorer').get('compactFolders') === true
        );
        vscode.commands.executeCommand('setContext', 'todo-tree-has-sub-tags', hasSubTags);

        vscode.commands.executeCommand('setContext', 'todo-tree-scan-mode', config.scanMode());

        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(hideTreeIfEmpty, 1000);
    }

    function hideTreeIfEmpty() {
        let children = provider.getChildren();
        children = children.filter(function (child: any) {
            return child.isStatusNode !== true;
        });

        if (vscode.workspace.getConfiguration('todo-tree').get<boolean>('tree.hideTreeWhenEmpty') === true) {
            vscode.commands.executeCommand('setContext', 'todo-tree-is-empty', children.length === 0);
        } else {
            vscode.commands.executeCommand('setContext', 'todo-tree-is-empty', false);
        }
    }

    function isIncluded(uri: vscode.Uri) {
        if (uri.fsPath) {
            const includeGlobs = vscode.workspace
                .getConfiguration('todo-tree.filtering')
                .get<string[]>('includeGlobs', []);
            let excludeGlobs = vscode.workspace
                .getConfiguration('todo-tree.filtering')
                .get<string[]>('excludeGlobs', []);
            const includeHiddenFiles = vscode.workspace
                .getConfiguration('todo-tree.filtering')
                .get<boolean>('includeHiddenFiles', false);

            const tempIncludeGlobs = context.workspaceState.get<string[]>('includeGlobs') || [];
            const tempExcludeGlobs = context.workspaceState.get<string[]>('excludeGlobs') || [];

            if (config.shouldUseBuiltInFileExcludes()) {
                excludeGlobs = addGlobs(vscode.workspace.getConfiguration('files.exclude'), excludeGlobs);
            }

            if (config.shouldUseBuiltInSearchExcludes()) {
                excludeGlobs = addGlobs(vscode.workspace.getConfiguration('search.exclude'), excludeGlobs);
            }

            const isHidden = utils.isHidden(uri.fsPath);
            const included = utils.isIncluded(
                uri.fsPath,
                includeGlobs.concat(tempIncludeGlobs),
                excludeGlobs.concat(tempExcludeGlobs)
            );

            return included && (!isHidden || includeHiddenFiles);
        }

        return false;
    }

    function shouldScanDocument(document: vscode.TextDocument) {
        return (
            config.isValidScheme(document.uri) &&
            isIncluded(document.uri) === true &&
            (config.scanMode() !== SCAN_MODE_CURRENT_FILE ||
                (vscode.window.activeTextEditor &&
                    document.fileName === vscode.window.activeTextEditor.document.fileName))
        );
    }

    function getRootForFile(filename: string) {
        return gitScanner.getRootForFile(filename, getRootFolders);
    }

    function getGitRoots() {
        return gitScanner.getGitRoots(getRootFolders);
    }

    function scanGitFiles(staged: boolean) {
        gitScanner.scanGitFiles(
            {
                context: context,
                provider: provider,
                todoTreeView: todoTreeView,
                statusBarIndicator: statusBarIndicator,
                searchList: searchList,
                getGitRoots: getGitRoots,
                getRootForFile: getRootForFile,
                getOptions: getOptions,
                scannerClient: scannerClient,
                ripgrep: ripgrep,
                addMatches: addMatches,
                addResultsToTree: addResultsToTree,
                debug: debug,
                setInterrupted: function (value: boolean) {
                    interrupted = value;
                },
            },
            staged
        );
    }

    function refreshFileWithRust(document: vscode.TextDocument) {
        const root = getRootForFile(document.fileName);
        const options = getOptions(root);

        if (scannerClient.enabled(context, options) !== true) {
            return Promise.reject(new Error('Rust scanner is not available for file refresh'));
        }

        return scannerClient.scanFile(context, root, document.fileName, options).then(function (matches) {
            searchResults.remove(document.uri);

            matches.forEach(function (match: any) {
                match.uri = vscode.Uri.file(match.fsPath);
                debug(' Match (Rust File): ' + JSON.stringify(match));
                searchResults.add(match);
            });

            if (matches.length > 0) {
                provider.reset(document.uri);
            } else {
                provider.remove(null, document.uri);
            }

            addResultsToTree();
        });
    }

    function refreshFile(document: vscode.TextDocument) {
        if (
            shouldScanDocument(document) &&
            scannerClient.enabled(context, getOptions(getRootForFile(document.fileName)))
        ) {
            refreshFileWithRust(document).catch(function (e) {
                debug('Rust file scan failed; falling back to in-memory scan: ' + e.message);
                refreshFileFromDocument(document);
            });
            return;
        }

        refreshFileFromDocument(document);
    }

    function refreshFileFromDocument(document: vscode.TextDocument) {
        function addResult(offset: number, removeLeadingComments: boolean) {
            const position = document.positionAt(offset);
            let line = document.lineAt(position.line).text;
            if (removeLeadingComments === true) {
                line = utils.removeLineComments(line, document.fileName);
            }

            return {
                uri: document.uri,
                line: position.line + 1,
                column: position.character + 1,
                match: line,
            };
        }

        let matchesFound = false;

        searchResults.remove(document.uri);

        if (shouldScanDocument(document)) {
            const extractExtraLines = function (section: string) {
                result.extraLines.push(addResult(offset, true));
                offset += section.length + 1;
            };

            const text = document.getText();
            const regex = utils.getRegexForEditorSearch(true);

            let match;
            while ((match = regex.exec(text)) !== null) {
                while (text[match.index] === '\n' || text[match.index] === '\r') {
                    match.index++;
                    match[0] = match[0].substring(1);
                }

                var offset = match.index;
                const sections = match[0].split('\n');

                var result: any = addResult(offset, false);

                if (sections.length > 1) {
                    result.extraLines = [];
                    offset += sections[0].length + 1;
                    sections.shift();
                    sections.map(extractExtraLines);
                }

                if (!searchResults.contains(result)) {
                    searchResults.add(result);
                    matchesFound = true;
                }
            }
        }

        if (matchesFound === true) {
            provider.reset(document.uri);
        } else {
            provider.remove(null, document.uri);
        }

        addResultsToTree();
    }

    function refresh() {
        searchResults.markAsNotAdded();

        provider.clear(vscode.workspace.workspaceFolders);
        provider.rebuild();

        refreshOpenFiles();

        addResultsToTree();
        setButtonsAndContext();
    }

    function clearExpansionStateAndRefresh() {
        provider.clearExpansionState();
        refresh();
    }

    function showFlatView() {
        context.workspaceState.update('tagsOnly', false);
        context.workspaceState.update('flat', true).then(refresh);
    }

    function showTagsOnlyView() {
        context.workspaceState.update('flat', false);
        context.workspaceState.update('tagsOnly', true).then(refresh);
    }

    function showTreeView() {
        context.workspaceState.update('tagsOnly', false);
        context.workspaceState.update('flat', false).then(refresh);
    }

    function collapse() {
        context.workspaceState.update('expanded', false).then(clearExpansionStateAndRefresh);
    }
    function expand() {
        context.workspaceState.update('expanded', true).then(clearExpansionStateAndRefresh);
    }
    function groupByTag() {
        context.workspaceState.update('groupedByTag', true).then(refresh);
    }
    function ungroupByTag() {
        context.workspaceState.update('groupedByTag', false).then(refresh);
    }
    function groupBySubTag() {
        context.workspaceState.update('groupedBySubTag', true).then(refresh);
    }
    function ungroupBySubTag() {
        context.workspaceState.update('groupedBySubTag', false).then(refresh);
    }

    function clearTreeFilter() {
        currentFilter = undefined;
        context.workspaceState.update('filtered', false);
        context.workspaceState.update('currentFilter', undefined);
        provider.clearTreeFilter();
        refreshTree();
        dashboard.refresh(context, provider);
    }

    function applyTreeFilter(term: string | undefined) {
        currentFilter = term;
        if (currentFilter) {
            context.workspaceState.update('filtered', true);
            context.workspaceState.update('currentFilter', currentFilter);
            provider.filter(currentFilter);
            refreshTree();
        } else {
            clearTreeFilter();
        }
        dashboard.refresh(context, provider);
    }

    function addTag(tag: string) {
        const tags = vscode.workspace.getConfiguration('todo-tree.general').get<string[]>('tags', []);
        if (tags.indexOf(tag) === -1) {
            tags.push(tag);
            vscode.workspace.getConfiguration('todo-tree.general').update('tags', tags, true);
        }
    }

    function addTagDialog() {
        vscode.window.showInputBox({ prompt: 'New tag', placeHolder: 'e.g. FIXME' }).then(function (tag) {
            if (tag) {
                addTag(tag);
            }
        });
    }

    function removeTagDialog() {
        let tags = vscode.workspace.getConfiguration('todo-tree.general').get<string[]>('tags', []);
        vscode.window
            .showQuickPick(tags, {
                matchOnDetail: true,
                matchOnDescription: true,
                canPickMany: true,
                placeHolder: 'Select tags to remove',
            })
            .then(function (tagsToRemove) {
                if (tagsToRemove) {
                    tagsToRemove.map((tag) => {
                        tags = tags.filter((t) => tag !== t);
                    });
                    vscode.workspace.getConfiguration('todo-tree.general').update('tags', tags, true);
                }
            });
    }

    function scanWorkspaceAndOpenFiles() {
        vscode.workspace
            .getConfiguration('todo-tree.tree')
            .update('scanMode', SCAN_MODE_WORKSPACE_AND_OPEN_FILES, vscode.ConfigurationTarget.Workspace);
    }

    function scanOpenFilesOnly() {
        vscode.workspace
            .getConfiguration('todo-tree.tree')
            .update('scanMode', SCAN_MODE_OPEN_FILES, vscode.ConfigurationTarget.Workspace);
    }

    function scanCurrentFileOnly() {
        vscode.workspace
            .getConfiguration('todo-tree.tree')
            .update('scanMode', SCAN_MODE_CURRENT_FILE, vscode.ConfigurationTarget.Workspace);
    }

    function scanWorkspaceOnly() {
        vscode.workspace
            .getConfiguration('todo-tree.tree')
            .update('scanMode', SCAN_MODE_WORKSPACE_ONLY, vscode.ConfigurationTarget.Workspace);
    }

    function dumpFolderFilter() {
        debug('Folder filter include:' + JSON.stringify(context.workspaceState.get('includeGlobs')));
        debug('Folder filter exclude:' + JSON.stringify(context.workspaceState.get('excludeGlobs')));
    }

    function checkForMarkdownUpgrade() {
        configMigrator.checkForMarkdownUpgrade({ context: context, debug: debug, addTag: addTag });
    }

    function register() {
        function migrateSettings() {
            configMigrator.migrateSettings({ context: context, debug: debug, addTag: addTag });
        }

        function showInTree(uri: vscode.Uri) {
            provider.getElement(uri.fsPath, function (element: any) {
                if (todoTreeView.visible === true) {
                    todoTreeView.reveal(element, { focus: false, select: true });
                }
            });
        }

        function documentChanged(document?: vscode.TextDocument) {
            if (document) {
                vscode.window.visibleTextEditors.map((editor) => {
                    if (document === editor.document && config.isValidScheme(document.uri)) {
                        if (isIncluded(document.uri)) {
                            highlights.triggerHighlight(editor);
                        }
                    }
                });

                if (config.isValidScheme(document.uri) && path.basename(document.fileName) !== 'settings.json') {
                    if (shouldRefreshFile()) {
                        clearTimeout(fileRefreshTimeout);
                        fileRefreshTimeout = setTimeout(refreshFile, 500, document);
                    }
                }
            } else {
                vscode.window.visibleTextEditors.map((editor) => {
                    if (config.isValidScheme(editor.document.uri)) {
                        if (isIncluded(editor.document.uri)) {
                            highlights.triggerHighlight(editor);
                        }
                    }
                });
            }
        }

        function validateColours() {
            const invalidColourMessage = colours.validateColours(vscode.workspace);
            if (invalidColourMessage) {
                vscode.window.showWarningMessage('Todo Tree: ' + invalidColourMessage);
            }
            const invalidIconColourMessage = colours.validateIconColours(vscode.workspace);
            if (invalidIconColourMessage) {
                vscode.window.showWarningMessage('Todo Tree: ' + invalidIconColourMessage);
            }
        }

        function validateIcons() {
            const invalidIconMessage = icons.validateIcons(vscode.workspace);
            if (invalidIconMessage) {
                vscode.window.showWarningMessage('Todo Tree: ' + invalidIconMessage);
            }
        }

        function validatePlaceholders() {
            const unexpectedPlaceholders: string[] = [];
            utils.formatLabel(config.labelFormat(), {}, unexpectedPlaceholders);
            if (unexpectedPlaceholders.length > 0) {
                vscode.window.showErrorMessage(
                    'Todo Tree: Unexpected placeholders (' + unexpectedPlaceholders.join(',') + ')'
                );
            }
        }

        function shouldRefreshFile() {
            return (
                vscode.workspace.getConfiguration('todo-tree.tree').get<boolean>('autoRefresh', true) === true &&
                config.scanMode() !== SCAN_MODE_WORKSPACE_ONLY
            );
        }

        // We can't do anything if we can't find ripgrep
        if (!config.ripgrepPath()) {
            vscode.window.showErrorMessage(
                "Todo-Tree: Failed to find vscode-ripgrep - please install ripgrep manually and set 'todo-tree.ripgrep' to point to the executable"
            );
            return;
        }

        context.subscriptions.push(
            vscode.commands.registerCommand('todo-tree.openUrl', (url) => {
                debug('Opening ' + url);
                vscode.env.openExternal(vscode.Uri.parse(url));
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('todo-tree.filter', function () {
                vscode.window.showInputBox({ prompt: 'Filter tree' }).then(function (term) {
                    applyTreeFilter(term);
                });
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('todo-tree.openDashboard', function () {
                dashboard.show(context, provider, {
                    provider: provider,
                    rebuild: rebuild,
                    clearTreeFilter: clearTreeFilter,
                    applyFilter: applyTreeFilter,
                    scanChangedFiles: function () {
                        scanGitFiles(false);
                    },
                    scanStagedFiles: function () {
                        scanGitFiles(true);
                    },
                });
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('todo-tree.stopScan', function () {
                ripgrep.kill();
                scannerClient.kill();
                statusBarIndicator.text = 'Todo-Tree: Scanning interrupted.';
                statusBarIndicator.tooltip = 'Click to restart';
                statusBarIndicator.command = 'todo-tree.refresh';
                interrupted = true;
            })
        );

        exportManager.registerCommand(context, utils);

        scopeManager
            .registerCommands({
                context: context,
                debug: debug,
                rebuild: rebuild,
                clearTreeFilter: clearTreeFilter,
                locateWorkspaceNode: tree.locateWorkspaceNode,
                createFolderGlob: utils.createFolderGlob,
                toGlobArray: utils.toGlobArray,
            })
            .forEach(function (d: any) {
                context.subscriptions.push(d);
            });

        context.subscriptions.push(
            vscode.commands.registerCommand('todo-tree.resetCache', function () {
                function purgeFolder(folder: string | undefined) {
                    if (!folder || !fs.existsSync(folder)) {
                        return;
                    }
                    fs.readdir(folder, function (err, files) {
                        if (err) {
                            return;
                        }
                        files.map(function (file) {
                            fs.unlinkSync(path.join(folder, file));
                        });
                    });
                }

                context.workspaceState.update('includeGlobs', []);
                context.workspaceState.update('excludeGlobs', []);
                context.workspaceState.update('expandedNodes', {});
                context.workspaceState.update('submoduleExcludeGlobs', []);
                context.workspaceState.update('buildCounter', undefined);
                context.workspaceState.update('currentFilter', undefined);
                context.workspaceState.update('filtered', undefined);
                context.workspaceState.update('tagsOnly', undefined);
                context.workspaceState.update('flat', undefined);
                context.workspaceState.update('expanded', undefined);
                context.workspaceState.update('grouped', undefined);
                context.globalState.update('migratedVersion', undefined);
                context.globalState.update('ignoreMarkdownUpdate', undefined);

                purgeFolder(storagePath.getStoragePath(context));
                purgeFolder(context.globalStorageUri && context.globalStorageUri.fsPath);
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('todo-tree.reveal', function () {
                if (vscode.window.activeTextEditor) {
                    showInTree(vscode.window.activeTextEditor.document.uri);
                }
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('todo-tree.toggleItemCounts', function () {
                const current = vscode.workspace.getConfiguration('todo-tree.tree').get('showCountsInTree');
                vscode.workspace
                    .getConfiguration('todo-tree.tree')
                    .update('showCountsInTree', !current, vscode.ConfigurationTarget.Workspace);
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('todo-tree.toggleBadges', function () {
                const current = vscode.workspace.getConfiguration('todo-tree.tree').get('showBadges');
                vscode.workspace
                    .getConfiguration('todo-tree.tree')
                    .update('showBadges', !current, vscode.ConfigurationTarget.Workspace);
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('todo-tree.toggleCompactFolders', function () {
                const current = vscode.workspace.getConfiguration('todo-tree.tree').get('disableCompactFolders');
                vscode.workspace
                    .getConfiguration('todo-tree.tree')
                    .update('disableCompactFolders', !current, vscode.ConfigurationTarget.Workspace);
            })
        );

        navigationCommands.register(context, utils);
        debtReport.registerCommand(context);
        agentInterface
            .registerCommands({
                context: context,
                getRootFolders: getRootFolders,
                getOptions: getOptions,
                scannerClient: scannerClient,
                outputChannel: outputChannel,
            })
            .forEach(function (d: any) {
                context.subscriptions.push(d);
            });

        context.subscriptions.push(
            todoTreeView.onDidExpandElement(function (e) {
                provider.setExpanded((e.element as any).fsPath, true);
            })
        );
        context.subscriptions.push(
            todoTreeView.onDidCollapseElement(function (e) {
                provider.setExpanded((e.element as any).fsPath, false);
            })
        );

        commands.registerMany(context, [
            { command: 'todo-tree.filterClear', handler: clearTreeFilter },
            { command: 'todo-tree.refresh', handler: rebuild },
            {
                command: 'todo-tree.scanChangedFilesOnly',
                handler: function () {
                    scanGitFiles(false);
                },
            },
            {
                command: 'todo-tree.scanStagedFilesOnly',
                handler: function () {
                    scanGitFiles(true);
                },
            },
            { command: 'todo-tree.showFlatView', handler: showFlatView },
            { command: 'todo-tree.showTagsOnlyView', handler: showTagsOnlyView },
            { command: 'todo-tree.showTreeView', handler: showTreeView },
            { command: 'todo-tree.expand', handler: expand },
            { command: 'todo-tree.collapse', handler: collapse },
            { command: 'todo-tree.groupByTag', handler: groupByTag },
            { command: 'todo-tree.ungroupByTag', handler: ungroupByTag },
            { command: 'todo-tree.groupBySubTag', handler: groupBySubTag },
            { command: 'todo-tree.ungroupBySubTag', handler: ungroupBySubTag },
            { command: 'todo-tree.addTag', handler: addTagDialog },
            { command: 'todo-tree.removeTag', handler: removeTagDialog },
            { command: 'todo-tree.onStatusBarClicked', handler: onStatusBarClicked },
            { command: 'todo-tree.scanWorkspaceAndOpenFiles', handler: scanWorkspaceAndOpenFiles },
            { command: 'todo-tree.scanOpenFilesOnly', handler: scanOpenFilesOnly },
            { command: 'todo-tree.scanCurrentFileOnly', handler: scanCurrentFileOnly },
            { command: 'todo-tree.scanWorkspaceOnly', handler: scanWorkspaceOnly },
        ]);

        fileWatcher.register(context, {
            config: config,
            provider: provider,
            openDocuments: openDocuments,
            getSelectedDocument: function () {
                return selectedDocument;
            },
            setSelectedDocument: function (value) {
                selectedDocument = value;
            },
            showInTree: showInTree,
            refreshFile: refreshFile,
            shouldRefreshFile: shouldRefreshFile,
            isIncluded: isIncluded,
            updateInformation: updateInformation,
            documentChanged: documentChanged,
            refreshTree: refreshTree,
            getRootFolders: getRootFolders,
            searchWorkspaces: searchWorkspaces,
        });

        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(function (e) {
                if (
                    e.affectsConfiguration('todo-tree') ||
                    e.affectsConfiguration('files.exclude') ||
                    e.affectsConfiguration('explorer.compactFolders')
                ) {
                    config.clearCache();
                    if (e.affectsConfiguration('todo-tree.regex.regex')) {
                        return;
                    }

                    if (
                        e.affectsConfiguration('todo-tree.highlights.enabled') ||
                        e.affectsConfiguration('todo-tree.highlights.useColourScheme') ||
                        e.affectsConfiguration('todo-tree.highlights.foregroundColourScheme') ||
                        e.affectsConfiguration('todo-tree.highlights.backgroundColourScheme') ||
                        e.affectsConfiguration('todo-tree.highlights.defaultHighlight') ||
                        e.affectsConfiguration('todo-tree.highlights.customHighlight')
                    ) {
                        validateColours();
                        validateIcons();
                        documentChanged();
                    } else if (e.affectsConfiguration('todo-tree.tree.labelFormat')) {
                        validatePlaceholders();
                    } else if (e.affectsConfiguration('todo-tree.general.debug')) {
                        resetOutputChannel();
                    } else if (e.affectsConfiguration('todo-tree.general.automaticGitRefreshInterval')) {
                        resetGitWatcher();
                    } else if (e.affectsConfiguration('todo-tree.general.periodicRefreshInterval')) {
                        resetPeriodicRefresh();
                    }

                    if (e.affectsConfiguration('todo-tree.general.tagGroups')) {
                        config.refreshTagGroupLookup();
                        rebuild();
                        documentChanged();
                    } else if (
                        e.affectsConfiguration('todo-tree.tree.showCountsInTree') ||
                        e.affectsConfiguration('todo-tree.tree.showBadges')
                    ) {
                        refresh();
                    } else if (
                        e.affectsConfiguration('todo-tree.filtering') ||
                        e.affectsConfiguration('todo-tree.regex') ||
                        e.affectsConfiguration('todo-tree.ripgrep') ||
                        e.affectsConfiguration('todo-tree.tree') ||
                        e.affectsConfiguration('todo-tree.general.rootFolder') ||
                        e.affectsConfiguration('todo-tree.general.tags') ||
                        e.affectsConfiguration('files.exclude')
                    ) {
                        rebuild();
                        documentChanged();
                    } else if (e.affectsConfiguration('todo-tree.general.showActivityBarBadge')) {
                        updateInformation();
                    } else {
                        refresh();
                    }

                    setButtonsAndContext();
                }
            })
        );

        context.subscriptions.push(
            vscode.workspace.onDidChangeWorkspaceFolders(function () {
                provider.clear(vscode.workspace.workspaceFolders);
                provider.rebuild();
                rebuild();
            })
        );

        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(function (e) {
                documentChanged(e.document);
            })
        );

        resetOutputChannel();

        migrateSettings();
        validateColours();
        validateIcons();
        validatePlaceholders();
        setButtonsAndContext();
        resetGitWatcher();
        resetPeriodicRefresh();

        if (vscode.workspace.getConfiguration('todo-tree.tree').get<boolean>('scanAtStartup', true) === true) {
            rebuild();

            const editors = vscode.window.visibleTextEditors;
            editors.map(function (editor) {
                if (editor.document && config.isValidScheme(editor.document.uri)) {
                    openDocuments[editor.document.uri.toString()] = editor.document;
                }
                refreshOpenFiles();
            });

            if (vscode.window.activeTextEditor) {
                documentChanged(vscode.window.activeTextEditor.document);
            }
        } else {
            todoTreeView.message = 'Click the refresh button to scan...';
        }
    }

    register();
}

export function deactivate(): void {
    ripgrep.kill();
    scannerClient.kill();
    if (provider) {
        provider.clear([]);
    }
}

function addGlobs(config: vscode.WorkspaceConfiguration, globs: string[]): string[] {
    const globList = Object.keys(config);
    globList.map(function (glob) {
        if (config.get(glob) === true) {
            globs.push(glob);
        }
    });
    return globs;
}
