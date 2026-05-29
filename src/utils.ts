import * as micromatch from 'micromatch';
import * as os from 'os';
import * as path from 'path';
const find = require('find') as any;
const strftime = require('fast-strftime') as any;
const commentPatterns = require('comment-patterns') as any;

import colourNames = require('./colourNames');
import themeColourNames = require('./themeColourNames');

let config: any;

const envRegex = new RegExp('\\$\\{(.*?)\\}', 'g');
const rgbRegex = new RegExp('^rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*(\\d+(?:\\.\\d+)?))?\\)$', 'gi');
const placeholderRegex = new RegExp('(\\$\\{.*\\})');

export function init(configuration: any): void {
    config = configuration;
}

export function isHexColour(colour: any): boolean {
    if (typeof colour !== 'string') {
        return false;
    }
    const withoutHash = colour.indexOf('#') === 0 ? colour.substring(1) : colour;
    const hex = withoutHash.split(/ /)[0].replace(/[^\da-fA-F]/g, '');
    return (
        typeof colour === 'string' &&
        hex.length === withoutHash.length &&
        (hex.length === 3 || hex.length === 4 || hex.length === 6 || hex.length === 8) &&
        !isNaN(parseInt(hex, 16))
    );
}

export function isRgbColour(colour: any): boolean {
    return colour && colour.match && colour.match(rgbRegex) !== null;
}

export function isNamedColour(colour: string): boolean {
    return colourNames.indexOf(colour.toLowerCase()) > -1;
}

export function isThemeColour(colour: string): boolean {
    return themeColourNames.indexOf(colour) > -1;
}

export function hexToRgba(hex: string | undefined, opacity: number): string {
    function toComponent(digits: string) {
        return digits.length === 1 ? parseInt(digits + digits, 16) : parseInt(digits, 16);
    }

    if (hex !== undefined) {
        hex = hex.replace('#', '');

        const rgb = hex.substring(0, hex.length === 3 || hex.length === 4 ? 3 : 6);

        const r = toComponent(rgb.substring(0, rgb.length / 3));
        const g = toComponent(rgb.substring(rgb.length / 3, (2 * rgb.length) / 3));
        const b = toComponent(rgb.substring((2 * rgb.length) / 3, (3 * rgb.length) / 3));

        if (hex.length === 4 || hex.length === 8) {
            opacity = parseInt(
                String((toComponent(hex.substring((3 * hex.length) / 4, (4 * hex.length) / 4)) * 100) / 255)
            );
        }

        return 'rgba(' + r + ',' + g + ',' + b + ',' + opacity / 100 + ')';
    }

    return '#0F0';
}

export function removeBlockComments(text: string, fileName: string): string {
    const extension = path.extname(fileName);

    if (extension === '.jsonc') {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + '.js';
    } else if (extension === '.vue') {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + '.html';
    } else if (extension === '.hs') {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, extension)) + '.cpp';
    }

    let commentPattern: any;
    try {
        commentPattern = commentPatterns(fileName);
    } catch (e) {}

    if (commentPattern && commentPattern.name === 'Markdown') {
        commentPattern = commentPatterns('.html');
        fileName = '.html';
    }

    if (commentPattern && commentPattern.multiLineComment && commentPattern.multiLineComment.length > 0) {
        commentPattern = commentPatterns.regex(fileName);
        if (commentPattern && commentPattern.regex) {
            let regex = commentPattern.regex;
            if (extension === '.hs') {
                let source = regex.source;
                const flags = regex.flags;
                while (source.indexOf('\\/\\*\\*') !== -1) {
                    source = source.replace('\\/\\*\\*', '{-');
                }
                while (source.indexOf('\\/\\*') !== -1) {
                    source = source.replace('\\/\\*', '{-');
                }
                while (source.indexOf('\\*\\/') !== -1) {
                    source = source.replace('\\*\\/', '-}');
                }
                regex = new RegExp(source, flags);
                commentPattern.regex = regex;
            }
            const commentMatch = commentPattern.regex.exec(text);
            if (commentMatch) {
                for (let i = commentPattern.cg.contentStart; i < commentMatch.length; ++i) {
                    if (commentMatch[i]) {
                        text = commentMatch[i];
                        break;
                    }
                }
            }
        }
    }

    return text;
}

export function removeLineComments(text: string, fileName: string): string {
    let result = text.trim();

    if (path.extname(fileName) === '.jsonc') {
        fileName = path.join(path.dirname(fileName), path.basename(fileName, path.extname(fileName))) + '.js';
    }

    let commentPattern: any;
    try {
        commentPattern = commentPatterns(fileName);
    } catch (e) {}

    if (commentPattern && commentPattern.singleLineComment) {
        commentPattern.singleLineComment.map(function (comment: any) {
            if (result.indexOf(comment.start) === 0) {
                result = result.substr(comment.start.length);
            }
        });
    }

    return result;
}

export function getTagRegex(): string {
    let tags = config.tags().slice().sort().reverse();
    tags = tags.map(function (tag: string) {
        tag = tag.replace(/\\/g, '\\\\\\');
        tag = tag.replace(/[|{}()[\]^$+*?.-]/g, '\\$&');
        return tag;
    });
    tags = tags.join('|');
    return '(' + tags + ')';
}

export function extractTag(
    text: string,
    matchOffset?: number
): { tag: string; withoutTag: string; before: string; after: string; tagOffset?: number; subTag?: string } {
    const c = config.regex();
    const flags = c.caseSensitive ? '' : 'i';
    let tagMatch: any = null;
    let tagOffset: number | undefined;
    let originalTag = '';
    let before = text;
    let after = text;
    let subTag: string | undefined;

    if (c.regex.indexOf('$TAGS') > -1) {
        const tagRegex = new RegExp(getTagRegex(), flags);
        const subTagRegex = new RegExp(config.subTagRegex(), flags);
        tagMatch = tagRegex.exec(text);
        if (tagMatch) {
            tagOffset = tagMatch.index;
            const rightOfTagText = text.substr(tagMatch.index + tagMatch[0].length).trim();
            const subTagMatch = subTagRegex.exec(rightOfTagText);
            if (subTagMatch && subTagMatch.length > 1) {
                subTag = subTagMatch[1];
            }
            const rightOfTag = rightOfTagText.replace(subTagRegex, '');
            if (rightOfTag.length === 0) {
                text = text.substr(0, matchOffset ? matchOffset - 1 : tagMatch.index).trim();
                after = '';
                before = text;
            } else {
                before = text.substr(0, matchOffset ? matchOffset - 1 : tagMatch.index).trim();
                text = rightOfTag;
                after = rightOfTag;
            }
            c.tags.map(function (tag: string) {
                if (config.isRegexCaseSensitive()) {
                    if (tag === tagMatch[0]) {
                        originalTag = tag;
                    }
                } else if (tag.toLowerCase() === tagMatch[0].toLowerCase()) {
                    originalTag = tag;
                }
            });
        }
    }
    if (tagMatch === null && c.regex.trim() !== '') {
        const regex = new RegExp(c.regex, flags);
        const match = regex.exec(text);
        if (match !== null) {
            tagMatch = true;
            originalTag = match[0];
            before = text.substring(0, text.indexOf(originalTag));
            after = text.substring(before.length + originalTag.length);
            tagOffset = match.index;
            text = after;
        }
    }
    return {
        tag: tagMatch ? originalTag : '',
        withoutTag: text,
        before: before,
        after: after,
        tagOffset: tagOffset,
        subTag: subTag,
    };
}

export function updateBeforeAndAfter(result: any, text: string, matchOffset?: number): any {
    const c = config.regex();
    const flags = c.caseSensitive ? '' : 'i';
    let tagMatch: any = null;

    const tagRegex = new RegExp(getTagRegex(), flags);
    const subTagRegex = new RegExp(config.subTagRegex(), flags);
    tagMatch = tagRegex.exec(text);
    if (tagMatch) {
        result.tagOffset = tagMatch.index;
        const rightOfTagText = text.substr(tagMatch.index + tagMatch[0].length).trim();
        const subTagMatch = subTagRegex.exec(rightOfTagText);
        if (subTagMatch && subTagMatch.length > 1) {
            result.subTag = subTagMatch[1];
        }
        const rightOfTag = rightOfTagText.replace(subTagRegex, '');
        if (rightOfTag.length === 0) {
            result.text = text.substr(0, matchOffset ? matchOffset - 1 : tagMatch.index).trim();
            result.after = '';
            result.before = text;
        } else {
            result.before = text.substr(0, matchOffset ? matchOffset - 1 : tagMatch.index).trim();
            result.text = rightOfTag;
            result.after = rightOfTag;
        }
    }

    return result;
}

export function getRegexSource(): string {
    let regex = config.regex().regex;
    if (regex.indexOf('($TAGS)') > -1) {
        regex = regex.split('($TAGS)').join(getTagRegex());
    }

    return regex;
}

export function getRegexForEditorSearch(global?: boolean): RegExp {
    let flags = 'm';
    if (global) {
        flags += 'g';
    }
    if (config.regex().caseSensitive === false) {
        flags += 'i';
    }
    if (config.regex().multiLine === true) {
        flags += 's';
    }

    const source = getRegexSource();
    return RegExp(source, flags);
}

export function getRegexForRipGrep(): RegExp {
    let flags = 'gm';
    if (config.regex().caseSensitive === false) {
        flags += 'i';
    }

    return RegExp(getRegexSource(), flags);
}

export function isIncluded(name: string, includes: string[], excludes: string[]): boolean {
    const posix_includes = includes.map(function (glob) {
        return glob.replace(/\\/g, '/');
    });
    const posix_excludes = excludes.map(function (glob) {
        return glob.replace(/\\/g, '/');
    });

    let included = posix_includes.length === 0 || micromatch.isMatch(name, posix_includes);
    if (included === true && micromatch.isMatch(name, posix_excludes)) {
        included = false;
    }
    return included;
}

export function formatLabel(template: string, node: any, unexpectedPlaceholders?: string[]): string {
    let result = template;

    const tag = String(node.actualTag).trim();
    const subTag = node.subTag ? String(node.subTag).trim() : '';
    const filename = node.fsPath ? path.basename(node.fsPath) : '';
    const filepath = node.fsPath ? node.fsPath : '';

    const formatLabelMap: Record<string, any> = {
        line: node.line + 1,
        column: node.column,
        tag: tag,
        'tag:uppercase': tag.toUpperCase(),
        'tag:lowercase': tag.toLowerCase(),
        'tag:capitalize': tag.charAt(0).toUpperCase() + tag.slice(1),
        subtag: subTag,
        'subtag:uppercase': subTag.toUpperCase(),
        'subtag:lowercase': subTag.toLowerCase(),
        'subtag:capitalize': subTag === '' ? '' : subTag.charAt(0).toUpperCase() + subTag.slice(1),
        before: node.before,
        after: node.after,
        afterorbefore: node.after === '' ? node.before : node.after,
        filename: filename,
        filepath: filepath,
    };

    // prepare regex to substitude "${name}" with it's value from map
    const re = new RegExp('\\$\\{(' + Object.keys(formatLabelMap).join('|') + ')\\}', 'gi');
    result = result.replace(re, function (matched) {
        return formatLabelMap[matched.slice(2, -1).toLowerCase()];
    });

    if (unexpectedPlaceholders) {
        const placeholderMatch = placeholderRegex.exec(result);
        if (placeholderMatch) {
            unexpectedPlaceholders.push(placeholderMatch[0]);
        }
    }

    return result;
}

export function createFolderGlob(folderPath: string, rootPath: string, filter: string): string {
    if (process.platform === 'win32') {
        let fp = folderPath.replace(/\\/g, '/');
        const rp = rootPath.replace(/\\/g, '/');

        if (fp.indexOf(rp) === 0) {
            fp = fp.substring(path.dirname(rp).length);
        }

        return ('**/' + fp + filter).replace(/\/\//g, '/');
    }

    return (folderPath + filter).replace(/\/\//g, '/');
}

export function getSubmoduleExcludeGlobs(rootPath: string): string[] {
    let submodules = find.fileSync('.git', rootPath);
    submodules = submodules.map(function (submodule: string) {
        return path.dirname(submodule);
    });
    submodules = submodules.filter(function (submodule: string) {
        return submodule !== rootPath;
    });
    return submodules;
}

export function isHidden(filename: string): boolean {
    return path.basename(filename).indexOf('.') !== -1 && path.extname(filename) === '';
}

export function expandTilde(filePath: string): string {
    if (filePath && filePath[0] === '~') {
        filePath = path.join(os.homedir(), filePath.slice(1));
    }

    return filePath;
}

export function replaceEnvironmentVariables(text: string): string {
    text = text.replace(envRegex, function (match, name) {
        return process.env[name] ? (process.env[name] as string) : '';
    });

    return text;
}

export function formatExportPath(template: string, dateTime?: any): string {
    let result = expandTilde(template);
    if (result) {
        result = strftime.strftime(result, dateTime || new Date());
    }
    return result;
}

export function complementaryColour(colour: string): string {
    const hex = colour.split(/ /)[0].replace(/[^\da-fA-F]/g, '');
    const digits = hex.length / 3;
    const red = parseInt(hex.substr(0, digits), 16);
    const green = parseInt(hex.substr(1 * digits, digits), 16);
    const blue = parseInt(hex.substr(2 * digits, digits), 16);
    const c = [red / 255, green / 255, blue / 255];
    for (let i = 0; i < c.length; ++i) {
        if (c[i] <= 0.03928) {
            c[i] = c[i] / 12.92;
        } else {
            c[i] = Math.pow((c[i] + 0.055) / 1.055, 2.4);
        }
    }
    const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return l > 0.179 ? '#000000' : '#ffffff';
}

export function isValidColour(colour: string): boolean {
    if (colour) {
        if (isNamedColour(colour) || isThemeColour(colour) || isHexColour(colour) || isRgbColour(colour)) {
            return true;
        }
    }

    return false;
}

export function setRgbAlpha(rgb: string, alpha: number): string {
    rgbRegex.lastIndex = 0;
    const match = rgbRegex.exec(rgb);
    if (match !== null) {
        return 'rgba(' + match[1] + ',' + match[2] + ',' + match[3] + ',' + alpha + ')';
    }
    return rgb;
}

export function isCodicon(icon: string): boolean {
    return icon.trim().indexOf('$(') === 0;
}

export function toGlobArray(globs: any): string[] {
    if (globs === undefined) {
        return [];
    }
    if (typeof globs === 'string') {
        return globs.split(',');
    }
    return globs;
}
