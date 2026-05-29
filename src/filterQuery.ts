interface Query {
    terms: string[];
    fields: Record<string, string[]>;
}

interface TodoLike {
    label?: string;
    after?: string;
    before?: string;
    fsPath?: string;
    actualTag?: string;
    tag?: string;
    subTag?: string;
    priority?: string;
}

export function parse(text?: string): Query {
    const query: Query = {
        terms: [],
        fields: {},
    };

    tokenize(text || '').forEach((token) => {
        const separator = token.indexOf(':');
        if (separator > 0) {
            const key = token.substring(0, separator).toLowerCase();
            const value = token.substring(separator + 1);
            if (value !== '') {
                if (query.fields[key] === undefined) {
                    query.fields[key] = [];
                }
                query.fields[key].push(value);
            }
        } else if (token !== '') {
            query.terms.push(token);
        }
    });

    return query;
}

function tokenize(text: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let quote: string | undefined;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            if (ch === quote) {
                quote = undefined;
            } else {
                current += ch;
            }
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (/\s/.test(ch)) {
            if (current !== '') {
                tokens.push(current);
                current = '';
            }
        } else {
            current += ch;
        }
    }

    if (current !== '') {
        tokens.push(current);
    }

    return tokens;
}

export function createMatcher(text: string, caseSensitive: boolean): (node: TodoLike) => boolean {
    const query = parse(text);

    return (node: TodoLike) => matchesNode(node, query, caseSensitive);
}

export function matchesNode(node: TodoLike, query: Query, caseSensitive: boolean): boolean {
    const haystack = [
        node.label,
        node.after,
        node.before,
        node.fsPath,
        node.actualTag,
        node.tag,
        node.subTag,
        node.priority,
    ]
        .filter(Boolean)
        .join(' ');

    const fields = query.fields;
    return (
        query.terms.every((term) => contains(haystack, term, caseSensitive)) &&
        matchField(fields.tag, node.actualTag || node.tag, caseSensitive) &&
        matchField(fields.path, node.fsPath, caseSensitive) &&
        matchField(fields.file, basename(node.fsPath), caseSensitive) &&
        matchField(fields.text, [node.label, node.after, node.before].filter(Boolean).join(' '), caseSensitive) &&
        matchField(fields.priority, node.priority || 'none', caseSensitive) &&
        matchField(fields.status, markdownStatus(node), caseSensitive)
    );
}

function matchField(
    expectedValues: string[] | undefined,
    actualValue: string | undefined,
    caseSensitive: boolean
): boolean {
    if (expectedValues === undefined || expectedValues.length === 0) {
        return true;
    }

    return expectedValues.some((expected) => contains(actualValue || '', expected, caseSensitive));
}

function contains(actual: string, expected: string, caseSensitive: boolean): boolean {
    actual = String(actual || '');
    expected = String(expected || '');

    if (caseSensitive !== true) {
        actual = actual.toLowerCase();
        expected = expected.toLowerCase();
    }

    return actual.indexOf(expected) !== -1;
}

function basename(fsPath?: string): string {
    if (!fsPath) {
        return '';
    }
    const parts = String(fsPath).replace(/\\/g, '/').split('/');
    return parts[parts.length - 1];
}

function markdownStatus(node: TodoLike): string {
    const tag = node.actualTag || node.tag || '';
    if (tag.toLowerCase() === '[x]') {
        return 'done';
    }
    if (tag === '[ ]') {
        return 'open';
    }
    return 'unknown';
}
