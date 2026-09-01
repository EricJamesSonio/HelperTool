'use strict';

const path = require('path');
const grammarLoader = require('./astPatch/grammarLoader');
const { extOf } = require('./astPatch/textUtils');

// ---------------------------------------------------------------------------
// Fallback: bracket + string balance for unsupported langs
// ---------------------------------------------------------------------------
function fallbackCheck(text) {
    if (!text || !text.trim()) return null;
    const s = text.trim();
    // quick bracket counts ignoring strings/comments - simple state machine
    let brace = 0, paren = 0, bracket = 0;
    let inSingle = false, inDouble = false, inTick = false, inLineComment = false, inBlockComment = false;
    let esc = false;
    let line = 1, col = 0;
    let errLine = 0, errCol = 0, errMsg = null;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const nxt = text[i+1];
        col++;
        if (ch === '\n') { line++; col = 0; inLineComment = false; continue; }
        if (inLineComment) continue;
        if (inBlockComment) {
            if (ch === '*' && nxt === '/') { inBlockComment = false; i++; }
            continue;
        }
        if (esc) { esc = false; continue; }
        if (ch === '\\' && (inSingle || inDouble || inTick)) { esc = true; continue; }
        if (!inSingle && !inDouble && !inTick) {
            if (ch === '/' && nxt === '/') { inLineComment = true; continue; }
            if (ch === '/' && nxt === '*') { inBlockComment = true; continue; }
            if (ch === "'") { inSingle = true; continue; }
            if (ch === '"') { inDouble = true; continue; }
            if (ch === '`') { inTick = true; continue; }
            if (ch === '{') brace++;
            else if (ch === '}') { brace--; if (brace < 0 && !errMsg) { errMsg = 'unexpected closing brace `}`'; errLine=line; errCol=col; } }
            else if (ch === '(') paren++;
            else if (ch === ')') { paren--; if (paren < 0 && !errMsg) { errMsg = 'unexpected closing paren `)`'; errLine=line; errCol=col; } }
            else if (ch === '[') bracket++;
            else if (ch === ']') { bracket--; if (bracket < 0 && !errMsg) { errMsg = 'unexpected closing bracket `]`'; errLine=line; errCol=col; } }
        } else {
            if (inSingle && ch === "'") inSingle = false;
            else if (inDouble && ch === '"') inDouble = false;
            else if (inTick && ch === '`') inTick = false;
        }
    }
    if (errMsg) return { ok:false, error: errMsg, line: errLine, column: errCol, snippet: text.split('\n')[errLine-1]?.slice(0,60) || '' };
    if (brace > 0) return { ok:false, error:`missing ${brace} closing brace(s) \`}\``, line, column: col };
    if (paren > 0) return { ok:false, error:`missing ${paren} closing paren(s) \`)\``, line, column: col };
    if (bracket > 0) return { ok:false, error:`missing ${bracket} closing bracket(s) \`]\``, line, column: col };
    if (inSingle || inDouble || inTick) return { ok:false, error:'unclosed string literal', line, column: col };
    if (inBlockComment) return { ok:false, error:'unclosed block comment `/*`', line, column: col };
    // duplicate import check (simple)
    const importLines = text.split('\n').map(l=>l.trim()).filter(l=>l.startsWith('import ') && l.includes(' from '));
    const seen = new Set();
    for (const l of importLines) {
        if (seen.has(l)) return { ok:false, error:`duplicate import \`${l.slice(0,50)}\``, line: text.split('\n').findIndex(x=>x.trim()===l)+1, column:1, severity:'medium' };
        seen.add(l);
    }
    return null;
}

function htmlTagCheck(text, ext) {
    if (ext !== 'html' && ext !== 'vue') return null;
    const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\/?>/g;
    const stack = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        const full = m[0];
        const tag = m[1].toLowerCase();
        const isClose = full.startsWith('</');
        const isSelfClose = full.endsWith('/>') || voidTags.has(tag);
        if (isSelfClose) continue;
        if (isClose) {
            if (stack.length && stack[stack.length-1]===tag) stack.pop();
            else {
                // mismatched close — find opening
                const idx = stack.lastIndexOf(tag);
                if (idx !== -1) stack.splice(idx,1);
                else {
                    // extra close without open — ignore for permissive check
                }
            }
        } else {
            stack.push(tag);
        }
    }
    if (stack.length) {
        return { ok:false, error:`unclosed tag <${stack[stack.length-1]}>`, line: text.split('\n').length, column:1 };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Tree-sitter path
// ---------------------------------------------------------------------------
function findErrorNode(node) {
    if (node.type === 'ERROR' || node.isMissing()) return node;
    for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        const found = findErrorNode(c);
        if (found) return found;
    }
    return null;
}

async function treeSitterCheck(text, ext) {
    const langMap = grammarLoader.EXT_LANG;
    let lang = langMap[ext];
    if (!lang && ext === 'json') lang = 'javascript';
    if (!lang && ext === 'html') lang = 'html';
    if (!lang) return null;
    const tree = await grammarLoader.tryParseSource(lang, text);
    if (!tree) return null;
    const root = tree.rootNode;
    if (!root.hasError()) {
        // still check for MISSING nodes (e.g. missing } that tree-sitter inserts as missing)
        const missing = findErrorNode(root);
        if (!missing) return null;
        // missing nodes have isMissing() true — treat as error
        if (!missing.isMissing()) return null;
    }
    const err = findErrorNode(root);
    if (!err) {
        // hasError but no ERROR node found — generic
        return { ok:false, error:'syntax error — parse failed', line:1, column:1 };
    }
    const sp = err.startPosition;
    const snippet = text.split('\n')[sp.row]?.slice(sp.column, sp.column+60) || err.text?.slice(0,60) || '';
    const missing = err.isMissing();
    const msg = missing
        ? `missing \`${err.type}\` at line ${sp.row+1}`
        : `unexpected \`${(err.text||err.type).slice(0,40)}\` at line ${sp.row+1}`;
    return { ok:false, error: msg, line: sp.row+1, column: sp.column+1, snippet };
}

function jsonCheck(text, ext) {
    if (ext !== 'json') return null;
    try { JSON.parse(text); return null; } catch (e) {
        const m = e.message || 'invalid JSON';
        let line = 1;
        const posM = m.match(/position\s+(\d+)/i);
        if (posM) {
            const pos = parseInt(posM[1],10);
            line = text.slice(0, pos).split('\n').length;
        }
        return { ok:false, error: `invalid JSON — ${m.slice(0,80)}`, line, column:1 };
    }
}

/**
 * Verify text for given ext. Returns null if ok / unsupported, or {ok:false, error, line, column, snippet, severity}
 */
async function verifySyntax(text, ext) {
    if (!text || !text.trim()) return null;
    const e = (ext||'').toLowerCase().replace(/^\./,'');
    // JSON strict check first — catches polluted package.json (json + plain list)
    if (e === 'json') {
        const jc = jsonCheck(text, e);
        if (jc) return jc;
    }
    // Very short content — skip (handled by isTruncatedContent)
    if (text.trim().length < 10) return null;

    // Try tree-sitter first
    try {
        const ts = await treeSitterCheck(text, e);
        if (ts && !ts.ok) return ts;
        // Even if tree-sitter says ok, run fallback for bracket/duplicate checks (php/vue are permissive)
        const fb = fallbackCheck(text);
        // For supported langs, only surface fallback if it's a bracket/string error, not duplicate import noise
        if (fb && !fb.ok) {
            // if tree-sitter already said ok, only report bracket/string errors, not duplicate imports
            if (fb.error.includes('brace') || fb.error.includes('paren') || fb.error.includes('bracket') || fb.error.includes('unclosed') || fb.error.includes('unexpected closing')) {
                return fb;
            }
            // duplicate import is medium severity — still surface
            if (fb.severity === 'medium') return fb;
        }
        // HTML/Vue tag check
        if (e === 'html' || e === 'vue') {
            const tagErr = htmlTagCheck(text, e);
            if (tagErr) return tagErr;
        }
        if (ts) return null; // tree-sitter ok and no bracket error
    } catch (_) {
        // fall through to fallback
    }
    // Unsupported lang — fallback only
    const fb = fallbackCheck(text);
    if (fb && !fb.ok) return fb;
    if (e === 'html' || e === 'vue') {
        const tagErr = htmlTagCheck(text, e);
        if (tagErr) return tagErr;
    }
    return null;
}

module.exports = { verifySyntax, fallbackCheck };
