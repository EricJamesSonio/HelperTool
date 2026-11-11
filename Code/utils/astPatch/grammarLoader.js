'use strict';

const fs = require('fs');
const path = require('path');
const WTS = require('web-tree-sitter');
const Parser = WTS.Parser || WTS.default || WTS;
const Language = WTS.Language || (WTS.Parser && WTS.Parser.Language) || Parser.Language;
const GRAMMAR_DIR = path.join(__dirname, '..', '..', 'grammars');
const RUNTIME_WASM = 'web-tree-sitter.wasm';

const EXT_LANG = {
    css: 'css', scss: 'css',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    php: 'php',
    vue: 'vue',
    html: 'html', htm: 'html',
};

let initPromise = null;
let wasmDirCache = null;
const langCache = new Map();

function unpackedVariant(dir) {
    return dir.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
}

function candidateDirs() {
    const base = [];
    try {
        base.push(path.dirname(require.resolve('web-tree-sitter')));
    } catch {}
    base.push(path.join(__dirname, '..', '..', 'node_modules', 'web-tree-sitter'));
    try {
        const appPath = require('electron').app.getAppPath();
        base.push(path.join(appPath, 'node_modules', 'web-tree-sitter'));
    } catch {}
    if (process.resourcesPath) {
        base.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'web-tree-sitter'));
        base.push(path.join(process.resourcesPath, 'app.asar', 'node_modules', 'web-tree-sitter'));
        base.push(path.join(process.resourcesPath, 'app', 'node_modules', 'web-tree-sitter'));
    }
    const out = [];
    for (const dir of base) {
        const unpacked = unpackedVariant(dir);
        if (unpacked !== dir) out.push(unpacked);
        out.push(dir);
    }
    return out;
}

function resolveWasmDir() {
    if (wasmDirCache) return wasmDirCache;
    const dirs = candidateDirs();
    for (const dir of dirs) {
        try {
            if (fs.existsSync(path.join(dir, RUNTIME_WASM))) {
                wasmDirCache = dir;
                return dir;
            }
        } catch {}
    }
    return dirs.length ? dirs[dirs.length - 1] : path.join(__dirname, '..', '..', 'node_modules', 'web-tree-sitter');
}

async function ensureInit() {
    if (!initPromise) {
        initPromise = Parser.init({
            locateFile: (file) => path.join(resolveWasmDir(), file),
        });
    }
    return initPromise;
}

async function loadLanguage(lang) {
    if (langCache.has(lang)) return langCache.get(lang);
    await ensureInit();
    const wasmPath = path.join(GRAMMAR_DIR, `tree-sitter-${lang}.wasm`);
    const LangCtor = Language || Parser.Language;
    const Lang = await LangCtor.load(wasmPath);
    langCache.set(lang, Lang);
    return Lang;
}

async function tryLoadLanguage(lang) {
    try {
        return await loadLanguage(lang);
    } catch (err) {
        return null;
    }
}

async function parseSource(lang, source) {
    const Lang = await loadLanguage(lang);
    const parser = new Parser();
    parser.setLanguage(Lang);
    return parser.parse(source);
}

async function tryParseSource(lang, source) {
    const Lang = await tryLoadLanguage(lang);
    if (!Lang) return null;
    const parser = new Parser();
    parser.setLanguage(Lang);
    return parser.parse(source);
}

module.exports = { EXT_LANG, ensureInit, loadLanguage, tryLoadLanguage, parseSource, tryParseSource };