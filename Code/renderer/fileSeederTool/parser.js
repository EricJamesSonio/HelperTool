/**
 * renderer/fileSeederTool/parser.js
 *
 * Parses raw user input into a flat array of relative posix paths.
 *
 * Handles two input modes automatically:
 *
 *  FLAT MODE   — one filename per line, no slashes in leading position
 *    product.controller.ts
 *    product.service.ts
 *
 *  TREE MODE   — box-drawing / indented tree (├── │ └── spaces/tabs)
 *    src/
 *    ├── app.ts
 *    ├── config/
 *    │   └── env.ts
 *
 * The algorithm:
 *  1. Strip box-drawing characters and normalise whitespace
 *  2. Detect mode from whether any line contains a path separator
 *     or box-drawing character
 *  3. Rebuild full relative paths by tracking the current folder stack
 *  4. Ignore blank lines, comment lines (#), and pure folder entries
 *     (folders are implicitly created by mkdirSync when seeding files)
 */

// Box-drawing chars + common noise
const BOX_CHARS   = /[│├└─\|+\\]/g;
const NOISE_CHARS = /['"*!?@]/g;   // stray punctuation people paste in

/**
 * Strip leading box/indent noise from a single line and return the clean segment.
 * @param {string} line
 * @returns {string}
 */
function cleanLine(line) {
    return line
        .replace(BOX_CHARS,   ' ')  // replace box chars with space
        .replace(NOISE_CHARS, '')   // drop stray punctuation
        .replace(/\s+/g, ' ')       // collapse whitespace
        .trim();
}

/**
 * Count how many "indent units" this raw line has.
 * Works with box-drawing trees (each │   or ├── counts as one level)
 * and plain indent (4 spaces or 1 tab per level).
 *
 * @param {string} rawLine
 * @returns {number}
 */
function indentLevel(rawLine) {
    // Count leading box sections: │, ├──, └──  each = one level
    const boxMatches = rawLine.match(/(?:│\s*|[├└]──\s*)/g);
    if (boxMatches) return boxMatches.length;

    // Fallback: count leading spaces / tabs
    const spaces = rawLine.match(/^(\s+)/)?.[1] ?? '';
    const tabs   = (spaces.match(/\t/g) ?? []).length;
    if (tabs > 0) return tabs;
    return Math.floor(spaces.length / 2); // 2-space indent
}

/**
 * Parse raw textarea input into an array of relative file paths.
 *
 * @param {string} raw
 * @returns {string[]}  e.g. ['src/app.ts', 'src/config/env.ts']
 */
export function parseInput(raw) {
    const lines = raw.split('\n');

    // Quick detect: does any line have a '/' that isn't at the very end?
    // or does any line have box-drawing chars?  → tree mode
    const isTree = lines.some(l => BOX_CHARS.test(l) || /[^/]\//.test(l));

    if (isTree) {
        return parseTree(lines);
    } else {
        return parseFlat(lines);
    }
}

// ── Flat mode ─────────────────────────────────────────────────────────────────

function parseFlat(lines) {
    const results = [];

    for (const line of lines) {
        const clean = cleanLine(line);
        if (!clean || clean.startsWith('#')) continue;

        // If someone accidentally put a path here, handle it
        const parts = clean.split('/').map(s => s.trim()).filter(Boolean);
        const last  = parts[parts.length - 1];

        // Skip if it looks like a folder (no extension and ends with nothing,
        // or the original line ended with /)
        if (looksLikeFolder(last)) continue;

        results.push(parts.join('/'));
    }

    return dedupe(results);
}

// ── Tree mode ─────────────────────────────────────────────────────────────────

function parseTree(lines) {
    const results = [];

    // folderStack[i] = folder name at depth i
    const folderStack = [];

    for (const rawLine of lines) {
        if (!rawLine.trim()) continue;

        const depth = indentLevel(rawLine);
        const clean = cleanLine(rawLine);

        if (!clean || clean.startsWith('#')) continue;

        // A segment can be  "config/"  or  "env.ts"
        // Extract just the last meaningful token (ignore extra path components
        // that slipped through — the stack tracks hierarchy)
        const segment = extractSegment(clean);
        if (!segment) continue;

        const isFolder = looksLikeFolder(segment) || clean.endsWith('/');

        // Trim the stack to current depth
        folderStack.length = depth;

        if (isFolder) {
            // Push folder name (without trailing slash) onto stack
            folderStack[depth] = segment.replace(/\/$/, '');
        } else {
            // Build full path from stack + filename
            const dir  = folderStack.filter(Boolean).join('/');
            const full = dir ? `${dir}/${segment}` : segment;
            results.push(full);
        }
    }

    return dedupe(results);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the meaningful filename/foldername from an already-cleaned line.
 * The cleaned line may still have residual segments like "src/app.ts" —
 * in that case we want the last meaningful part.
 */
function extractSegment(cleanLine) {
    // If it looks like a path, split and take last non-empty part
    const parts = cleanLine.split('/').map(s => s.trim()).filter(Boolean);
    return parts[parts.length - 1] ?? '';
}

/**
 * A segment is a folder if it has no file extension AND doesn't look like
 * a dotfile, OR if it ends with '/'.
 */
function looksLikeFolder(name) {
    if (!name) return false;
    if (name.endsWith('/')) return true;
    // Has an extension → file
    if (/\.[a-zA-Z0-9]+$/.test(name)) return false;
    // No extension and not a dotfile → folder
    return !name.startsWith('.');
}

function dedupe(paths) {
    return [...new Set(paths)];
}