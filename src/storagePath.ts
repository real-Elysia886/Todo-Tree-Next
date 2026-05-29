import * as os from 'os';
import * as path from 'path';

interface ExtensionContextStorage {
    storageUri?: { fsPath?: string };
    storagePath?: string;
    globalStorageUri?: { fsPath?: string };
}

export function getStoragePath(context: ExtensionContextStorage): string {
    if (context.storageUri && context.storageUri.fsPath) {
        return context.storageUri.fsPath;
    }
    if (context.storagePath) {
        return context.storagePath;
    }
    if (context.globalStorageUri && context.globalStorageUri.fsPath) {
        return context.globalStorageUri.fsPath;
    }
    return path.join(os.tmpdir(), 'todo-tree');
}
