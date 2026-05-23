var path = require( 'path' );

var searchResults = [];

function clear()
{
    searchResults = [];
}

function add( result )
{
    searchResults.push( result );
}

function remove( uri )
{
    var uriText = uri && uri.toString ? uri.toString() : uri;
    var fsPath = uri && uri.fsPath ? uri.fsPath : undefined;

    searchResults = searchResults.filter( function( match )
    {
        if( match.uri === uri )
        {
            return false;
        }
        if( uriText && match.uri && match.uri.toString && match.uri.toString() === uriText )
        {
            return false;
        }
        if( fsPath && match.uri && match.uri.fsPath === fsPath )
        {
            return false;
        }
        return true;
    } );
}

function addToTree( tree )
{
    searchResults.map( function( match )
    {
        if( match.added !== true )
        {
            tree.add( match );
            match.added = true;
        }
    } );
}

function containsMarkdown()
{
    return searchResults.filter( function( match )
    {
        return path.extname( match.uri.fsPath ) === '.md';
    } ).length > 0;
}

function count()
{
    return searchResults.length;
}

function contains( result )
{
    return searchResults.filter( function( match )
    {
        return match.uri === result.uri && match.line == result.line && match.column == result.column;
    } ).length > 0;
}

function markAsNotAdded()
{
    searchResults.forEach( function( match )
    {
        match.added = false;
    } );
}

function filter( filterFunction )
{
    searchResults = searchResults.filter( filterFunction );
}

module.exports.clear = clear;
module.exports.add = add;
module.exports.remove = remove;
module.exports.addToTree = addToTree;
module.exports.containsMarkdown = containsMarkdown;
module.exports.count = count;
module.exports.contains = contains;
module.exports.markAsNotAdded = markAsNotAdded;
module.exports.filter = filter;
