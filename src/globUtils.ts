import * as vscode from 'vscode';

export function addGlobs(source: Record<string, boolean>, target: string[], exclude: boolean): string[] {
    Object.keys(source).map(function (glob) {
        if (source.hasOwnProperty(glob) && source[glob] === true) {
            target = target.concat((exclude === true ? '!' : '') + glob);
        }
    });

    return target;
}

export function buildGlobsForRipgrep(
    includeGlobs: string[],
    excludeGlobs: string[],
    tempIncludeGlobs: string[],
    tempExcludeGlobs: string[],
    submoduleExcludeGlobs: string[],
    useBuiltInFileExcludes: boolean,
    useBuiltInSearchExcludes: boolean,
    ignoreGitSubmodules: boolean
): string[] {
    let globs: string[] = []
        .concat(includeGlobs)
        .concat(tempIncludeGlobs)
        .concat(excludeGlobs.map((g) => `!${g}`))
        .concat(tempExcludeGlobs.map((g) => `!${g}`));

    if (useBuiltInFileExcludes) {
        globs = addGlobs(vscode.workspace.getConfiguration('files.exclude'), globs, true);
    }

    if (useBuiltInSearchExcludes) {
        globs = addGlobs(vscode.workspace.getConfiguration('search.exclude'), globs, true);
    }

    if (ignoreGitSubmodules) {
        globs = globs.concat(submoduleExcludeGlobs.map((g) => `!${g}`));
    }

    return globs;
}
