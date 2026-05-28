import * as fs from 'fs';
import * as path from 'path';
import { AgentAnnotation } from './types.js';

interface AnnotationStore {
    version: number;
    annotations: (AgentAnnotation & { timestamp: string })[];
}

function annotationPath(root: string): string {
    return path.join(root, '.todo-tree', 'annotations.json');
}

export function loadAnnotations(root: string): AnnotationStore {
    const filePath = annotationPath(root);
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch {
        // ignore parse errors
    }
    return { version: 1, annotations: [] };
}

function saveAnnotations(root: string, store: AnnotationStore): void {
    const filePath = annotationPath(root);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
}

export function addAnnotations(root: string, annotations: AgentAnnotation[]): number {
    const store = loadAnnotations(root);
    const timestamp = new Date().toISOString();
    for (const annotation of annotations) {
        store.annotations.push({ ...annotation, timestamp });
    }
    saveAnnotations(root, store);
    return annotations.length;
}

export function clearAnnotations(root: string, source?: string): number {
    const store = loadAnnotations(root);
    const before = store.annotations.length;
    if (source) {
        store.annotations = store.annotations.filter((a) => a.source !== source);
    } else {
        store.annotations = [];
    }
    saveAnnotations(root, store);
    return before - store.annotations.length;
}
