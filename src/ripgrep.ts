import * as child_process from 'child_process';
import * as fs from 'fs';
import * as utils from './utils';

let currentProcess: child_process.ChildProcess | undefined;

export class RipgrepError extends Error {
    stderr: string;
    constructor(error: string, stderr: string) {
        super(error);
        this.stderr = stderr;
        Object.setPrototypeOf(this, RipgrepError.prototype);
    }
}

export class Match {
    fsPath: string = '';
    line: number = 0;
    column: number = 0;
    match: string = '';
    extraLines?: Match[];

    constructor(matchText: string) {
        // Detect file, line number and column which is formatted in the
        // following format: {file}:{line}:{column}:{code match}
        const regex = RegExp(/^(?<file>.*):(?<line>\d+):(?<column>\d+):(?<todo>.*)/);

        const match = regex.exec(matchText);
        if (match && match.groups) {
            this.fsPath = match.groups.file;
            this.line = parseInt(match.groups.line);
            this.column = parseInt(match.groups.column);
            this.match = match.groups.todo;
        } else // Fall back to old method
        {
            this.fsPath = '';

            if (matchText.length > 1 && matchText[1] === ':') {
                this.fsPath = matchText.substr(0, 2);
                matchText = matchText.substr(2);
            }
            const parts = matchText.split(':');
            const hasColumn = parts.length === 4;
            this.fsPath += parts.shift();
            this.line = parseInt(parts.shift() || '0');
            if (hasColumn === true) {
                this.column = parseInt(parts.shift() || '0');
            } else {
                this.column = 1;
            }
            this.match = parts.join(':');
        }
    }
}

function formatResults(stdout: string, multiline: boolean): Match[] {
    stdout = stdout.trim();

    if (!stdout) {
        return [];
    }

    if (multiline === true) {
        const results: Match[] = [];
        const regex = utils.getRegexForEditorSearch(true);
        const lines = stdout.split('\n');

        let buffer: string[] = [];
        let matches: Match[] = [];
        let text = '';

        lines.forEach(function (line) {
            let resultMatch = new Match(line);
            buffer.push(line);
            matches.push(resultMatch);

            text = text === '' ? resultMatch.match : text + '\n' + resultMatch.match;

            const fullMatch = text.match(regex);
            if (fullMatch) {
                resultMatch = matches[0];
                matches.shift();
                resultMatch.extraLines = matches;
                results.push(resultMatch);
                buffer = [];
                matches = [];
                text = '';
            }
        });

        return results;
    }

    return stdout.split('\n').map((line) => new Match(line));
}

export function search(cwd: string, options: any): Promise<Match[]> {
    function debug(text: string) {
        if (options.outputChannel) {
            const now = new Date();
            options.outputChannel.appendLine(
                now.toLocaleTimeString('en', { hour12: false }) +
                    '.' +
                    String(now.getMilliseconds()).padStart(3, '0') +
                    ' ' +
                    text
            );
        }
    }

    if (!cwd) {
        return Promise.reject({ error: 'No `cwd` provided' });
    }

    if (arguments.length === 1) {
        return Promise.reject({ error: 'No search term provided' });
    }

    options.regex = options.regex || '';
    options.globs = options.globs || [];

    const rgPath = options.rgPath;

    if (!fs.existsSync(rgPath)) {
        return Promise.reject({ error: 'ripgrep executable not found (' + rgPath + ')' });
    }
    if (!fs.existsSync(cwd)) {
        return Promise.reject({ error: 'root folder not found (' + cwd + ')' });
    }

    let args = ['--no-messages', '--vimgrep', '-H', '--column', '--line-number', '--color', 'never'];
    args = args.concat(splitArgs(options.additional || ''));
    if (options.multiline) {
        args.push('-U');
    }

    if (options.patternFilePath) {
        debug('Writing pattern file:' + options.patternFilePath);
        fs.writeFileSync(options.patternFilePath, options.unquotedRegex + '\n');
    }

    if (!options.patternFilePath || !fs.existsSync(options.patternFilePath)) {
        debug('No pattern file found - passing regex in command');
        args.push('-e', options.unquotedRegex || stripOuterQuotes(options.regex));
    } else {
        args.push('-f', options.patternFilePath);
        debug('Pattern:' + options.unquotedRegex);
    }

    options.globs.forEach((glob: string) => {
        args.push('-g', glob);
    });

    if (options.filename) {
        let filename = options.filename;
        if (/^win/.test(process.platform) && filename.slice(-1) === '\\') {
            filename = filename.substring(0, filename.length - 1);
        }
        args.push(filename);
    } else {
        args.push('.');
    }

    debug('Command: ' + rgPath + ' ' + args.map(quoteArgForLog).join(' '));

    return new Promise(function (resolve, reject) {
        // The default for omitting maxBuffer, according to Node docs, is 200kB.
        // We'll explicitly give that here if a custom value is not provided.
        // Note that our options value is in KB, so we have to convert to bytes.
        const maxBuffer = (options.maxBuffer || 200) * 1024;
        currentProcess = child_process.execFile(rgPath, args, { cwd, maxBuffer });
        let results = '';

        currentProcess.stdout!.on('data', function (data) {
            debug('Search results:\n' + data);
            results += data;
        });

        currentProcess.stderr!.on('data', function (data) {
            debug('Search failed:\n' + data);
            if (options.patternFilePath && fs.existsSync(options.patternFilePath) === true) {
                fs.unlinkSync(options.patternFilePath);
            }
            reject(new RipgrepError(data.toString(), ''));
        });

        currentProcess.on('close', function (code) {
            currentProcess = undefined;
            if (options.patternFilePath && fs.existsSync(options.patternFilePath) === true) {
                fs.unlinkSync(options.patternFilePath);
            }
            resolve(formatResults(results, options.multiline));
        });
    });
}

function splitArgs(text: string): string[] {
    const args: string[] = [];
    let current = '';
    let quote: string | undefined;
    let escaped = false;

    text.split('').forEach(function (char) {
        if (escaped) {
            current += char;
            escaped = false;
        } else if (char === '\\') {
            escaped = true;
        } else if (quote) {
            if (char === quote) {
                quote = undefined;
            } else {
                current += char;
            }
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (/\s/.test(char)) {
            if (current.length > 0) {
                args.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    });

    if (escaped) {
        current += '\\';
    }
    if (current.length > 0) {
        args.push(current);
    }
    return args;
}

function stripOuterQuotes(text: string): string {
    if (typeof text !== 'string') {
        return '';
    }
    if ((text[0] === '"' && text[text.length - 1] === '"') || (text[0] === "'" && text[text.length - 1] === "'")) {
        return text.substring(1, text.length - 1);
    }
    return text;
}

function quoteArgForLog(arg: string): string {
    return /\s/.test(arg) ? '"' + arg.replace(/"/g, '\\"') + '"' : arg;
}

export function kill(): void {
    if (currentProcess !== undefined) {
        currentProcess.kill('SIGINT');
    }
}

export const __test = {
    splitArgs,
    stripOuterQuotes,
    quoteArgForLog,
};
