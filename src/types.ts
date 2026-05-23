export type TodoPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'none';

export interface TodoItem {
    file: string;
    line: number;
    column: number;
    tag: string;
    text: string;
    context: string;
    severity: string;
    priority: TodoPriority;
    assignee?: string;
    dueDate?: string;
    labels?: string[];
}

export interface ScanOutput {
    workspace: string;
    elapsed_ms: number;
    scanned_files: number;
    matched_files: number;
    total_items: number;
    items: TodoItem[];
}

export interface ScannerMatch {
    fsPath: string;
    line: number;
    column: number;
    match: string;
    scanner: {
        tag: string;
        severity: string;
        priority: TodoPriority;
        assignee?: string;
        dueDate?: string;
        labels?: string[];
    };
}

export interface PriorityStats {
    P0: number;
    P1: number;
    P2: number;
    P3: number;
    none: number;
}

export interface DashboardStats {
    total: number;
    fileCount: number;
    byTag: Record<string, number>;
    byPriority: PriorityStats;
}

