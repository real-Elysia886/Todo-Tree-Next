import { describe, it, expect } from 'vitest';
import { parse, createMatcher } from '../src/filterQuery.js';

describe('filterQuery', () => {
    describe('parse', () => {
        it('parses free text terms', () => {
            const q = parse('hello world');
            expect(q.terms).toEqual(['hello', 'world']);
            expect(q.fields).toEqual({});
        });

        it('parses field:value pairs', () => {
            const q = parse('tag:TODO path:src');
            expect(q.terms).toEqual([]);
            expect(q.fields.tag).toEqual(['TODO']);
            expect(q.fields.path).toEqual(['src']);
        });

        it('parses mixed terms and fields', () => {
            const q = parse('fix auth tag:TODO priority:P0');
            expect(q.terms).toEqual(['fix', 'auth']);
            expect(q.fields.tag).toEqual(['TODO']);
            expect(q.fields.priority).toEqual(['P0']);
        });

        it('handles quoted values', () => {
            const q = parse('"hello world" tag:TODO');
            expect(q.terms).toEqual(['hello world']);
        });
    });

    describe('createMatcher', () => {
        it('matches by tag field', () => {
            const match = createMatcher('tag:TODO', true);
            expect(match({ actualTag: 'TODO', fsPath: 'test.ts' })).toBe(true);
            expect(match({ actualTag: 'FIXME', fsPath: 'test.ts' })).toBe(false);
        });

        it('matches by path field', () => {
            const match = createMatcher('path:src/auth', true);
            expect(match({ fsPath: 'src/auth/login.ts' })).toBe(true);
            expect(match({ fsPath: 'test/auth.test.ts' })).toBe(false);
        });

        it('matches by priority field', () => {
            const match = createMatcher('priority:P0', true);
            expect(match({ priority: 'P0' })).toBe(true);
            expect(match({ priority: 'P1' })).toBe(false);
        });

        it('matches free text in label', () => {
            const match = createMatcher('authentication', true);
            expect(match({ label: 'fix authentication bypass' })).toBe(true);
            expect(match({ label: 'update readme' })).toBe(false);
        });

        it('case insensitive matching', () => {
            const match = createMatcher('tag:todo', false);
            expect(match({ actualTag: 'TODO' })).toBe(true);
        });
    });
});
