'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const astPatch = require('./astPatch');

const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.turbo',
    '.vscode', '.idea', 'coverage', '__pycache__', 'vendor', '.cache',
]);

const MAX_SEARCH_DEPTH = 6;
const MAX_DIRS_SCANNED = 6000;

function isTruncatedContent(content) {
    if (!content || content.trim().length < 20) return null;
    const s = content.trim();
    // Check for unbalanced braces/brackets/parens
    const openBrace = (s.match(/\{/g) || []).length;
    const closeBrace = (s.match(/\}/g) || []).length;
    const openParen = (s.match(/\(/g) || []).length;
    const closeParen = (s.match(/\)/g) || []).length;
    const openBracket = (s.match(/\[/g) || []).length;
    const closeBracket = (s.match(/\]/g) || []).length;
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
    // single file at root — no anchoring
    if (parts.length === 1) return { resolved: norm, candidates: [], ambiguous: false };

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
        return { resolved: anchored, candidates: relCands, ambiguous: false };
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

        if (surgical) {
            if (!exists && effMode !== 'addAfter' && effMode !== 'addBefore') {
                // remove/replace on non-existent file will fallback
                warning = (warning ? warning + '; ' : '') + `file not found — will create full file`;
            } else if (target && exists) {
                try {
                    const check = await astPatch.canPatch(abs, target, effMode);
                    if (!check.ok) {
                        warning = (warning ? warning + '; ' : '') + check.reason;
                    }
                } catch (e) {
                    warning = (warning ? warning + '; ' : '') + e.message;
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
                if (!existed) {
                    const n = (mode||'').toLowerCase().replace(/\s+/g,'');
                    if (n === 'addafter' || n === 'addbefore') {
                        fs.writeFileSync(abs, content ?? '', 'utf-8');
                        patched.push(resolved);
                        continue;
                    }
                    errors.push({ path: resolved, original: relPath, warning: `patch fallback: file not found — created full file` });
                    // fall through to full create below
                } else {
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
    // Collect all entries for this resolved file in pasted order
    const group = allEntries.filter(e => {
        // entries may have providedResolved or need to resolve
        const r = e.resolved || e.relPath;
        // For preview, resolved is already the anchored path; match directly
        // Also match by relPath's resolved via cache for robustness
        return r === resolved;
    });
    // If no direct match (e.g., preview details vs entries mismatch), fallback to single entry lookup
    let entriesForFile = group.length ? group : allEntries.filter(e => e.relPath === resolved);
    // If still none, try to find by original relPath that resolves to this
    if (!entriesForFile.length) {
        // Fallback: find any entry whose resolved equals this
        entriesForFile = allEntries.filter(e => e.resolved === resolved);
    }
    if (!entriesForFile.length) {
        // No entries for this file, return left as both
        return { left, right: left };
    }
    // Determine if this file is surgical batch or full
    const hasSurgical = entriesForFile.some(e => isSurgical(e.mode));
    if (!hasSurgical) {
        // Full mode: last wins
        const last = entriesForFile[entriesForFile.length - 1];
        return { left, right: last.content ?? '' };
    }
    // Surgical batch: apply sequentially to a copy of left in memory
    // Full-mode entries set the base content; surgical entries patch on top
    let right = left;
    const fullEntries = entriesForFile.filter(e => !isSurgical(e.mode));
    if (fullEntries.length) {
        right = fullEntries[fullEntries.length - 1].content ?? '';
    }
    // Create a temp file with the original extension so astPatch can load the right grammar
    const ext = path.extname(abs) || '.txt';
    const tmpFile = path.join(os.tmpdir(), `gs-dry-${Date.now()}-${Math.random().toString(36).slice(2,6)}${ext}`);
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
            if (!res.ok) {
                // For preview, if patch would fail, show the original left and annotate
                // We still continue to next patch
            }
        }
        right = fs.readFileSync(tmpFile, 'utf-8');
    } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
    }
    return { left, right };
}

module.exports = { preview, seed, previewContent, seedContent, findCandidates, resolveRelPath, IGNORE_DIRS, getPatchedPreview };
