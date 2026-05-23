import * as vscode from 'vscode';

interface NavigationUtils {
    getRegexForEditorSearch: (global: boolean) => RegExp;
}

export function register(context: vscode.ExtensionContext, utils: NavigationUtils): void {
    context.subscriptions.push(vscode.commands.registerCommand('todo-tree.goToNext', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const text = editor.document.getText();
        const regex = utils.getRegexForEditorSearch(false);
        const newSelections: vscode.Selection[] = [];
        let ok = true;

        editor.selections.forEach(selection => {
            let cursorOffset = editor.document.offsetAt(selection.start);
            let textToSearch = text.substring(cursorOffset);
            let matches = textToSearch.match(regex);

            if (matches && matches.length && matches.index === 0) {
                cursorOffset += matches[0].length;
                textToSearch = text.substring(cursorOffset);
                matches = textToSearch.match(regex);
            }

            if (matches && matches.length && matches.index !== undefined) {
                let offset = cursorOffset + matches.index;
                if (matches[0][0] === '\n') { ++offset; }
                const pos = editor.document.positionAt(offset);
                newSelections.push(new vscode.Selection(pos, pos));
            } else {
                ok = false;
            }
        });

        if (ok && newSelections.length > 0) {
            editor.selections = newSelections;
            editor.revealRange(new vscode.Range(newSelections[0].start, newSelections[0].start));
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('todo-tree.goToPrevious', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const text = editor.document.getText();
        const newSelections: vscode.Selection[] = [];
        let ok = true;

        editor.selections.forEach(selection => {
            const cursorOffset = editor.document.offsetAt(selection.start);
            const textToSearch = text.substring(0, cursorOffset);
            const regex = utils.getRegexForEditorSearch(true);

            let lastMatch: RegExpExecArray | null = null;
            let lastMatchOffset = -1;
            let result: RegExpExecArray | null;

            while ((result = regex.exec(textToSearch))) {
                lastMatch = result;
                lastMatchOffset = result.index;
            }

            if (lastMatchOffset !== -1 && lastMatch) {
                if (lastMatch[0][0] === '\n') { ++lastMatchOffset; }
                const pos = editor.document.positionAt(lastMatchOffset);
                newSelections.push(new vscode.Selection(pos, pos));
            } else {
                ok = false;
            }
        });

        if (ok && newSelections.length > 0) {
            editor.selections = newSelections;
            editor.revealRange(new vscode.Range(newSelections[0].start, newSelections[0].start));
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('todo-tree.revealInFile', (uri: vscode.Uri, selection: unknown) => {
        function flashLine(): void {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const currentLineRange = editor.document.lineAt(editor.selection.active.line).range;
            const flashBg = new vscode.ThemeColor('editor.rangeHighlightBackground');
            const lineFlashStyle = vscode.window.createTextEditorDecorationType({
                isWholeLine: true,
                light: { backgroundColor: flashBg },
                dark: { backgroundColor: flashBg }
            });

            editor.setDecorations(lineFlashStyle, [{ range: currentLineRange }]);
            setTimeout(() => { editor.setDecorations(lineFlashStyle, []); }, 150);
        }

        vscode.commands.executeCommand('vscode.open', uri, selection).then(flashLine);
    }));
}
