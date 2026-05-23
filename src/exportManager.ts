import * as vscode from 'vscode';
import * as path from 'path';

const treeify = require('treeify');

interface ExportProvider {
    exportTree(): Record<string, unknown>;
}

interface ExportUtils {
    replaceEnvironmentVariables(text: string): string;
    formatExportPath(text: string): string;
}

export function registerContentProvider(context: vscode.ExtensionContext, provider: ExportProvider): void {
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('todotree-export', {
        provideTextDocumentContent(uri: vscode.Uri): string {
            if (path.extname(uri.path) === '.json') {
                return JSON.stringify(provider.exportTree(), null, 2);
            }
            return treeify.asTree(provider.exportTree(), true);
        }
    }));
}

export function registerCommand(context: vscode.ExtensionContext, utils: ExportUtils): void {
    context.subscriptions.push(vscode.commands.registerCommand('todo-tree.exportTree', () => {
        let exportPath = vscode.workspace.getConfiguration('todo-tree.general').get<string>('exportPath') || '';
        exportPath = utils.replaceEnvironmentVariables(exportPath);
        exportPath = utils.formatExportPath(exportPath);

        const uri = vscode.Uri.parse('todotree-export:' + exportPath);
        vscode.workspace.openTextDocument(uri).then(document => {
            vscode.window.showTextDocument(document, { preview: true });
        });
    }));
}
