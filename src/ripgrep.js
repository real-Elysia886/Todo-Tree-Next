/* jshint esversion:6, node: true */
/* eslint-env node */

/**
 * This is a modified version of the ripgrep-js module from npm
 * written by alexlafroscia (github.com/alexlafroscia/ripgrep-js)
 * Instead of assuming that ripgrep is in the users path, it uses the
 * ripgrep binary downloaded via vscode-ripgrep.
 */

'use strict';
const child_process = require( 'child_process' );
const fs = require( 'fs' );
const utils = require( './utils' );

var currentProcess;

function RipgrepError( error, stderr )
{
    this.message = error;
    this.stderr = stderr;
}

function formatResults( stdout, multiline )
{
    stdout = stdout.trim();

    if( !stdout )
    {
        return [];
    }

    if( multiline === true )
    {
        var results = [];
        var regex = utils.getRegexForEditorSearch( true );
        var lines = stdout.split( '\n' );

        var buffer = [];
        var matches = [];
        var text = "";

        lines.map( function( line )
        {
            var resultMatch = new Match( line );
            buffer.push( line );
            matches.push( resultMatch );

            text = ( text === "" ) ? resultMatch.match : text + '\n' + resultMatch.match;

            var fullMatch = text.match( regex );
            if( fullMatch )
            {
                resultMatch = matches[ 0 ];
                matches.shift();
                resultMatch.extraLines = matches;
                results.push( resultMatch );
                buffer = [];
                matches = [];
                text = "";
            }
        } );

        return results;
    }

    return stdout
        .split( '\n' )
        .map( ( line ) => new Match( line ) );
}

module.exports.search = function ripGrep( cwd, options )
{
    function debug( text )
    {
        if( options.outputChannel )
        {
            var now = new Date();
            options.outputChannel.appendLine( now.toLocaleTimeString( 'en', { hour12: false } ) + "." + String( now.getMilliseconds() ).padStart( 3, '0' ) + " " + text );
        }
    }

    if( !cwd )
    {
        return Promise.reject( { error: 'No `cwd` provided' } );
    }

    if( arguments.length === 1 )
    {
        return Promise.reject( { error: 'No search term provided' } );
    }

    options.regex = options.regex || '';
    options.globs = options.globs || [];

    var rgPath = options.rgPath;

    if( !fs.existsSync( rgPath ) )
    {
        return Promise.reject( { error: "ripgrep executable not found (" + rgPath + ")" } );
    }
    if( !fs.existsSync( cwd ) )
    {
        return Promise.reject( { error: "root folder not found (" + cwd + ")" } );
    }

    var args = [ '--no-messages', '--vimgrep', '-H', '--column', '--line-number', '--color', 'never' ];
    args = args.concat( splitArgs( options.additional || '' ) );
    if( options.multiline )
    {
        args.push( '-U' );
    }

    if( options.patternFilePath )
    {
        debug( "Writing pattern file:" + options.patternFilePath );
        fs.writeFileSync( options.patternFilePath, options.unquotedRegex + '\n' );
    }

    if( !options.patternFilePath || !fs.existsSync( options.patternFilePath ) )
    {
        debug( "No pattern file found - passing regex in command" );
        args.push( '-e', options.unquotedRegex || stripOuterQuotes( options.regex ) );
    }
    else
    {
        args.push( '-f', options.patternFilePath );
        debug( "Pattern:" + options.unquotedRegex );
    }

    options.globs.forEach( ( glob ) =>
    {
        args.push( '-g', glob );
    } );

    if( options.filename )
    {
        var filename = options.filename;
        if( /^win/.test( process.platform ) && filename.slice( -1 ) === "\\" )
        {
            filename = filename.substring( 0, filename.length - 1 );
        }
        args.push( filename );
    }
    else
    {
        args.push( "." );
    }

    debug( "Command: " + rgPath + " " + args.map( quoteArgForLog ).join( " " ) );

    return new Promise( function( resolve, reject )
    {
        // The default for omitting maxBuffer, according to Node docs, is 200kB.
        // We'll explicitly give that here if a custom value is not provided.
        // Note that our options value is in KB, so we have to convert to bytes.
        const maxBuffer = ( options.maxBuffer || 200 ) * 1024;
        currentProcess = child_process.execFile( rgPath, args, { cwd, maxBuffer } );
        var results = "";

        currentProcess.stdout.on( 'data', function( data )
        {
            debug( "Search results:\n" + data );
            results += data;
        } );

        currentProcess.stderr.on( 'data', function( data )
        {
            debug( "Search failed:\n" + data );
            if( options.patternFilePath && fs.existsSync( options.patternFilePath ) === true )
            {
                fs.unlinkSync( options.patternFilePath );
            }
            reject( new RipgrepError( data, "" ) );
        } );

        currentProcess.on( 'close', function( code )
        {
            currentProcess = undefined;
            if( options.patternFilePath && fs.existsSync( options.patternFilePath ) === true )
            {
                fs.unlinkSync( options.patternFilePath );
            }
            resolve( formatResults( results, options.multiline ) );
        } );

    } );
};

function splitArgs( text )
{
    var args = [];
    var current = "";
    var quote;
    var escaped = false;

    text.split( "" ).forEach( function( char )
    {
        if( escaped )
        {
            current += char;
            escaped = false;
        }
        else if( char === "\\" )
        {
            escaped = true;
        }
        else if( quote )
        {
            if( char === quote )
            {
                quote = undefined;
            }
            else
            {
                current += char;
            }
        }
        else if( char === '"' || char === "'" )
        {
            quote = char;
        }
        else if( /\s/.test( char ) )
        {
            if( current.length > 0 )
            {
                args.push( current );
                current = "";
            }
        }
        else
        {
            current += char;
        }
    } );

    if( escaped )
    {
        current += "\\";
    }
    if( current.length > 0 )
    {
        args.push( current );
    }
    return args;
}

function stripOuterQuotes( text )
{
    if( typeof text !== "string" )
    {
        return "";
    }
    if( ( text[ 0 ] === '"' && text[ text.length - 1 ] === '"' ) ||
        ( text[ 0 ] === "'" && text[ text.length - 1 ] === "'" ) )
    {
        return text.substring( 1, text.length - 1 );
    }
    return text;
}

function quoteArgForLog( arg )
{
    return /\s/.test( arg ) ? '"' + arg.replace( /"/g, '\\"' ) + '"' : arg;
}

module.exports.kill = function()
{
    if( currentProcess !== undefined )
    {
        currentProcess.kill( 'SIGINT' );
    }
};

class Match
{
    constructor( matchText )
    {
        // Detect file, line number and column which is formatted in the
        // following format: {file}:{line}:{column}:{code match}
        var regex = RegExp( /^(?<file>.*):(?<line>\d+):(?<column>\d+):(?<todo>.*)/ );

        var match = regex.exec( matchText );
        if( match && match.groups )
        {
            this.fsPath = match.groups.file;
            this.line = parseInt( match.groups.line );
            this.column = parseInt( match.groups.column );
            this.match = match.groups.todo;
        }
        else // Fall back to old method
        {
            this.fsPath = "";

            if( matchText.length > 1 && matchText[ 1 ] === ':' )
            {
                this.fsPath = matchText.substr( 0, 2 );
                matchText = matchText.substr( 2 );
            }
            var parts = matchText.split( ':' );
            var hasColumn = ( parts.length === 4 );
            this.fsPath += parts.shift();
            this.line = parseInt( parts.shift() );
            if( hasColumn === true )
            {
                this.column = parseInt( parts.shift() );
            }
            else
            {
                this.column = 1;
            }
            this.match = parts.join( ':' );

        }
    }
}

module.exports.Match = Match;

module.exports.__test = {
    splitArgs,
    stripOuterQuotes,
    quoteArgForLog
};
