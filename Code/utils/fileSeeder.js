'use strict';

const fs   = require('fs');
const path = require('path');
const astPatch = require('./astPatch');

const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.turbo',
    '.vscode', '.idea', 'coverage', '__pycache__', 'vendor', '.cache',
]);

const MAX_SEARCH_DEPTH = 6;
const MAX_DIRS_SCANNED = 6000;

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
    const relCands = cands.map(abs => path.relative(basePath, abs).replace(/\\/g, '/'));
    if (cands.length === 1) {
        const anchored = path.posix.join(relCands[0], rest);
        return { resolved: anchored, candidates: relCands, ambiguous: false };
    }
    // ambiguous — default to first/shallowest but expose all
    const anchored = path.posix.join(relCands[0], rest);
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

async function previewContent(basePath, entries) {
    const toCreate    = [];
    const toOverwrite = [];
    const toPatch     = [];
    const warnings    = [];
    const details     = [];
    const cache       = new Map();

    for (const { relPath, mode, target } of entries) {
        const { resolved, candidates, ambiguous } = resolveRelPath(basePath, relPath, cache);
        const abs = path.join(basePath, resolved);
        const exists = fs.existsSync(abs);

        let warning = null;
        let effMode = mode ?? 'full';
        if (effMode === 'update') {
            if (!exists) {
                warning = `file not found — will create full file`;
                // keep as patch in preview but mark warning; seed will fallback to full
            } else if (target) {
                try {
                    const check = await astPatch.canPatch(abs, target);
                    if (!check.ok) {
                        warning = check.reason;
                        // keep mode as update but flag; UI will show warning badge
                    }
                } catch (e) {
                    warning = e.message;
                }
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

            if (mode === 'update' && target && existed) {
                const result = await astPatch.applyUpdate(abs, target, content ?? '');
                if (result.ok) {
                    patched.push(resolved);
                    continue;
                }
                errors.push({ path: resolved, original: relPath, warning: `patch fallback: ${result.reason}` });
                // falls through to full write below
            }

            fs.writeFileSync(abs, content ?? '', 'utf-8');
            if (existed) overwritten.push(resolved);
            else created.push(resolved);
        } catch (err) {
            errors.push({ path: resolved, original: relPath, candidates, ambiguous, error: err.message });
        }
    }

    return { created, overwritten, patched, errors };
}

module.exports = { preview, seed, previewContent, seedContent, findCandidates, resolveRelPath, IGNORE_DIRS };
