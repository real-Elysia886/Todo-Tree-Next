/* jshint esversion:6 */

var vscode = require('vscode') as typeof import('vscode');
var path = require('path') as typeof import('path');

var utils = require('./utils.js') as any;
var icons = require('./icons.js') as any;
var config = require('./config.js') as any;
var filterQuery = require('./filterQuery') as any;

interface TreeNode {
    type: string;
    fsPath: string;
    label: string;
    nodes?: TreeNode[];
    id: number;
    visible: boolean;
    hidden?: boolean;
    isFolder?: boolean;
    isWorkspaceNode?: boolean;
    isRootTagNode?: boolean;
    isStatusNode?: boolean;
    isExtraLine?: boolean;
    notExported?: boolean;
    pathElement?: string;
    pathLabel?: string;
    tag?: string;
    subTag?: string;
    actualTag?: string;
    line?: number;
    column?: number;
    endColumn?: number;
    uri?: any;
    parent?: TreeNode;
    after?: string;
    before?: string;
    priority?: string;
    severity?: string;
    text?: string;
    extraLines?: TreeNode[];
    expanded?: boolean;
    showCount?: boolean;
    tooltip?: string;
    icon?: string;
    empty?: boolean;
    description?: string;
}

interface ScanResult {
    uri: any;
    match: string;
    line: number;
    column: number;
    extraLines?: any[];
    expanded?: boolean;
    scanner?: { priority?: string; severity?: string };
}

let workspaceFolders: any;
let nodes: TreeNode[] = [];
let currentFilter: string | undefined;

const tagNodeMap = new Map<string, TreeNode>();
const todoNodeSet = new Set<string>();

function tagKey(tag: string, caseSensitive: boolean): string {
    return caseSensitive ? tag : tag.toLowerCase();
}

function todoKey(node: TreeNode): string {
    return (node.fsPath || '') + ':' + (node.line || 0) + ':' + (node.column || 0);
}

const PATH = 'path';
const TODO = 'todo';

let buildCounter = 1;
let nodeCounter = 1;

let expandedNodes = {};

let treeHasSubTags = false;

const isVisible = function (e) {
    return e.visible === true && e.hidden !== true;
};

const isTodoNode = function (e) {
    return e.type === TODO;
};

const isPathNode = function (e) {
    return e.type === PATH;
};

const findTagNode = function (node) {
    if (config.isRegexCaseSensitive()) {
        return isPathNode(node) && node.tag === this.toString();
    }
    return isPathNode(node) && node.tag && node.tag.toLowerCase() === this.toString().toLowerCase();
};

const findSubTagNode = function (node) {
    if (config.isRegexCaseSensitive()) {
        return node.type === PATH && node.subTag === this.toString();
    }
    return node.type === PATH && node.subTag && node.subTag.toLowerCase() === this.toString().toLowerCase();
};

const findExactPath = function (node) {
    return isPathNode(node) && node.fsPath === this.toString();
};

const findPathNode = function (node) {
    return isPathNode(node) && node.pathElement === this.toString();
};

const findTodoNode = function (node) {
    return (
        isTodoNode(node) &&
        node.label === this.label.toString() &&
        node.fsPath === this.fsPath &&
        node.line === this.line
    );
};

const sortFoldersFirst = function (a, b, same) {
    if (a.isFolder === b.isFolder) {
        return same(a, b);
    } else {
        return b.isFolder ? 1 : -1;
    }
};

const sortByLineAndColumn = function (a, b) {
    return a.line > b.line ? 1 : b.line > a.line ? -1 : a.column > b.column ? 1 : -1;
};

function rebuildIndices(): void {
    tagNodeMap.clear();
    todoNodeSet.clear();
    const caseSensitive = config.isRegexCaseSensitive();
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (isPathNode(node) && node.tag) {
            tagNodeMap.set(tagKey(node.tag, caseSensitive), node);
            if (node.subTag) {
                tagNodeMap.set(tagKey(node.subTag, caseSensitive), node);
            }
        } else if (isTodoNode(node)) {
            todoNodeSet.add(todoKey(node));
        }
    }
}

const sortByFilenameAndLine = function (a, b) {
    return sortFoldersFirst(a, b, function (a, b) {
        if (a.isRootTagNode === true && b.isRootTagNode === true) {
            const tags = config.tags();
            return tags.indexOf(a.tag) > tags.indexOf(b.tag)
                ? 1
                : tags.indexOf(b.tag) > tags.indexOf(a.tag)
                  ? -1
                  : sortByLineAndColumn(a, b);
        }
        return a.fsPath > b.fsPath ? 1 : b.fsPath > a.fsPath ? -1 : sortByLineAndColumn(a, b);
    });
};

const sortTagsOnlyViewByLabel = function (a, b) {
    return sortFoldersFirst(a, b, function (a, b) {
        return a.label > b.label ? 1 : b.label > a.label ? -1 : sortByLineAndColumn(a, b);
    });
};

const sortTagsOnlyViewByTagOrder = function (a, b) {
    return sortFoldersFirst(a, b, function (a, b) {
        const tags = config.tags();
        const indexA = tags.indexOf(a.tag);
        const indexB = tags.indexOf(b.tag);
        return indexA > indexB ? 1 : indexB > indexA ? -1 : sortByFilenameAndLine(a, b);
    });
};

function createWorkspaceRootNode(folder) {
    const id = buildCounter * 1000000 + nodeCounter++;
    const node = {
        isWorkspaceNode: true,
        type: PATH,
        label: folder.uri.scheme === 'file' ? folder.name : folder.uri.authority,
        nodes: [],
        fsPath: folder.uri.scheme === 'file' ? folder.uri.fsPath : folder.uri.authority + folder.uri.fsPath,
        id: id,
        visible: true,
        isFolder: true,
    };
    return node;
}

function createPathNode(folder: any, pathElements: any[], isFolder: any, subTag?: any) {
    const id = buildCounter * 1000000 + nodeCounter++;
    const fsPath = pathElements.length > 0 ? path.join(folder, pathElements.join(path.sep)) : folder;

    return {
        type: PATH,
        fsPath: fsPath,
        pathElement: pathElements[pathElements.length - 1],
        label: pathElements[pathElements.length - 1],
        nodes: [],
        id: id,
        visible: true,
        isFolder: isFolder,
        subTag: subTag,
    };
}

function createFlatNode(fsPath, rootNode) {
    const id = buildCounter * 1000000 + nodeCounter++;
    const pathLabel = path.dirname(rootNode === undefined ? fsPath : path.relative(rootNode.fsPath, fsPath));

    return {
        type: PATH,
        fsPath: fsPath,
        label: path.basename(fsPath),
        pathLabel: pathLabel === '.' ? '' : '(' + pathLabel + ')',
        nodes: [],
        id: id,
        visible: true,
    };
}

function createTagNode(fsPath, tag) {
    const id = buildCounter * 1000000 + nodeCounter++;

    return {
        isRootTagNode: true,
        type: PATH,
        label: tag,
        fsPath: fsPath,
        nodes: [],
        id: id,
        tag: tag,
        visible: true,
    };
}

function createSubTagNode(subTag) {
    const id = buildCounter * 1000000 + nodeCounter++;

    return {
        isRootTagNode: true,
        type: PATH,
        label: subTag,
        fsPath: subTag,
        nodes: [],
        id: id,
        subTag: subTag,
        visible: true,
        isFolder: true,
    };
}

function createTodoNode(result: any): any {
    const id = buildCounter * 1000000 + nodeCounter++;
    let joined = result.match.substr(result.column - 1);
    if (result.extraLines) {
        result.extraLines.map(function (extraLine) {
            joined += '\n' + extraLine.match;
        });
    }
    const text = utils.removeBlockComments(joined, result.uri.fsPath);
    const extracted = utils.extractTag(text, result.column);
    let label = extracted.withoutTag && extracted.withoutTag.length > 0 ? extracted.withoutTag : 'line ' + result.line;

    if (config.shouldGroupByTag() !== true) {
        if (result.extraLines) {
            label = extracted.tag;
        } else {
            label = extracted.tag + ' ' + label;
        }
    }

    const tagGroup = config.tagGroup(extracted.tag);

    const todo = {
        type: TODO,
        fsPath: result.uri.fsPath,
        uri: result.uri,
        label: label,
        tag: tagGroup ? tagGroup : extracted.tag,
        subTag: extracted.subTag,
        actualTag: extracted.tag,
        line: result.line - 1,
        column: result.column,
        endColumn: result.column + result.match.length,
        after: extracted.after ? extracted.after.trim() : '',
        before: extracted.before ? extracted.before.trim() : '',
        priority: result.scanner && result.scanner.priority ? result.scanner.priority : extractPriority(text),
        severity: result.scanner && result.scanner.severity ? result.scanner.severity : 'normal',
        id: id,
        visible: true,
        extraLines: [],
    };

    if (result.extraLines) {
        const commentsRemoved = text.split('\n');
        commentsRemoved.shift();
        result.extraLines.map(function (extraLine, index) {
            extraLine.match = commentsRemoved[index];
            extraLine.uri = result.uri;
            if (extraLine.match) {
                const extraLineMatch = extraLine.match.trim();
                if (extraLineMatch && extraLineMatch !== todo.tag) {
                    const extraLineNode = createTodoNode(extraLine);
                    extraLineNode.isExtraLine = true;
                    todo.extraLines.push(extraLineNode);
                }
            }
        });
    }

    return todo;
}

function locateWorkspaceNode(filename: string): any {
    let result;
    nodes.map(function (node) {
        const workspacePath = node.fsPath + (node.fsPath.indexOf(path.sep) === node.fsPath.length - 1 ? '' : path.sep);
        if (node.isWorkspaceNode && (filename === node.fsPath || filename.indexOf(workspacePath) === 0)) {
            result = node;
        }
    });
    return result;
}

function locateFlatChildNode(rootNode: any, result: any, tag: any, subTag: any) {
    let parentNodes = rootNode === undefined ? nodes : rootNode.nodes;
    let parentNode;

    if (config.shouldGroupByTag() && tag) {
        const tagPath = tag;
        parentNode = parentNodes.find(findTagNode, tagPath);
        if (parentNode === undefined) {
            parentNode = createPathNode(rootNode ? rootNode.fsPath : JSON.stringify(result), [tagPath], subTag);
            parentNode.tag = tagPath;
            parentNode.isRootTagNode = true;
            parentNodes.push(parentNode);
        }
        parentNodes = parentNode.nodes;
    } else if (config.shouldGroupBySubTag() && subTag) {
        const subTagPath = subTag;
        parentNode = parentNodes.find(findSubTagNode, subTagPath);
        if (parentNode === undefined) {
            parentNode = createPathNode(rootNode ? rootNode.fsPath : JSON.stringify(result), [subTagPath], subTag);
            parentNode.subTag = subTagPath;
            parentNodes.push(parentNode);
        }
        parentNodes = parentNode.nodes;
    }

    const fullPath =
        result.uri.scheme === 'file' ? result.uri.fsPath : path.join(result.uri.authority, result.uri.fsPath);
    const nodePath = subTag ? path.join(fullPath, subTag) : fullPath;
    let childNode = parentNodes.find(findExactPath, nodePath);
    if (childNode === undefined) {
        childNode = createFlatNode(nodePath, rootNode);
        parentNodes.push(childNode);
    }

    return childNode;
}

function locateTreeChildNode(rootNode: any, pathElements: any[], tag: any, subTag: any) {
    let childNode;

    let parentNodes = rootNode.nodes;
    let parentNode;

    if (config.shouldGroupByTag() && tag) {
        parentNode = parentNodes.find(findTagNode, tag);
        if (parentNode === undefined) {
            const tagPathList = [];
            if (subTag) {
                tagPathList.push(subTag);
            }
            tagPathList.push(tag);
            parentNode = createPathNode(rootNode ? rootNode.fsPath : JSON.stringify(rootNode), tagPathList, subTag);
            parentNode.isRootTagNode = true;
            parentNode.tag = tag;
            parentNodes.push(parentNode);
        }
        parentNodes = parentNode.nodes;
    } else if (config.shouldGroupBySubTag() && subTag) {
        parentNode = parentNodes.find(findSubTagNode, subTag);
        if (parentNode === undefined) {
            const subTagPathList: any[] = [];
            subTagPathList.push(subTag);
            parentNode = createPathNode(rootNode ? rootNode.fsPath : JSON.stringify(rootNode), subTagPathList, subTag);
            parentNode.subTag = subTag;
            parentNodes.push(parentNode);
        }
        parentNodes = parentNode.nodes;
    }

    pathElements.map(function (element, level) {
        childNode = parentNodes.find(findPathNode, element);
        if (childNode === undefined) {
            childNode = createPathNode(
                rootNode.fsPath,
                pathElements.slice(0, level + 1),
                level < pathElements.length - 1,
                subTag
            );
            parentNodes.push(childNode);
            parentNodes = childNode.nodes;
        } else {
            parentNodes = childNode.nodes;
        }
    });

    return childNode;
}

function countTags(child: any, tagCounts: Record<string, number>, forStatusBar: boolean, fileFilter?: string) {
    function countTag(node) {
        if (isTodoNode(node)) {
            const tag = node.tag ? node.tag : 'TODO';
            if (isVisible(node) && (!fileFilter || fileFilter === node.fsPath)) {
                let hide = false;

                if (forStatusBar && config.shouldHideFromStatusBar(tag)) {
                    hide = true;
                }

                if (!forStatusBar && config.shouldHideFromActivityBar(tag)) {
                    hide = true;
                }

                if (!hide) {
                    tagCounts[tag] = tagCounts[tag] === undefined ? 1 : tagCounts[tag] + 1;
                }
            }
        }
    }

    countTag(child);

    if (child.nodes !== undefined) {
        countChildTags(child.nodes.filter(isPathNode), tagCounts, forStatusBar, fileFilter);
        child.nodes.filter(isTodoNode).map(function (node) {
            countTag(node);
        });
    }
}

function countChildTags(
    children: any[],
    tagCounts: Record<string, number>,
    forStatusBar: boolean,
    fileFilter?: string
): Record<string, number> {
    children.map(function (child) {
        return countTags(child, tagCounts, forStatusBar, fileFilter);
    });
    return tagCounts;
}

function addWorkspaceFolders() {
    if (workspaceFolders && config.shouldShowTagsOnly() === false) {
        workspaceFolders.map(function (folder) {
            nodes.push(createWorkspaceRootNode(folder));
        });
    }
}

class TreeNodeProvider {
    _context: any;
    _debug: (text: string) => void;
    onTreeRefreshed: (() => void) | undefined;
    _onDidChangeTreeData: any;
    onDidChangeTreeData: any;
    nodesToGet: number;

    constructor(_context: any, debug: (text: string) => void, onTreeRefreshed: (() => void) | undefined) {
        this._context = _context;
        this._debug = debug;
        this.onTreeRefreshed = onTreeRefreshed;

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        this.nodesToGet = 0;

        buildCounter = _context.workspaceState.get('buildCounter', 1);
        expandedNodes = _context.workspaceState.get('expandedNodes', {});
    }

    getChildren(node?: TreeNode): any {
        if (node === undefined) {
            let result = [];

            const availableNodes = nodes.filter(function (node) {
                return node.nodes === undefined || node.nodes.length > 0;
            });
            const rootNodes = availableNodes.filter(isVisible);
            if (rootNodes.length > 0) {
                result = rootNodes;

                this.nodesToGet = result.length;
            }

            const filterStatusNode: any = { label: '', notExported: true, isStatusNode: true };
            const includeGlobs = utils.toGlobArray(this._context.workspaceState.get('includeGlobs'));
            const excludeGlobs = utils.toGlobArray(this._context.workspaceState.get('excludeGlobs'));
            let totalFilters = includeGlobs.length + excludeGlobs.length;
            let tooltip = '';

            if (currentFilter) {
                tooltip += 'Tree Filter: "' + currentFilter + '"\n';
                totalFilters++;
            }

            if (includeGlobs.length + excludeGlobs.length > 0) {
                includeGlobs.map(function (glob) {
                    tooltip += 'Include: ' + glob + '\n';
                });
                excludeGlobs.map(function (glob) {
                    tooltip += 'Exclude: ' + glob + '\n';
                });
            }

            if (totalFilters > 0) {
                filterStatusNode.label = totalFilters + ' filter' + (totalFilters === 1 ? '' : 's') + ' active';
                filterStatusNode.tooltip = tooltip + '\nRight click for filter options';
                filterStatusNode.icon = 'filter';
            }

            if (result.length === 0) {
                if (filterStatusNode.label !== '') {
                    filterStatusNode.label += ', ';
                }
                filterStatusNode.label += 'Nothing found';
                filterStatusNode.icon = 'issues';

                filterStatusNode.empty = availableNodes.length === 0;
            }

            if (filterStatusNode.label !== '') {
                result.unshift(filterStatusNode);
            }

            if (config.shouldShowScanModeInTree()) {
                let scanMode = config.scanMode();
                if (scanMode === 'workspace') {
                    scanMode += ' and open files';
                }
                const scanModeNode = {
                    label: 'Scan mode: ' + scanMode,
                    notExported: true,
                    isStatusNode: true,
                    icon: 'search',
                };
                result.unshift(scanModeNode);
            }

            const compacted = [];
            result.map(function (child) {
                if (child.isRootTagNode === true && child.nodes.length === 1) {
                    compacted.push(child.nodes[0]);
                } else {
                    compacted.push(child);
                }
            });

            return compacted;
        } else if (isPathNode(node)) {
            if (config.shouldCompactFolders() && node.tag === undefined) {
                while (
                    node.nodes &&
                    node.nodes.length === 1 &&
                    node.nodes[0].nodes &&
                    node.nodes[0].nodes.length > 0 &&
                    node.nodes[0].isFolder
                ) {
                    node = node.nodes[0];
                }
            }

            if (node.nodes && node.nodes.length > 0) {
                return node.nodes.filter(isVisible);
            }
        } else if (isTodoNode(node)) {
            if (node.extraLines && node.extraLines.length > 0) {
                return node.extraLines.filter(isVisible);
            } else {
                return node.text;
            }
        }
    }

    getParent(node: TreeNode): TreeNode | undefined {
        return node.parent;
    }

    getTreeItem(node: TreeNode): any {
        let treeItem;
        try {
            treeItem = new vscode.TreeItem(node.label + (node.pathLabel ? ' ' + node.pathLabel : ''));
        } catch (e) {
            console.log('Failed to create tree item: ' + e);
        }

        treeItem.id = node.id;
        treeItem.fsPath = node.fsPath;

        treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;

        if (node.fsPath) {
            treeItem.node = node;
            if (config.showBadges() && !node.tag && !node.subTag) {
                treeItem.resourceUri = vscode.Uri.file(node.fsPath);
            }

            if (isTodoNode(treeItem.node)) {
                treeItem.tooltip = config.tooltipFormat();
                treeItem.tooltip = utils.formatLabel(config.tooltipFormat(), node);
            } else {
                treeItem.tooltip = treeItem.fsPath;
            }

            if (isPathNode(node)) {
                if (config.shouldCompactFolders() && node.tag === undefined) {
                    let onlyChild = node.nodes.filter(isPathNode).length === 1 ? node.nodes[0] : undefined;
                    let onlyChildParent = node;
                    while (
                        onlyChild &&
                        onlyChild.nodes.filter(isPathNode).length > 0 &&
                        onlyChildParent.nodes.filter(isPathNode).length === 1
                    ) {
                        treeItem.label += '/' + onlyChild.label;
                        onlyChildParent = onlyChild;
                        onlyChild = onlyChild.nodes[0];
                    }
                }

                if (expandedNodes[node.fsPath] !== undefined) {
                    treeItem.collapsibleState =
                        expandedNodes[node.fsPath] === true
                            ? vscode.TreeItemCollapsibleState.Expanded
                            : vscode.TreeItemCollapsibleState.Collapsed;
                } else {
                    treeItem.collapsibleState = config.shouldExpand()
                        ? vscode.TreeItemCollapsibleState.Expanded
                        : vscode.TreeItemCollapsibleState.Collapsed;
                }

                if (treeItem.collapsibleState === vscode.TreeItemCollapsibleState.Expanded) {
                    this.nodesToGet += node.nodes.filter(isVisible).length;
                }

                if (node.tag) {
                    treeItem.iconPath = icons.getIcon(this._context, node.tag ? node.tag : node.label, this._debug);
                } else if (node.isWorkspaceNode) {
                    treeItem.iconPath = new vscode.ThemeIcon('window');
                } else if (node.isFolder) {
                    treeItem.iconPath = vscode.ThemeIcon.Folder;
                } else {
                    treeItem.iconPath = vscode.ThemeIcon.File;
                }

                if (node.subTag !== undefined) {
                    let url = config.subTagClickUrl();

                    if (url.trim() !== '') {
                        url = utils.formatLabel(url, node);
                        treeItem.command = {
                            command: 'todo-tree.openUrl',
                            arguments: [url],
                        };
                        treeItem.tooltip = 'Click to open ' + url;
                    }
                }
            } else if (isTodoNode(node)) {
                if (node.extraLines && node.extraLines.length > 0) {
                    treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                }

                if (
                    config.shouldHideIconsWhenGroupedByTag() !== true ||
                    (config.shouldGroupByTag() !== true && config.shouldGroupBySubTag() !== true)
                ) {
                    if (node.isExtraLine !== true) {
                        treeItem.iconPath = icons.getIcon(this._context, node.tag ? node.tag : node.label, this._debug);
                    } else {
                        treeItem.iconPath = 'no-icon';
                    }
                }

                const format = config.labelFormat();
                if (format !== '' && (node.extraLines === undefined || node.extraLines.length === 0)) {
                    treeItem.label = utils.formatLabel(format, node) + (node.pathLabel ? ' ' + node.pathLabel : '');
                }

                const revealBehaviour = vscode.workspace.getConfiguration('todo-tree.general').get('revealBehaviour');

                let todoSelection;
                if (revealBehaviour === 'end of todo') {
                    const todoEnd = new vscode.Position(node.line, node.endColumn - 1);
                    todoSelection = new vscode.Selection(todoEnd, todoEnd);
                } else if (revealBehaviour === 'start of line') {
                    const lineStart = new vscode.Position(node.line, 0);
                    todoSelection = new vscode.Selection(lineStart, lineStart);
                } else if (revealBehaviour === 'start of todo') {
                    const todoStart = new vscode.Position(node.line, node.column - 1);
                    todoSelection = new vscode.Selection(todoStart, todoStart);
                }

                treeItem.command = {
                    command: 'todo-tree.revealInFile',
                    arguments: [node.uri ? node.uri : vscode.Uri.file(node.fsPath), { selection: todoSelection }],
                };
            }
        } else {
            treeItem.description = node.label;
            treeItem.label = '';
            treeItem.tooltip = node.tooltip;
            treeItem.iconPath = new vscode.ThemeIcon(node.icon);
        }

        if (config.shouldShowCounts() && isPathNode(node)) {
            const tagCounts: Record<string, number> = {};
            countTags(node, tagCounts, false);
            const total = Object.values(tagCounts).reduce(function (a: number, b: number) {
                return a + b;
            }, 0);
            treeItem.description = total.toString();
        }

        if (node.isFolder === true) {
            treeItem.contextValue = 'folder';
        } else if (
            !node.isRootTagNode &&
            !node.isWorkspaceNode &&
            !node.isStatusNode &&
            node.type !== TODO &&
            node.subTag === undefined
        ) {
            treeItem.contextValue = 'file';
        }

        if (node.subTag !== undefined) {
            treeHasSubTags = true;
        }

        if (!node.isStatusNode) {
            this.nodesToGet--;
        }

        if (this.nodesToGet === 0 && this.onTreeRefreshed) {
            this.onTreeRefreshed();
        }

        return treeItem;
    }

    clear(folders: any): void {
        nodes = [];
        tagNodeMap.clear();
        todoNodeSet.clear();

        workspaceFolders = folders;

        addWorkspaceFolders();
    }

    rebuild() {
        buildCounter = (buildCounter + 1) % 100;
    }

    refresh() {
        treeHasSubTags = false;

        this.sort();

        this._onDidChangeTreeData.fire();
    }

    filter(text: string | undefined, children?: TreeNode[]): void {
        const matcher = filterQuery.createMatcher(text, config.showFilterCaseSensitive());

        if (children === undefined) {
            currentFilter = text;
            children = nodes;
        }
        children.forEach((child) => {
            if (child.type === TODO) {
                const match = matcher(child);
                child.visible = !text || match;
            }

            if (child.nodes !== undefined) {
                this.filter(text, child.nodes);
            }
            if (child.extraLines !== undefined) {
                this.filter(text, child.extraLines);
            }
            if ((child.nodes && child.nodes.length > 0) || (child.extraLines && child.extraLines.length > 0)) {
                const visibleNodes = child.nodes ? child.nodes.filter(isVisible).length : 0;
                const visibleExtraLines = child.extraLines ? child.extraLines.filter(isVisible).length : 0;
                child.visible = visibleNodes + visibleExtraLines > 0;
            }
        });
    }

    clearTreeFilter(children?: TreeNode[]): void {
        currentFilter = undefined;

        if (children === undefined) {
            children = nodes;
        }
        children.forEach(function (child) {
            child.visible = true;
            if (child.nodes !== undefined) {
                this.clearTreeFilter(child.nodes);
            }
            if (child.extraLines !== undefined) {
                this.clearTreeFilter(child.extraLines);
            }
        }, this);
    }

    add(result: ScanResult): void {
        if (nodes.length === 0) {
            addWorkspaceFolders();
        }

        const fullPath =
            result.uri.scheme === 'file' ? result.uri.fsPath : path.join(result.uri.authority, result.uri.fsPath);

        const rootNode = locateWorkspaceNode(fullPath);
        const todoNode = createTodoNode(result);

        if (config.shouldHideFromTree(todoNode.tag ? todoNode.tag : todoNode.label)) {
            todoNode.hidden = true;
        }
        let childNode;

        const tagPath = todoNode.subTag ? todoNode.tag + ' (' + todoNode.subTag + ')' : todoNode.tag;
        const caseSensitive = config.isRegexCaseSensitive();

        if (config.shouldShowTagsOnly()) {
            if (config.shouldGroupByTag()) {
                if (todoNode.tag) {
                    childNode = tagNodeMap.get(tagKey(tagPath, caseSensitive));
                    if (childNode === undefined) {
                        childNode = createTagNode(todoNode.fsPath, tagPath);
                        nodes.push(childNode);
                        tagNodeMap.set(tagKey(tagPath, caseSensitive), childNode);
                    }
                } else if (!todoNodeSet.has(todoKey(todoNode))) {
                    nodes.push(todoNode);
                    todoNodeSet.add(todoKey(todoNode));
                }
            } else if (config.shouldGroupBySubTag()) {
                if (todoNode.subTag) {
                    childNode = tagNodeMap.get(tagKey(todoNode.subTag, caseSensitive));
                    if (childNode === undefined) {
                        childNode = createSubTagNode(todoNode.subTag);
                        nodes.unshift(childNode);
                        tagNodeMap.set(tagKey(todoNode.subTag, caseSensitive), childNode);
                    }
                } else if (!todoNodeSet.has(todoKey(todoNode))) {
                    nodes.push(todoNode);
                    todoNodeSet.add(todoKey(todoNode));
                }
            } else {
                if (!todoNodeSet.has(todoKey(todoNode))) {
                    nodes.push(todoNode);
                    todoNodeSet.add(todoKey(todoNode));
                }
            }
        } else if (config.shouldFlatten() || rootNode === undefined) {
            childNode = locateFlatChildNode(rootNode, result, todoNode.tag, todoNode.subTag);
        } else if (rootNode) {
            const relativePath = path.relative(rootNode.fsPath, fullPath);
            let pathElements = [];
            if (relativePath !== '') {
                pathElements = relativePath.split(path.sep);
            }
            if (todoNode.subTag) {
                if (config.shouldGroupBySubTag() !== true) {
                    pathElements.push(todoNode.subTag);
                }
            }
            childNode = locateTreeChildNode(rootNode, pathElements, todoNode.tag, todoNode.subTag);
        }

        if (childNode) {
            // needed?
            if (childNode.nodes === undefined) {
                childNode.nodes = [];
            }

            childNode.expanded = result.expanded;

            if (childNode.nodes.find(findTodoNode, todoNode) === undefined) {
                todoNode.parent = childNode;
                childNode.nodes.push(todoNode);
                childNode.showCount = true;
            }
        }
    }

    reset(uri: any, children?: TreeNode[]): void {
        const fullPath = uri.scheme === 'file' ? uri.fsPath : path.join(uri.authority, uri.fsPath);

        const root = children === undefined;
        if (children === undefined) {
            children = nodes;
        }
        children = children.filter(function (child) {
            let keep = true;
            if (child.nodes !== undefined) {
                this.reset(uri, child.nodes);
            }
            if (child.type === TODO && !child.tag && child.fsPath === fullPath) // no tag (e.g. markdown)
            {
                keep = false;
            } else if (
                child.type === TODO &&
                child.parent === undefined &&
                child.fsPath === fullPath
            ) // top level todo node
            {
                keep = false;
            } else if (child.fsPath === fullPath || child.isRootTagNode) {
                if (config.shouldShowTagsOnly()) {
                    if (child.nodes) {
                        child.nodes = child.nodes.filter(function (node) {
                            return isTodoNode(node) && node.fsPath !== fullPath;
                        });
                    }
                } else {
                    child.nodes = [];
                }
            }
            return keep;
        }, this);

        if (root) {
            nodes = children;
            rebuildIndices();
        }
    }

    remove(callback: ((fsPath: string) => void) | null, uri: any, children?: TreeNode[]): TreeNode[] {
        const fullPath = uri.scheme === 'file' ? uri.fsPath : path.join(uri.authority, uri.fsPath);

        function removeNodesByFilename(children, me) {
            return children.filter(function (child) {
                if (child.nodes !== undefined) {
                    child.nodes = me.remove(callback, uri, child.nodes);
                }
                const shouldRemove = child.fsPath === fullPath;
                if (shouldRemove) {
                    delete expandedNodes[child.fsPath];
                    me._context.workspaceState.update('expandedNodes', expandedNodes);
                    if (callback) {
                        callback(child.fsPath);
                    }
                }
                return shouldRemove === false;
            }, me);
        }

        function removeEmptyNodes(children, me) {
            return children.filter(function (child) {
                if (child.nodes !== undefined) {
                    child.nodes = me.remove(callback, uri, child.nodes);
                }
                const shouldRemove = child.nodes && child.nodes.length === 0 && child.isWorkspaceNode !== true;
                if (shouldRemove) {
                    delete expandedNodes[child.fsPath];
                    me._context.workspaceState.update('expandedNodes', expandedNodes);
                    if (callback) {
                        callback(child.fsPath);
                    }
                }
                return shouldRemove !== true;
            }, me);
        }

        const root = children === undefined;
        if (children === undefined) {
            children = nodes;
        }

        children = removeNodesByFilename(children, this);
        children = removeEmptyNodes(children, this);

        if (root) {
            nodes = children;
            rebuildIndices();
        }

        return children;
    }

    getElement(filename: string, found: (node: TreeNode) => void, children?: TreeNode[]): void {
        if (children === undefined) {
            children = nodes;
        }
        children.forEach(function (child) {
            if (child.fsPath === filename) {
                found(child);
            } else if (child.nodes !== undefined) {
                return this.getElement(filename, found, child.nodes);
            }
        }, this);
    }

    setExpanded(path: string, expanded: boolean): void {
        expandedNodes[path] = expanded;
        this._context.workspaceState.update('expandedNodes', expandedNodes);
    }

    clearExpansionState() {
        expandedNodes = {};
        this._context.workspaceState.update('expandedNodes', expandedNodes);
    }

    getTagCountsForStatusBar(fileFilter?: string): Record<string, number> {
        const tagCounts = {};
        return countChildTags(nodes, tagCounts, true, fileFilter);
    }

    getTagCountsForActivityBar() {
        const tagCounts = {};
        return countChildTags(nodes, tagCounts, false);
    }

    exportChildren(parent: any, children: any[]): any {
        children.forEach(function (child) {
            if (child.type === PATH) {
                parent[child.label] = {};
                this.exportChildren(parent[child.label], this.getChildren(child));
            } else if (!child.notExported) {
                const format = config.labelFormat();
                let itemLabel = 'line ' + (child.line + 1);
                if (config.shouldShowTagsOnly() === true) {
                    itemLabel = child.fsPath + ' ' + itemLabel;
                }
                parent[itemLabel] =
                    format !== ''
                        ? utils.formatLabel(format, child) + (child.pathLabel ? ' ' + child.pathLabel : '')
                        : child.label;
            }
        }, this);
        return parent;
    }

    exportTree() {
        let exported = {};
        const children = this.getChildren();
        exported = this.exportChildren(exported, children);
        return exported;
    }

    getFirstNode() {
        const availableNodes = nodes.filter(function (node) {
            return node.nodes === undefined || node.nodes.length > 0;
        });
        const rootNodes = availableNodes.filter(isVisible);
        if (rootNodes.length > 0) {
            return rootNodes[0];
        }
        return undefined;
    }

    hasSubTags() {
        return treeHasSubTags;
    }

    sort(children?: TreeNode[]): void {
        if (config.shouldSortTree()) {
            if (children === undefined) {
                children = nodes;
            }
            children.forEach(function (child) {
                if (child.nodes !== undefined) {
                    this.sort(child.nodes);
                }
            }, this);

            if (config.shouldShowTagsOnly()) {
                if (config.shouldSortTagsOnlyViewAlphabetically()) {
                    children.sort(sortTagsOnlyViewByLabel);
                } else {
                    children.sort(sortTagsOnlyViewByTagOrder);
                }
            } else {
                children.sort(sortByFilenameAndLine);
            }
        }
    }
}

function extractPriority(text) {
    const upper = String(text || '').toUpperCase();
    const match = upper.match(/\bP[0-3]\b/);
    if (match) {
        return match[0];
    }
    if (upper.indexOf('TODO!') !== -1) {
        return 'P0';
    }
    if (upper.indexOf('TODO?') !== -1) {
        return 'P2';
    }
    return 'none';
}

exports.TreeNodeProvider = TreeNodeProvider;
exports.locateWorkspaceNode = locateWorkspaceNode;
