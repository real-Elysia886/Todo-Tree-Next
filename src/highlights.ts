import * as vscode from 'vscode';
require('regexp-match-indices').shim();

import * as config from './config';
import * as utils from './utils';
import * as attributes from './attributes';
import * as icons from './icons';

const captureGroupArgument = 'capture-groups';
type TextEditorDecorationType = import('vscode').TextEditorDecorationType;

const lanes: Record<string, number | undefined> = {
    none: undefined,
    left: 1,
    center: 2,
    right: 4,
    full: 7,
};

const decorations: Record<string, TextEditorDecorationType[]> = {};
const highlightTimer: Record<string, any> = {};
let context: any;
let debug: (text: string) => void;

export function init(context_: any, debug_: (text: string) => void): void {
    context = context_;
    debug = debug_;
    context.subscriptions.push({
        dispose() {
            Object.keys(decorations).forEach(function (id) {
                decorations[id].forEach(function (decoration) {
                    decoration.dispose();
                });
                decorations[id] = [];
            });
        },
    });
}

function applyOpacity(colour: string | vscode.ThemeColor, opacity: number): string | vscode.ThemeColor {
    if (typeof colour === 'string') {
        if (utils.isHexColour(colour)) {
            colour = utils.hexToRgba(colour, opacity < 1 ? opacity * 100 : opacity);
        } else if (utils.isRgbColour(colour)) {
            if (opacity !== 100) {
                colour = utils.setRgbAlpha(colour, opacity > 1 ? opacity / 100 : opacity);
            }
        }
    }
    return colour;
}

export function getDecoration(tag: string): vscode.TextEditorDecorationType {
    const foregroundColour = attributes.getForeground(tag);
    const backgroundColour = attributes.getBackground(tag);

    const opacity = getOpacity(tag);

    let lightForegroundColour: string | vscode.ThemeColor | undefined = foregroundColour;
    let darkForegroundColour: string | vscode.ThemeColor | undefined = foregroundColour;
    let lightBackgroundColour: string | vscode.ThemeColor | undefined = backgroundColour;
    let darkBackgroundColour: string | vscode.ThemeColor | undefined = backgroundColour;

    if (foregroundColour) {
        if (foregroundColour.match(/(foreground|background)/i)) {
            lightForegroundColour = new vscode.ThemeColor(foregroundColour);
            darkForegroundColour = new vscode.ThemeColor(foregroundColour);
        } else if (!utils.isValidColour(foregroundColour)) {
            lightForegroundColour = new vscode.ThemeColor('editor.foreground');
            darkForegroundColour = new vscode.ThemeColor('editor.foreground');
        }
    }

    if (backgroundColour) {
        if (backgroundColour.match(/(foreground|background)/i)) {
            lightBackgroundColour = new vscode.ThemeColor(backgroundColour);
            darkBackgroundColour = new vscode.ThemeColor(backgroundColour);
        } else if (!utils.isValidColour(backgroundColour)) {
            lightBackgroundColour = new vscode.ThemeColor('editor.background');
            darkBackgroundColour = new vscode.ThemeColor('editor.background');
        }

        lightBackgroundColour = applyOpacity(lightBackgroundColour, opacity);
        darkBackgroundColour = applyOpacity(darkBackgroundColour, opacity);
    }

    if (
        lightForegroundColour === undefined &&
        typeof lightBackgroundColour === 'string' &&
        utils.isHexColour(lightBackgroundColour)
    ) {
        lightForegroundColour = utils.complementaryColour(lightBackgroundColour);
    }
    if (
        darkForegroundColour === undefined &&
        typeof darkBackgroundColour === 'string' &&
        utils.isHexColour(darkBackgroundColour)
    ) {
        darkForegroundColour = utils.complementaryColour(darkBackgroundColour);
    }

    if (lightBackgroundColour === undefined && lightForegroundColour === undefined) {
        lightBackgroundColour = new vscode.ThemeColor('editor.foreground');
        lightForegroundColour = new vscode.ThemeColor('editor.background');
    }

    if (darkBackgroundColour === undefined && darkForegroundColour === undefined) {
        darkBackgroundColour = new vscode.ThemeColor('editor.foreground');
        darkForegroundColour = new vscode.ThemeColor('editor.background');
    }

    let lane = getRulerLane(tag);
    if (isNaN(parseInt(lane))) {
        lane = lanes[lane.toLowerCase()];
    }
    const decorationOptions: any = {
        borderRadius: getBorderRadius(tag),
        isWholeLine: getType(tag) === 'whole-line',
        fontWeight: getFontWeight(tag),
        fontStyle: getFontStyle(tag),
        textDecoration: getTextDecoration(tag),
        gutterIconPath: showInGutter(tag) ? icons.getIcon(context, tag, debug) : undefined,
    };

    if (lane !== undefined) {
        let rulerColour = getRulerColour(tag, darkBackgroundColour ? darkBackgroundColour : 'editor.foreground');
        const rulerOpacity = getRulerOpacity(tag);

        if (typeof rulerColour === 'string' && utils.isThemeColour(rulerColour)) {
            rulerColour = new vscode.ThemeColor(rulerColour);
        } else {
            rulerColour = applyOpacity(rulerColour, rulerOpacity);
        }

        decorationOptions.overviewRulerColor = rulerColour;
        decorationOptions.overviewRulerLane = lane;
    }

    decorationOptions.light = { backgroundColor: lightBackgroundColour, color: lightForegroundColour };
    decorationOptions.dark = { backgroundColor: darkBackgroundColour, color: darkForegroundColour };

    return vscode.window.createTextEditorDecorationType(decorationOptions);
}

function getRulerColour(tag: string, defaultColour: string | vscode.ThemeColor): string | vscode.ThemeColor {
    return attributes.getAttribute(tag, 'rulerColour', defaultColour);
}

function getRulerLane(tag: string): any {
    return attributes.getAttribute(tag, 'rulerLane', 4);
}

function getOpacity(tag: string): number {
    return attributes.getAttribute(tag, 'opacity', 100);
}

function getRulerOpacity(tag: string): number {
    return attributes.getAttribute(tag, 'rulerOpacity', 100);
}

function getBorderRadius(tag: string): string {
    return attributes.getAttribute(tag, 'borderRadius', '0.2em');
}

function getFontStyle(tag: string): string {
    return attributes.getAttribute(tag, 'fontStyle', 'normal');
}

function getFontWeight(tag: string): string {
    return attributes.getAttribute(tag, 'fontWeight', 'normal');
}

function getTextDecoration(tag: string): string {
    return attributes.getAttribute(tag, 'textDecoration', '');
}

function showInGutter(tag: string): boolean {
    return attributes.getAttribute(tag, 'gutterIcon', false);
}

function getType(tag: string): string {
    return attributes.getAttribute(
        tag,
        'type',
        vscode.workspace.getConfiguration('todo-tree.highlights').get('highlight')
    );
}

function editorId(editor: vscode.TextEditor): string {
    let id = '';
    if (editor.document) {
        id = JSON.stringify(editor.document.uri);
    }
    if (editor.viewColumn) {
        id += editor.viewColumn;
    }
    return id;
}

function highlight(editor?: vscode.TextEditor): void {
    function addDecoration(startPos: vscode.Position, endPos: vscode.Position): void {
        const decoration = { range: new vscode.Range(startPos, endPos) };
        if (documentHighlights[tag] === undefined) {
            documentHighlights[tag] = [];
        }
        documentHighlights[tag].push(decoration);
    }

    var documentHighlights: Record<string, any[]> = {};
    const subTagHighlights: Record<string, any[]> = {};
    const customHighlight = config.customHighlight();

    if (editor) {
        const id = editorId(editor);

        if (decorations[id]) {
            decorations[id].forEach(function (decoration) {
                decoration.dispose();
            });
        }

        decorations[id] = [];

        if (vscode.workspace.getConfiguration('todo-tree.highlights').get('enabled', true)) {
            const text = editor.document.getText();
            const regex = utils.getRegexForEditorSearch(true);
            const subTagRegex = new RegExp(config.subTagRegex());

            let match;
            while ((match = regex.exec(text)) !== null) {
                var tag = match[0];
                let offsetStart = match.index;
                let offsetEnd = offsetStart + match[0].length;
                const extracted = utils.extractTag(match[0]);
                if (extracted.tag) {
                    const line = editor.document.lineAt(editor.document.positionAt(match.index));
                    utils.updateBeforeAndAfter(
                        extracted,
                        text.substring(offsetStart, editor.document.offsetAt(line.range.end))
                    );
                }
                if (extracted.tag && extracted.tag.length > 0) {
                    const tagGroup = config.tagGroup(extracted.tag);
                    tag = tagGroup ? tagGroup : extracted.tag;
                    offsetStart = match.index + extracted.tagOffset;
                    offsetEnd = offsetStart + extracted.tag.length;
                } else {
                    offsetStart += match[0].search(/\S|$/);
                }
                const type = getType(tag);
                if (type !== 'none') {
                    const startPos = editor.document.positionAt(offsetStart);
                    const endPos = editor.document.positionAt(offsetEnd);
                    const fullEndPos = editor.document.positionAt(match.index + match[0].length);

                    if (type === 'text-and-comment') {
                        addDecoration(
                            editor.document.positionAt(match.index),
                            new vscode.Position(
                                fullEndPos.line,
                                editor.document.lineAt(fullEndPos.line).range.end.character
                            )
                        );
                    } else if (type === 'text') {
                        addDecoration(
                            startPos,
                            new vscode.Position(
                                fullEndPos.line,
                                editor.document.lineAt(fullEndPos.line).range.end.character
                            )
                        );
                    } else if (type !== undefined && type.indexOf(captureGroupArgument + ':') === 0) {
                        type.substring(type.indexOf(':') + 1)
                            .split(',')
                            .map(function (groupText) {
                                const group = parseInt(groupText);
                                if (match.indices && match.indices[group]) {
                                    addDecoration(
                                        editor.document.positionAt(match.indices[group][0]),
                                        editor.document.positionAt(match.indices[group][1])
                                    );
                                }
                            });
                    } else if (type === 'tag-and-subTag' || type === 'tag-and-subtag') {
                        addDecoration(startPos, endPos);

                        const endOfLineOffset = editor.document.offsetAt(
                            new vscode.Position(
                                fullEndPos.line,
                                editor.document.lineAt(fullEndPos.line).range.end.character
                            )
                        );
                        const todoText = text.substring(offsetEnd, endOfLineOffset);
                        const subTagMatch = todoText.match(subTagRegex);
                        if (subTagMatch !== null && subTagMatch.length > 1) {
                            const subTag = subTagMatch[1];
                            if (customHighlight[subTag] !== undefined) {
                                const subTagOffset = todoText.indexOf(subTag);
                                if (subTagOffset !== -1) {
                                    const subTagStartPos = editor.document.positionAt(offsetEnd + subTagOffset);
                                    const subTagEndPos = editor.document.positionAt(
                                        offsetEnd + subTagOffset + subTagMatch[1].length
                                    );
                                    const subTagDecoration = { range: new vscode.Range(subTagStartPos, subTagEndPos) };
                                    if (subTagHighlights[subTag] === undefined) {
                                        subTagHighlights[subTag] = [];
                                    }
                                    subTagHighlights[subTag].push(subTagDecoration);
                                }
                            }
                        }
                    } else if (type === 'tag-and-comment') {
                        addDecoration(editor.document.positionAt(match.index), endPos);
                    } else if (type === 'line' || type === 'whole-line') {
                        addDecoration(
                            new vscode.Position(startPos.line, 0),
                            new vscode.Position(
                                fullEndPos.line,
                                editor.document.lineAt(fullEndPos.line).range.end.character
                            )
                        );
                    } else {
                        addDecoration(startPos, endPos);
                    }
                }
            }

            Object.keys(documentHighlights).forEach(function (tag) {
                const decoration = getDecoration(tag);
                decorations[id].push(decoration);
                editor.setDecorations(decoration, documentHighlights[tag]);
            });

            Object.keys(subTagHighlights).forEach(function (subTag) {
                const decoration = getDecoration(subTag);
                decorations[id].push(decoration);
                editor.setDecorations(decoration, subTagHighlights[subTag]);
            });
        }
    }
}

export function triggerHighlight(editor?: vscode.TextEditor): void {
    if (editor) {
        const id = editorId(editor);

        if (highlightTimer[id]) {
            clearTimeout(highlightTimer[id]);
        }
        highlightTimer[id] = setTimeout(
            highlight,
            vscode.workspace.getConfiguration('todo-tree.highlights').highlightDelay,
            editor
        );
    }
}
