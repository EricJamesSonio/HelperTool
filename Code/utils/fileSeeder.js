'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const astPatch = require('./astPatch');
const syntaxVerifier = require('./syntaxVerifier');
const { extOf } = require('./astPatch/textUtils');

const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.turbo',
    '.vscode', '.idea', 'coverage', '__pycache__', 'vendor', '.cache',
]);

const MAX_SEARCH_DEPTH = 6;
const MAX_DIRS_SCANNED = 6000;
const MIN_VERIFY_LEN = 20;

function isTruncatedContent(content) {
    if (!content || content.trim().length < MIN_VERIFY_LEN) return null;
    const s = content.trim();
    // String-aware unbalanced check — skip inside ', ", `, //, /* */
    let openBrace = 0, closeBrace = 0, openParen = 0, closeParen = 0, openBracket = 0, closeBracket = 0;
    let inSingle = false, inDouble = false, inTick = false, inLineComment = false, inBlockComment = false;
    let esc = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        const nxt = s[i+1];
        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
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
            if (ch === '{') openBrace++;
            else if (ch === '}') closeBrace++;
            else if (ch === '(') openParen++;
            else if (ch === ')') closeParen++;
            else if (ch === '[') openBracket++;
            else if (ch === ']') closeBracket++;
        } else {
            if (inSingle && ch === "'") inSingle = false;
            else if (inDouble && ch === '"') inDouble = false;
            else if (inTick && ch === '`') inTick = false;
        }
    }
    if (openBrace > closeBrace || openParen > closeParen || openBracket > closeBracket) {
        return `content may be truncated — unbalanced ${openBrace>closeBrace?'braces':openParen>closeParen?'parens':'brackets'}`;
    }
    // Ends with dangling syntax that suggests truncation
    if (/[,\:\(\[\{=]$/.test(s) || s.endsWith('=>')) {
        return `content may be truncated — ends with "${s.slice(-10)}"`;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Helpers: smart anchoring
// ---------------------------------------------------------------------------

/**
 * BFS search for all files named `targetName` under `basePath`.
 * Returns absolute file paths, shallowest first, up to 12 candidates.
 */
function findFileCandidates(basePath, targetName, opts = {}) {
    const maxDepth = opts.maxDepth ?? MAX_SEARCH_DEPTH;
    const ignore   = opts.ignore   ?? IGNORE_DIRS;
    const lower    = targetName.toLowerCase();
    const results  = [];
    const queue    = [{ dir: basePath, depth: 0 }];
    let scanned    = 0;
    while (queue.length && scanned < MAX_DIRS_SCANNED) {
        const { dir, depth } = queue.shift();
        if (depth > maxDepth) continue;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const ent of entries) {
            if (ent.isDirectory()) {
                if (ignore.has(ent.name)) continue;
                if (ent.name.startsWith('.') && !ignore.has(ent.name)) continue;
                scanned++;
                const abs = path.join(dir, ent.name);
                if (depth + 1 <= maxDepth) queue.push({ dir: abs, depth: depth + 1 });
                if (scanned >= MAX_DIRS_SCANNED) break;
                continue;
            }
            if (ignore.has(ent.name)) continue;
            if (ent.name.toLowerCase() === lower) {
                results.push(path.join(dir, ent.name));
                if (results.length >= 12) return results;
            }
        }
    }
    results.sort((a, b) => {
        const da = a.split(path.sep).length;
        const db = b.split(path.sep).length;
        if (da !== db) return da - db;
        return a.localeCompare(b);
    });
    return results;
}

/**
 * BFS search for all directories named `targetName` under `basePath`.
 * Returns absolute paths, shallowest first, up to 12 candidates.
 */
function findCandidates(basePath, targetName, opts = {}) {
    const maxDepth = opts.maxDepth ?? MAX_SEARCH_DEPTH;
    const ignore   = opts.ignore   ?? IGNORE_DIRS;
    const lower    = targetName.toLowerCase();
    const results  = [];
    const queue    = [{ dir: basePath, depth: 0 }];
    let scanned    = 0;

    while (queue.length && scanned < MAX_DIRS_SCANNED) {
        const { dir, depth } = queue.shift();
        if (depth > maxDepth) continue;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const ent of entries) {
            if (!ent.isDirectory()) continue;
            if (ignore.has(ent.name)) continue;
            // hidden except .?  skip dot-directories besides ignore list
            if (ent.name.startsWith('.') && !ignore.has(ent.name)) {
                // allow .config etc? keep skipping dot to avoid noise
                continue;
            }
            scanned++;
            const abs = path.join(dir, ent.name);
            if (ent.name.toLowerCase() === lower) {
                results.push(abs);
                if (results.length >= 12) return results;
            }
            // enqueue children regardless — nested components/components case
            if (depth + 1 <= maxDepth) {
                queue.push({ dir: abs, depth: depth + 1 });
            }
            if (scanned >= MAX_DIRS_SCANNED) break;
        }
    }
    // shallowest first (BFS already), then alphabetical for stability
    results.sort((a, b) => {
        const da = a.split(path.sep).length;
        const db = b.split(path.sep).length;
        if (da !== db) return da - db;
        return a.localeCompare(b);
    });
    return results;
}

/**
 * Resolve a pasted relPath like "components/sheet-builder/Foo.tsx"
 * against basePath via smart anchoring on first segment.
 * Returns { resolved, candidates, ambiguous }.
 */
function resolveRelPath(basePath, relPath, cache) {
    const norm = relPath.replace(/\\/g, '/').replace(/^\.?\//, '');
    const parts = norm.split('/').filter(Boolean);
    if (!parts.length) return { resolved: norm, candidates: [], ambiguous: false };
    if (parts.length === 1) {
        // bare file like package.json, main.js, .gitignore — search anywhere
        const absRoot = path.join(basePath, norm);
        const key = `__file:${norm.toLowerCase()}`;
        let fileCands = cache.get(key);
        if (fileCands === undefined) {
            fileCands = findFileCandidates(basePath, norm);
            cache.set(key, fileCands);
        }
        if (!fileCands.length) return { resolved: norm, candidates: [], ambiguous: false };
        const rels = fileCands.map(abs => path.relative(basePath, abs).replace(/\\/g, '/'));
        const rootExists = fs.existsSync(absRoot);
        const filteredRels = rels.filter(r => r !== norm);
        // Distinct resolved paths: root creation target (norm via '') + unique existing rels
        // Root sentinel '' always represents `norm` even when file doesn't exist yet (create at root)
        const totalDistinct = 1 + filteredRels.length; // '' + filteredRels
        if (totalDistinct <= 1) {
            // Only one existing file and it's at root, no alternative
            if (rootExists) return { resolved: norm, candidates: [norm], ambiguous: false };
            // No file at all shouldn't happen here (rels empty handled above), fall through
            return { resolved: norm, candidates: [], ambiguous: false };
        }
        // If only one distinct existing location but it's not root, still offer root-create vs nested-overwrite
        // e.g. single nested package.json at renderer/nested/package.json → candidates ["", "renderer/nested/package.json"]
        const all = [''].concat(rels); // '' = Root option (resolves to norm)
        const seen = new Set();
        const deduped = [];
        for (const c of all) {
            const resolvedForCand = c === '' ? norm : c;
            if (!seen.has(resolvedForCand)) {
                seen.add(resolvedForCand);
                deduped.push(c);
            }
        }
        // deduped length 1 means only root exists (already handled), but double-check
        if (deduped.length <= 1) {
            return { resolved: norm, candidates: deduped.length ? deduped : [norm], ambiguous: false };
        }
        if (rootExists) {
            return { resolved: norm, candidates: deduped, ambiguous: true };
        }
        // Root doesn't exist: default to shallowest nested, but offer root create choice
        return { resolved: rels[0], candidates: deduped, ambiguous: true };
    }

    const seg = parts[0];
    // cache per seg to avoid re-scanning same folder many times per batch
    let cands = cache.get(seg.toLowerCase());
    if (cands === undefined) {
        cands = findCandidates(basePath, seg);
        cache.set(seg.toLowerCase(), cands);
    }

    if (!cands.length) {
        return { resolved: norm, candidates: [], ambiguous: false };
    }
    const rest = parts.slice(1).join('/');
    // candidates as rel paths from base (for preview display)
    // Prepend '' as "root" option — file goes directly under basePath
    const relCands = [''].concat(cands.map(abs => path.relative(basePath, abs).replace(/\\/g, '/')));
    if (cands.length === 1) {
        const anchored = path.posix.join(relCands[1], rest);
        return { resolved: anchored, candidates: relCands, ambiguous: true };
    }
    // ambiguous — default to first/shallowest but expose all
    const anchored = path.posix.join(relCands[1], rest);
    return { resolved: anchored, candidates: relCands, ambiguous: true };
}

function toPosixRel(basePath, absPath) {
    return path.relative(basePath, absPath).replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Structure mode — rooted at basePath (no anchoring)
// ---------------------------------------------------------------------------

function preview(basePath, relPaths) {
    const toCreate = [];
    const toSkip   = [];

    for (const rel of relPaths) {
        const abs = path.join(basePath, rel);
        if (fs.existsSync(abs)) {
            toSkip.push(rel);
        } else {
            toCreate.push(rel);
        }
    }

    return { toCreate, toSkip };
}

function seed(basePath, relPaths) {
    const created = [];
    const errors  = [];

    for (const rel of relPaths) {
        const abs = path.join(basePath, rel);
        try {
            const dir = path.dirname(abs);
            fs.mkdirSync(dir, { recursive: true });

            if (fs.existsSync(abs)) continue;

            fs.writeFileSync(abs, '', 'utf-8');
            created.push(rel);
        } catch (err) {
            errors.push({ path: rel, error: err.message });
        }
    }

    return { created, errors };
}

// ---------------------------------------------------------------------------
// Content mode — smart-anchored
// ---------------------------------------------------------------------------

const SURGICAL_MODES = new Set(['update', 'replace', 'addafter', 'addbefore', 'remove']);
function isSurgical(mode) { return SURGICAL_MODES.has((mode||'').toLowerCase().replace(/\s+/g,'')); }
function isPlainNoGrammarExt(ext) {
    const e = (ext||'').toLowerCase();
    if (!e) return true; // .gitignore, .env, no ext
    const { EXT_LANG } = require('./astPatch/grammarLoader');
    if (EXT_LANG[e]) return false;
    if (e === 'json') return false;
    return true;
}
function patchPlainText(source, target, newContent, mode) {
    const m = (mode||'').toLowerCase().replace(/\s+/g,'');
    if (target === 'end') {
        const needsNL = source && !source.endsWith('\n');
        const ins = (needsNL ? '\n' : '') + (newContent||'').trim() + '\n';
        return source + ins;
    }
    // for plain text other targets, just append (safe fallback)
    return null;
}

async function computePatchedRight(basePath, resolved, entriesForFile, left) {
    let right = left;
    const fullEntries = entriesForFile.filter(e => !isSurgical(e.mode||'full'));
    if (fullEntries.length) right = fullEntries[fullEntries.length - 1].content ?? '';
    // plain text files with target 'end' can be patched without temp file
    const plainExt = extOf(resolved);
    const isPlain = isPlainNoGrammarExt(plainExt);
    if (isPlain) {
        for (const e of entriesForFile) {
            const m = (e.mode||'').toLowerCase().replace(/\s+/g,'');
            if (!isSurgical(m)) continue;
            if (e.target === 'end') {
                const patched = patchPlainText(right, e.target, e.content ?? '', m);
                if (patched !== null) right = patched;
            }
        }
        // if we handled plain text end, return early if no ast patches remain
        const hasAst = entriesForFile.some(e=> isSurgical(e.mode) && e.target !== 'end');
        if (!hasAst) return right;
    }
    const ext = path.extname(path.join(basePath, resolved)) || '.txt';
    const tmpFile = path.join(os.tmpdir(), `gs-patched-${Date.now()}-${Math.random().toString(36).slice(2,6)}${ext}`);
    try {
        fs.writeFileSync(tmpFile, right, 'utf-8');
        for (const e of entriesForFile) {
            const m = (e.mode||'').toLowerCase().replace(/\s+/g,'');
            if (!isSurgical(m)) continue;
            const effMode = m === 'replace' ? 'update' : m;
            let res;
            if (effMode === 'addafter') res = await astPatch.applyAddAfter(tmpFile, e.target, e.content ?? '');
            else if (effMode === 'addbefore') res = await astPatch.applyAddBefore(tmpFile, e.target, e.content ?? '');
            else if (effMode === 'remove') res = await astPatch.applyRemove(tmpFile, e.target);
            else res = await astPatch.applyUpdate(tmpFile, e.target, e.content ?? '');
        }
        right = fs.readFileSync(tmpFile, 'utf-8');
    } finally { try { fs.unlinkSync(tmpFile); } catch {} }
    return right;
}

async function previewContent(basePath, entries) {
    const toCreate    = [];
    const toOverwrite = [];
    const toPatch     = [];
    const warnings    = [];
    const details     = [];
    const cache       = new Map();

    for (const { relPath, mode, target, content } of entries) {
        const { resolved, candidates, ambiguous } = resolveRelPath(basePath, relPath, cache);
        const abs = path.join(basePath, resolved);
        const exists = fs.existsSync(abs);

        let warning = null;
        let effMode = mode ?? 'full';
        const surgical = isSurgical(effMode);
        // Check for likely truncated content (unbalanced braces or ends with dangling syntax)
        const truncWarning = isTruncatedContent(content || '');
        if (truncWarning) warning = (warning ? warning + '; ' : '') + truncWarning;

        // For full-mode entries, verify the pasted content itself (basic structure)
        if (!surgical && content && content.trim().length >= MIN_VERIFY_LEN) {
            try {
                const v = await syntaxVerifier.verifySyntax(content, extOf(resolved));
                if (v && !v.ok) {
                    const syn = `syntax error — ${v.error}` + (v.line ? ` at line ${v.line}` : '');
                    warning = (warning ? warning + '; ' : '') + syn;
                }
            } catch (_) {}
        } else if (!surgical && content && content.trim().length >= MIN_VERIFY_LEN / 2 && content.trim().length < MIN_VERIFY_LEN) {
            // Transitional: keep B3 extraClose (15 chars, close>open) flagged while unifying to 20
            try {
                const v = await syntaxVerifier.verifySyntax(content, extOf(resolved));
                if (v && !v.ok && v.error.includes('unexpected closing')) {
                    const syn = `syntax error — ${v.error}` + (v.line ? ` at line ${v.line}` : '');
                    warning = (warning ? warning + '; ' : '') + syn;
                }
            } catch (_) {}
        }

        if (surgical) {
            const plainEnd = isPlainNoGrammarExt(extOf(resolved)) && target === 'end';
            if (!exists && effMode !== 'addAfter' && effMode !== 'addBefore' && !plainEnd) {
                // remove/replace on non-existent file will fallback
                warning = (warning ? warning + '; ' : '') + `file not found — will create full file`;
            } else if (target && exists) {
                if (plainEnd) {
                    // plain text append always ok — no warning
                } else {
                    try {
                        const check = await astPatch.canPatch(abs, target, effMode);
                        if (!check.ok) {
                            warning = (warning ? warning + '; ' : '') + check.reason;
                        }
                    } catch (e) {
                        warning = (warning ? warning + '; ' : '') + e.message;
                    }
                }
            } else if (!target && effMode !== 'addAfter' && effMode !== 'addBefore') {
                warning = (warning ? warning + '; ' : '') + `surgical mode requires a target`;
            }
            toPatch.push(resolved);
        } else {
            if (exists) toOverwrite.push(resolved);
            else toCreate.push(resolved);
        }

        details.push({
            original: relPath,
            resolved,
            candidates,
            ambiguous,
            exists,
            mode: effMode,
            target: target ?? null,
            warning,
        });
        if (warning) warnings.push({ path: resolved, warning });
    }

    // Second pass: for surgical batches, verify the *patched* result per resolved file
    // so the preview list shows "syntax error" before the user clicks into diff.
    try {
        const groups = new Map();
        for (let i = 0; i < details.length; i++) {
            const d = details[i];
            if (!isSurgical(d.mode)) continue;
            if (!groups.has(d.resolved)) groups.set(d.resolved, []);
            groups.get(d.resolved).push(i);
        }
        for (const [resolved, idxs] of groups) {
            const abs = path.join(basePath, resolved);
            const exists = fs.existsSync(abs);
            const left = exists ? fs.readFileSync(abs, 'utf-8') : '';
            const groupEntries = idxs.map(i => entries[i]).filter(Boolean);
            const right = await computePatchedRight(basePath, resolved, groupEntries, left);
            const v = await syntaxVerifier.verifySyntax(right, extOf(resolved));
            let extra = null;
            if (v && !v.ok) {
                extra = `syntax error — ${v.error}` + (v.line ? ` at line ${v.line}` : '');
            }
            const trunc = isTruncatedContent(right);
            if (trunc) extra = extra ? extra + '; ' + trunc : trunc;
            if (extra) {
                for (const i of idxs) {
                    const d = details[i];
                    d.warning = d.warning ? d.warning + '; ' + extra : extra;
                }
                const existing = warnings.find(w=>w.path===resolved && w.warning.includes(extra));
                if (!existing) warnings.push({ path: resolved, warning: extra });
            }
        }
    } catch (_) {}

    return { toCreate, toOverwrite, toPatch, details, warnings };
}

async function seedContent(basePath, entries) {
    const created     = [];
    const overwritten = [];
    const patched     = [];
    const errors      = [];
    const notices     = [];
    const cache       = new Map();

    for (const entry of entries) {
        const { relPath, content, resolved: providedResolved, mode, target } = entry;
        let resolved;
        let candidates = [];
        let ambiguous  = false;
        if (providedResolved) {
            resolved = providedResolved;
        } else {
            const r = resolveRelPath(basePath, relPath, cache);
            resolved = r.resolved;
            candidates = r.candidates;
            ambiguous  = r.ambiguous;
        }
        const abs = path.join(basePath, resolved);
        try {
            const dir = path.dirname(abs);
            fs.mkdirSync(dir, { recursive: true });
            const existed = fs.existsSync(abs);

            const surgical = isSurgical(mode);
            if (surgical && target) {
                const plainEndSeed = isPlainNoGrammarExt(extOf(resolved)) && target === 'end';
                if (!existed) {
                    const n = (mode||'').toLowerCase().replace(/\s+/g,'');
                    if (n === 'addafter' || n === 'addbefore' || plainEndSeed) {
                        fs.writeFileSync(abs, content ?? '', 'utf-8');
                        patched.push(resolved);
                        continue;
                    }
                    errors.push({ path: resolved, original: relPath, warning: `patch fallback: file not found — created full file` });
                    // fall through to full create below
                } else {
                    if (plainEndSeed) {
                        const src = fs.readFileSync(abs, 'utf-8');
                        const patchedText = patchPlainText(src, target, content ?? '', mode);
                        if (patchedText !== null) {
                            fs.writeFileSync(abs, patchedText, 'utf-8');
                            patched.push(resolved);
                            continue;
                        }
                    }
                    const normMode = (mode||'').toLowerCase().replace(/\s+/g,'');
                    const effMode = normMode === 'replace' ? 'update' : normMode;
                    let result;
                    if (effMode === 'addafter') result = await astPatch.applyAddAfter(abs, target, content ?? '');
                    else if (effMode === 'addbefore') result = await astPatch.applyAddBefore(abs, target, content ?? '');
                    else if (effMode === 'remove') result = await astPatch.applyRemove(abs, target);
                    else result = await astPatch.applyUpdate(abs, target, content ?? '');
                    if (result.ok) {
                        patched.push(resolved);
                        if (result.restoredPrefix) {
                            notices.push({ path: resolved, original: relPath, notice: `auto-restored "${result.restoredPrefix}" — your pasted replacement was missing it` });
                        }
                        continue;
                    }
                    // Do not fallback to full overwrite for surgical batch — just warn and skip, keep file as-is (or with prior patches)
                    errors.push({ path: resolved, original: relPath, warning: `patch skipped: ${result.reason}` });
                    continue;
                }
            }

            fs.writeFileSync(abs, content ?? '', 'utf-8');
            if (existed) overwritten.push(resolved);
            else created.push(resolved);
        } catch (err) {
            errors.push({ path: resolved, original: relPath, candidates, ambiguous, error: err.message });
        }
    }

    return { created, overwritten, patched, errors, notices };
}

async function getPatchedPreview(basePath, resolved, allEntries) {
    const abs = path.join(basePath, resolved);
    const exists = fs.existsSync(abs);
    let left = exists ? fs.readFileSync(abs, 'utf-8') : '';
    const cache = new Map();
    const mapped = allEntries.map(e => ({ ...e, resolved: e.resolved || resolveRelPath(basePath, e.relPath, cache).resolved }));
    const entriesForFile = mapped.filter(e => e.resolved === resolved);
    if (!entriesForFile.length) {
        return { left, right: left };
    }
    const hasSurgical = entriesForFile.some(e => isSurgical(e.mode));
    if (!hasSurgical) {
        const last = entriesForFile[entriesForFile.length - 1];
        const right = last.content ?? '';
        try {
            const v = await syntaxVerifier.verifySyntax(right, extOf(resolved));
            if (v && !v.ok) return { left, right, syntaxError: v };
            const trunc = isTruncatedContent(right);
            if (trunc) return { left, right, syntaxError: { ok:false, error: trunc } };
        } catch (_) {}
        return { left, right };
    }
    const right = await computePatchedRight(basePath, resolved, entriesForFile, left);
    try {
        const v = await syntaxVerifier.verifySyntax(right, extOf(resolved));
        if (v && !v.ok) return { left, right, syntaxError: v };
        const trunc = isTruncatedContent(right);
        if (trunc) return { left, right, syntaxError: { ok:false, error: trunc } };
    } catch (_) {}
    return { left, right };
}

module.exports = { preview, seed, previewContent, seedContent, findCandidates, findFileCandidates, resolveRelPath, IGNORE_DIRS, getPatchedPreview };
