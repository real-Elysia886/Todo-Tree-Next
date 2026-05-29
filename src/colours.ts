import * as vscode from 'vscode';
import * as utils from './utils';

export function validateColours(workspace: typeof vscode.workspace): string {
    function check(setting: string) {
        const definedColour = workspace.getConfiguration('todo-tree.highlights').get<string>(setting);
        if (definedColour !== undefined && !utils.isValidColour(definedColour)) {
            invalidColours.push(setting + ' (' + definedColour + ')');
        }
    }

    const invalidColours: string[] = [];
    let result = '';

    const attributeList = ['foreground', 'background', 'iconColour', 'rulerColour'];
    attributeList.forEach((attribute) => {
        check('defaultHighlight.' + attribute);
    });

    const config = vscode.workspace.getConfiguration('todo-tree.highlights');
    const customHighlight = config.get<Record<string, any>>('customHighlight', {});
    Object.keys(customHighlight).forEach((tag) => {
        attributeList.forEach((attribute) => {
            check('customHighlight.' + tag + '.' + attribute);
        });
    });

    if (invalidColours.length > 0) {
        result = 'Invalid colour settings: ' + invalidColours.join(', ');
    }

    return result;
}

export function validateIconColours(workspace: typeof vscode.workspace): string {
    let hasInvalidCodiconColour = false;
    let hasInvalidOcticonColour = false;

    function checkIconColour(setting: string) {
        const icon = workspace.getConfiguration('todo-tree.highlights').get<string>(setting + '.icon');
        const iconColour = workspace.getConfiguration('todo-tree.highlights').get<string>(setting + '.iconColour');
        if (icon !== undefined && iconColour !== undefined) {
            if (utils.isCodicon(icon)) {
                if (utils.isHexColour(iconColour) || utils.isRgbColour(iconColour) || utils.isNamedColour(iconColour)) {
                    invalidIconColours.push(setting + '.iconColour (' + iconColour + ')');
                    hasInvalidCodiconColour = true;
                }
            } else {
                if (utils.isThemeColour(iconColour)) {
                    invalidIconColours.push(setting + '.iconColour (' + iconColour + ')');
                    hasInvalidOcticonColour = true;
                }
            }
        }
    }

    const invalidIconColours: string[] = [];
    let result = '';

    checkIconColour('defaultHighlight');

    const config = vscode.workspace.getConfiguration('todo-tree.highlights');
    const customHighlight = config.get<Record<string, any>>('customHighlight', {});
    Object.keys(customHighlight).forEach((tag) => {
        checkIconColour('customHighlight.' + tag);
    });

    if (invalidIconColours.length > 0) {
        result = 'Invalid icon colour settings: ' + invalidIconColours.join(', ') + '.';
        if (hasInvalidCodiconColour) {
            result += ' Codicons can only use theme colours.';
        }
        if (hasInvalidOcticonColour) {
            result += ' Theme colours can only be used with Codicons.';
        }
    }

    return result;
}
