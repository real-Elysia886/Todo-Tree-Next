import * as vscode from 'vscode';

interface CommandDefinition {
    command: string;
    handler: (...args: unknown[]) => unknown;
}

export function registerMany(context: vscode.ExtensionContext, definitions: CommandDefinition[]): void {
    definitions.forEach((definition) => {
        context.subscriptions.push(vscode.commands.registerCommand(definition.command, definition.handler));
    });
}
