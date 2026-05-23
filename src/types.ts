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
    due_date?: string;
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

export interface AgentContextSummary {
    total: number;
    highPriority: number;
    overdue: number;
    unassigned: number;
    changedInCurrentBranch: number;
}

export interface AgentTodoItem {
    id: string;
    file: string;
    relativePath: string;
    line: number;
    column: number;
    tag: string;
    priority: TodoPriority;
    severity: string;
    assignee?: string;
    dueDate?: string;
    labels?: string[];
    gitStatus?: string;
    ageDays?: number;
    text: string;
    context: string;
    contextSnippet: string;
    recommendedOrder: number;
    recommendedAction: string;
}

export interface AgentContext {
    schemaVersion: number;
    workspace: string;
    generatedAt: number;
    summary: AgentContextSummary;
    items: AgentTodoItem[];
}

export interface AgentAnnotation {
    file: string;
    line: number;
    column?: number;
    message: string;
    severity?: 'error' | 'warning' | 'information' | 'hint';
    source?: string;
    code?: string;
}
