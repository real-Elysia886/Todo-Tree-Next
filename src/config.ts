import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as attributes from './attributes';

let context: vscode.ExtensionContext;
let tagGroupLookup: Record<string, string> = {};
let configCache: Record<string, vscode.WorkspaceConfiguration> = {};

function getConfig(section: string): vscode.WorkspaceConfiguration {
    if (!configCache[section]) {
        configCache[section] = vscode.workspace.getConfiguration(section);
    }
    return configCache[section];
}

export function clearCache(): void {
    configCache = {};
}

export function init(c: vscode.ExtensionContext): void {
    context = c;
    refreshTagGroupLookup();
}

export function shouldGroupByTag(): boolean {
    return context.workspaceState.get('groupedByTag', getConfig('todo-tree.tree').get('groupedByTag', false));
}

export function shouldGroupBySubTag(): boolean {
    return context.workspaceState.get('groupedBySubTag', getConfig('todo-tree.tree').get('groupedBySubTag', false));
}

export function shouldExpand(): boolean {
    return context.workspaceState.get('expanded', getConfig('todo-tree.tree').get('expanded', false));
}

export function shouldFlatten(): boolean {
    return context.workspaceState.get('flat', getConfig('todo-tree.tree').get('flat', false));
}

export function shouldShowTagsOnly(): boolean {
    return context.workspaceState.get('tagsOnly', getConfig('todo-tree.tree').get('tagsOnly', false));
}

export function shouldShowCounts(): boolean {
    return getConfig('todo-tree.tree').get('showCountsInTree', false);
}

export function shouldHideIconsWhenGroupedByTag(): boolean {
    return getConfig('todo-tree.tree').get('hideIconsWhenGroupedByTag', false);
}

export function showFilterCaseSensitive(): boolean {
    return getConfig('todo-tree.tree').get('filterCaseSensitive', false);
}

export function isRegexCaseSensitive(): boolean {
    return getConfig('todo-tree.regex').get('regexCaseSensitive', true);
}

export function showBadges(): boolean {
    return getConfig('todo-tree.tree').get('showBadges', false);
}

export function regex(): { tags: string[]; regex: string; caseSensitive: boolean; multiLine: boolean } {
    return {
        tags: tags(),
        regex: getConfig('todo-tree.regex').get<string>('regex', ''),
        caseSensitive: getConfig('todo-tree.regex').get<boolean>('regexCaseSensitive', true),
        multiLine: getConfig('todo-tree.regex').get<boolean>('enableMultiLine', false),
    };
}

export function subTagRegex(): string | undefined {
    return getConfig('todo-tree.regex').get<string>('subTagRegex');
}

export function ripgrepPath(): string {
    function exeName() {
        const isWin = /^win/.test(process.platform);
        return isWin ? 'rg.exe' : 'rg';
    }

    function exePathIsDefined(rgExePath: string | undefined): string | undefined {
        return rgExePath && fs.existsSync(rgExePath) ? rgExePath : undefined;
    }

    let rgPath = '';

    rgPath = exePathIsDefined(getConfig('todo-tree.ripgrep').get<string>('ripgrep')) || '';
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(path.join(vscode.env.appRoot, 'node_modules/vscode-ripgrep/bin/', exeName())) || '';
    if (rgPath) return rgPath;

    rgPath =
        exePathIsDefined(path.join(vscode.env.appRoot, 'node_modules.asar.unpacked/vscode-ripgrep/bin/', exeName())) ||
        '';
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(path.join(vscode.env.appRoot, 'node_modules/@vscode/ripgrep/bin/', exeName())) || '';
    if (rgPath) return rgPath;

    rgPath =
        exePathIsDefined(path.join(vscode.env.appRoot, 'node_modules.asar.unpacked/@vscode/ripgrep/bin/', exeName())) ||
        '';
    if (rgPath) return rgPath;

    return rgPath;
}

export function tags(): string[] {
    const tags = getConfig('todo-tree.general').get<string[]>('tags', []);
    return tags.length > 0 ? tags : ['TODO'];
}

export function shouldSortTagsOnlyViewAlphabetically(): boolean {
    return getConfig('todo-tree.tree').get<boolean>('sortTagsOnlyViewAlphabetically', false);
}

export function labelFormat(): string {
    return getConfig('todo-tree.tree').get<string>('labelFormat', '');
}

export function tooltipFormat(): string {
    return getConfig('todo-tree.tree').get<string>('tooltipFormat', '');
}

export function clickingStatusBarShouldRevealTree(): boolean {
    return getConfig('todo-tree.general').get<string>('statusBarClickBehaviour') === 'reveal';
}

export function clickingStatusBarShouldToggleHighlights(): boolean {
    return getConfig('todo-tree.general').get<string>('statusBarClickBehaviour') === 'toggle highlights';
}

export function isValidScheme(uri: vscode.Uri): boolean {
    const schemes = getConfig('todo-tree.general').get<string[]>('schemes', []);
    return !!(uri && uri.scheme && schemes && schemes.length && schemes.indexOf(uri.scheme) !== -1);
}

export function shouldUseBuiltInFileExcludes(): boolean {
    const useBuiltInExcludes = getConfig('todo-tree.filtering').get<string>('useBuiltInExcludes');
    return useBuiltInExcludes === 'file exclude' || useBuiltInExcludes === 'file and search excludes';
}

export function shouldUseBuiltInSearchExcludes(): boolean {
    const useBuiltInExcludes = getConfig('todo-tree.filtering').get<string>('useBuiltInExcludes');
    return useBuiltInExcludes === 'search excludes' || useBuiltInExcludes === 'file and search excludes';
}

export function shouldIgnoreGitSubmodules(): boolean {
    return getConfig('todo-tree.filtering').get<boolean>('ignoreGitSubmodules', false);
}

export function refreshTagGroupLookup(): void {
    const tagGroups = getConfig('todo-tree.general').get<Record<string, string[]>>('tagGroups', {});
    tagGroupLookup = Object.keys(tagGroups).reduce<Record<string, string>>(
        (acc, propName) =>
            tagGroups[propName].reduce<Record<string, string>>((a, num) => {
                a[num] = propName;
                return a;
            }, acc),
        {}
    );
}

export function tagGroup(tag: string): string | undefined {
    return tagGroupLookup[tag];
}

export function shouldCompactFolders(): boolean {
    return !!(
        getConfig('explorer').get<boolean>('compactFolders') &&
        getConfig('todo-tree.tree').get<boolean>('disableCompactFolders') !== true
    );
}

export function shouldHideFromTree(tag: string): boolean {
    return attributes.getAttribute(tag, 'hideFromTree', false);
}

export function shouldHideFromStatusBar(tag: string): boolean {
    return attributes.getAttribute(tag, 'hideFromStatusBar', false);
}

export function shouldHideFromActivityBar(tag: string): boolean {
    return attributes.getAttribute(tag, 'hideFromActivityBar', false);
}

export function shouldSortTree(): boolean {
    return getConfig('todo-tree.tree').get<boolean>('sort', true);
}

export function scanMode(): string {
    return getConfig('todo-tree.tree').get<string>('scanMode', 'workspace');
}

export function shouldShowScanModeInTree(): boolean {
    return getConfig('todo-tree.tree').get<boolean>('showCurrentScanMode', false);
}

export function shouldUseColourScheme(): boolean {
    return getConfig('todo-tree.highlights').get<boolean>('useColourScheme', false);
}

export function foregroundColourScheme(): string[] {
    return getConfig('todo-tree.highlights').get<string[]>('foregroundColourScheme', []);
}

export function backgroundColourScheme(): string[] {
    return getConfig('todo-tree.highlights').get<string[]>('backgroundColourScheme', []);
}

export function defaultHighlight(): any {
    return getConfig('todo-tree.highlights').get<any>('defaultHighlight', {});
}

export function customHighlight(): any {
    return getConfig('todo-tree.highlights').get<any>('customHighlight', {});
}

export function subTagClickUrl(): string {
    return getConfig('todo-tree.tree').get<string>('subTagClickUrl', '');
}

export function shouldShowIconsInsteadOfTagsInStatusBar(): boolean {
    return getConfig('todo-tree.general').get<boolean>('showIconsInsteadOfTagsInStatusBar', false);
}

export function shouldShowActivityBarBadge(): boolean {
    return getConfig('todo-tree.general').get<boolean>('showActivityBarBadge', false);
}
