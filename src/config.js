var vscode = require('vscode');
var fs = require('fs');
var path = require('path');
var attributes = require('./attributes.js');

var context;

var tagGroupLookup = {};

var configCache = {};

function getConfig(section) {
    if (!configCache[section]) {
        configCache[section] = vscode.workspace.getConfiguration(section);
    }
    return configCache[section];
}

function clearCache() {
    configCache = {};
}

function init(c) {
    context = c;

    refreshTagGroupLookup();
}

function shouldGroupByTag() {
    return context.workspaceState.get('groupedByTag', getConfig('todo-tree.tree').get('groupedByTag', false));
}

function shouldGroupBySubTag() {
    return context.workspaceState.get('groupedBySubTag', getConfig('todo-tree.tree').get('groupedBySubTag', false));
}

function shouldExpand() {
    return context.workspaceState.get('expanded', getConfig('todo-tree.tree').get('expanded', false));
}

function shouldFlatten() {
    return context.workspaceState.get('flat', getConfig('todo-tree.tree').get('flat', false));
}

function shouldShowTagsOnly() {
    return context.workspaceState.get('tagsOnly', getConfig('todo-tree.tree').get('tagsOnly', false));
}

function shouldShowCounts() {
    return getConfig('todo-tree.tree').get('showCountsInTree', false);
}

function shouldHideIconsWhenGroupedByTag() {
    return getConfig('todo-tree.tree').get('hideIconsWhenGroupedByTag', false);
}

function showFilterCaseSensitive() {
    return getConfig('todo-tree.tree').get('filterCaseSensitive', false);
}

function isRegexCaseSensitive() {
    return getConfig('todo-tree.regex').get('regexCaseSensitive', true);
}

function showBadges() {
    return getConfig('todo-tree.tree').get('showBadges', false);
}

function regex() {
    return {
        tags: tags(),
        regex: getConfig('todo-tree.regex').get('regex'),
        caseSensitive: getConfig('todo-tree.regex').get('regexCaseSensitive'),
        multiLine: getConfig('todo-tree.regex').get('enableMultiLine'),
    };
}

function subTagRegex() {
    return getConfig('todo-tree.regex').get('subTagRegex');
}

function ripgrepPath() {
    function exeName() {
        var isWin = /^win/.test(process.platform);
        return isWin ? 'rg.exe' : 'rg';
    }

    function exePathIsDefined(rgExePath) {
        return fs.existsSync(rgExePath) ? rgExePath : undefined;
    }

    var rgPath = '';

    rgPath = exePathIsDefined(getConfig('todo-tree.ripgrep').ripgrep);
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(path.join(vscode.env.appRoot, 'node_modules/vscode-ripgrep/bin/', exeName()));
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(
        path.join(vscode.env.appRoot, 'node_modules.asar.unpacked/vscode-ripgrep/bin/', exeName())
    );
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(path.join(vscode.env.appRoot, 'node_modules/@vscode/ripgrep/bin/', exeName()));
    if (rgPath) return rgPath;

    rgPath = exePathIsDefined(
        path.join(vscode.env.appRoot, 'node_modules.asar.unpacked/@vscode/ripgrep/bin/', exeName())
    );
    if (rgPath) return rgPath;

    return rgPath;
}

function tags() {
    var tags = getConfig('todo-tree.general').tags;
    return tags.length > 0 ? tags : ['TODO'];
}

function shouldSortTagsOnlyViewAlphabetically() {
    return getConfig('todo-tree.tree').sortTagsOnlyViewAlphabetically;
}

function labelFormat() {
    return getConfig('todo-tree.tree').labelFormat;
}

function tooltipFormat() {
    return getConfig('todo-tree.tree').tooltipFormat;
}

function clickingStatusBarShouldRevealTree() {
    return getConfig('todo-tree.general').statusBarClickBehaviour === 'reveal';
}

function clickingStatusBarShouldToggleHighlights() {
    return getConfig('todo-tree.general').statusBarClickBehaviour === 'toggle highlights';
}

function isValidScheme(uri) {
    var schemes = getConfig('todo-tree.general').schemes;
    return uri && uri.scheme && schemes && schemes.length && schemes.indexOf(uri.scheme) !== -1;
}

function shouldUseBuiltInFileExcludes() {
    var useBuiltInExcludes = getConfig('todo-tree.filtering').useBuiltInExcludes;
    return useBuiltInExcludes === 'file exclude' || useBuiltInExcludes === 'file and search excludes';
}

function shouldUseBuiltInSearchExcludes() {
    var useBuiltInExcludes = getConfig('todo-tree.filtering').useBuiltInExcludes;
    return useBuiltInExcludes === 'search excludes' || useBuiltInExcludes === 'file and search excludes';
}

function shouldIgnoreGitSubmodules() {
    return getConfig('todo-tree.filtering').ignoreGitSubmodules;
}

function refreshTagGroupLookup() {
    var tagGroups = getConfig('todo-tree.general').tagGroups;
    tagGroupLookup = Object.keys(tagGroups).reduce(
        (acc, propName) =>
            tagGroups[propName].reduce((a, num) => {
                a[num] = propName;
                return a;
            }, acc),
        {}
    );
}

function tagGroup(tag) {
    return tagGroupLookup[tag];
}

function shouldCompactFolders() {
    return getConfig('explorer').compactFolders && getConfig('todo-tree.tree').disableCompactFolders !== true;
}

function shouldHideFromTree(tag) {
    return attributes.getAttribute(tag, 'hideFromTree', false);
}

function shouldHideFromStatusBar(tag) {
    return attributes.getAttribute(tag, 'hideFromStatusBar', false);
}

function shouldHideFromActivityBar(tag) {
    return attributes.getAttribute(tag, 'hideFromActivityBar', false);
}

function shouldSortTree() {
    return getConfig('todo-tree.tree').sort;
}

function scanMode() {
    return getConfig('todo-tree.tree').scanMode;
}

function shouldShowScanModeInTree() {
    return getConfig('todo-tree.tree').showCurrentScanMode;
}

function shouldUseColourScheme() {
    return getConfig('todo-tree.highlights').useColourScheme;
}

function foregroundColourScheme() {
    return getConfig('todo-tree.highlights').foregroundColourScheme;
}

function backgroundColourScheme() {
    return getConfig('todo-tree.highlights').backgroundColourScheme;
}

function defaultHighlight() {
    return getConfig('todo-tree.highlights').defaultHighlight;
}

function customHighlight() {
    return getConfig('todo-tree.highlights').customHighlight;
}

function subTagClickUrl() {
    return getConfig('todo-tree.tree').subTagClickUrl;
}

function shouldShowIconsInsteadOfTagsInStatusBar() {
    return getConfig('todo-tree.general').showIconsInsteadOfTagsInStatusBar;
}

function shouldShowActivityBarBadge() {
    return getConfig('todo-tree.general').showActivityBarBadge;
}

module.exports.init = init;
module.exports.clearCache = clearCache;
module.exports.shouldGroupByTag = shouldGroupByTag;
module.exports.shouldGroupBySubTag = shouldGroupBySubTag;
module.exports.shouldExpand = shouldExpand;
module.exports.shouldFlatten = shouldFlatten;
module.exports.shouldShowTagsOnly = shouldShowTagsOnly;
module.exports.shouldShowCounts = shouldShowCounts;
module.exports.shouldHideIconsWhenGroupedByTag = shouldHideIconsWhenGroupedByTag;
module.exports.showFilterCaseSensitive = showFilterCaseSensitive;
module.exports.isRegexCaseSensitive = isRegexCaseSensitive;
module.exports.showBadges = showBadges;
module.exports.regex = regex;
module.exports.subTagRegex = subTagRegex;
module.exports.ripgrepPath = ripgrepPath;
module.exports.tags = tags;
module.exports.shouldSortTagsOnlyViewAlphabetically = shouldSortTagsOnlyViewAlphabetically;
module.exports.labelFormat = labelFormat;
module.exports.tooltipFormat = tooltipFormat;
module.exports.clickingStatusBarShouldRevealTree = clickingStatusBarShouldRevealTree;
module.exports.clickingStatusBarShouldToggleHighlights = clickingStatusBarShouldToggleHighlights;
module.exports.isValidScheme = isValidScheme;
module.exports.shouldIgnoreGitSubmodules = shouldIgnoreGitSubmodules;
module.exports.refreshTagGroupLookup = refreshTagGroupLookup;
module.exports.tagGroup = tagGroup;
module.exports.shouldCompactFolders = shouldCompactFolders;
module.exports.shouldUseBuiltInFileExcludes = shouldUseBuiltInFileExcludes;
module.exports.shouldUseBuiltInSearchExcludes = shouldUseBuiltInSearchExcludes;
module.exports.shouldHideFromTree = shouldHideFromTree;
module.exports.shouldHideFromStatusBar = shouldHideFromStatusBar;
module.exports.shouldHideFromActivityBar = shouldHideFromActivityBar;
module.exports.shouldSortTree = shouldSortTree;
module.exports.scanMode = scanMode;
module.exports.shouldShowScanModeInTree = shouldShowScanModeInTree;
module.exports.shouldUseColourScheme = shouldUseColourScheme;
module.exports.foregroundColourScheme = foregroundColourScheme;
module.exports.backgroundColourScheme = backgroundColourScheme;
module.exports.defaultHighlight = defaultHighlight;
module.exports.customHighlight = customHighlight;
module.exports.subTagClickUrl = subTagClickUrl;
module.exports.shouldShowIconsInsteadOfTagsInStatusBar = shouldShowIconsInsteadOfTagsInStatusBar;
module.exports.shouldShowActivityBarBadge = shouldShowActivityBarBadge;
