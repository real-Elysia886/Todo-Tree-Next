/* jshint esversion:6, node: true */

const fs = require( 'fs' );
const path = require( 'path' );

const exe = process.platform === 'win32' ? 'todo-scanner.exe' : 'todo-scanner';
const source = path.join( __dirname, 'scanner', 'target', 'release', exe );
const destinationFolder = path.join( __dirname, 'bin' );
const destination = path.join( destinationFolder, exe );

if( !fs.existsSync( source ) )
{
    throw new Error( 'Rust scanner binary not found: ' + source );
}

if( !fs.existsSync( destinationFolder ) )
{
    fs.mkdirSync( destinationFolder, { recursive: true } );
}

fs.copyFileSync( source, destination );
console.log( 'Copied Rust scanner to ' + destination );

