'use strict';

const path = require('path');
const WTS = require('web-tree-sitter');
const Parser = WTS.Parser || WTS.default || WTS;
const Language = WTS.Language || (WTS.Parser && WTS.Parser.Language) || Parser.Language;
const GRAMMAR_DIR = path.join(__dirname, '..', '..', 'grammars');

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
const langCache = new Map();

async function ensureInit() {
    if (!initPromise) initPromise = Parser.init({
        locateFile: (file) => {
            try {
                if (process.resourcesPath) {
                    return path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'web-tree-sitter', file);
                }
            } catch {}
            try {
                const appPath = require('electron').app.getAppPath();
                return path.join(appPath, 'node_modules', 'web-tree-sitter', file);
            } catch {}
            return path.join(__dirname, '..', '..', 'node_modules', 'web-tree-sitter', file);
        },
    });
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