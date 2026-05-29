import * as path from 'path';
import * as vscode from 'vscode';

const resultsByUri = new Map<string, any[]>();

function uriKey(uri: vscode.Uri | string): string {
    if (uri && typeof uri !== 'string' && uri.toString) return uri.toString();
    return uri as string;
}

export function clear(): void {
    resultsByUri.clear();
}

export function add(result: any): void {
    const key = uriKey(result.uri);
    let arr = resultsByUri.get(key);
    if (!arr) {
        arr = [];
        resultsByUri.set(key, arr);
    }
    arr.push(result);
}

export function remove(uri: vscode.Uri | string): void {
    resultsByUri.delete(uriKey(uri));
}

export function addToTree(tree: any): void {
    for (const arr of resultsByUri.values()) {
        for (const match of arr) {
            if (match.added !== true) {
                tree.add(match);
                match.added = true;
            }
        }
    }
}

export function containsMarkdown(): boolean {
    for (const arr of resultsByUri.values()) {
        for (const match of arr) {
            if (match.uri && match.uri.fsPath && path.extname(match.uri.fsPath) === '.md') return true;
        }
    }
    return false;
}

export function count(): number {
    let total = 0;
    for (const arr of resultsByUri.values()) total += arr.length;
    return total;
}

export function contains(result: any): boolean {
    const key = uriKey(result.uri);
    const arr = resultsByUri.get(key);
    if (!arr) return false;
    return arr.some(
        (match: any) => match.uri === result.uri && match.line === result.line && match.column === result.column
    );
}

export function markAsNotAdded(): void {
    for (const arr of resultsByUri.values()) {
        for (const match of arr) match.added = false;
    }
}

export function filter(filterFunction: (match: any) => boolean): void {
    for (const [key, arr] of resultsByUri) {
        const filtered = arr.filter(filterFunction);
        if (filtered.length === 0) resultsByUri.delete(key);
        else resultsByUri.set(key, filtered);
    }
}
