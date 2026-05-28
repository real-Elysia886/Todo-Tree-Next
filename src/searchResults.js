const path = require('path');

const resultsByUri = new Map();

function uriKey(uri) {
    if (uri && uri.toString) return uri.toString();
    return uri;
}

function clear() {
    resultsByUri.clear();
}

function add(result) {
    const key = uriKey(result.uri);
    let arr = resultsByUri.get(key);
    if (!arr) {
        arr = [];
        resultsByUri.set(key, arr);
    }
    arr.push(result);
}

function remove(uri) {
    resultsByUri.delete(uriKey(uri));
}

function addToTree(tree) {
    for (const arr of resultsByUri.values()) {
        for (const match of arr) {
            if (match.added !== true) {
                tree.add(match);
                match.added = true;
            }
        }
    }
}

function containsMarkdown() {
    for (const arr of resultsByUri.values()) {
        for (const match of arr) {
            if (path.extname(match.uri.fsPath) === '.md') return true;
        }
    }
    return false;
}

function count() {
    let total = 0;
    for (const arr of resultsByUri.values()) total += arr.length;
    return total;
}

function contains(result) {
    const key = uriKey(result.uri);
    const arr = resultsByUri.get(key);
    if (!arr) return false;
    return arr.some(
        (match) => match.uri === result.uri && match.line === result.line && match.column === result.column
    );
}

function markAsNotAdded() {
    for (const arr of resultsByUri.values()) {
        for (const match of arr) match.added = false;
    }
}

function filter(filterFunction) {
    for (const [key, arr] of resultsByUri) {
        const filtered = arr.filter(filterFunction);
        if (filtered.length === 0) resultsByUri.delete(key);
        else resultsByUri.set(key, filtered);
    }
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
