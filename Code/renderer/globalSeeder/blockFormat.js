// Explicit block format support for the Global Seeder.
//
// Canonical format (one block per file):
//
//   server/app/Models/Resort.php
//   <<<START
//   <?php
//   ...
//   <<<END
//
// The content between the markers is taken VERBATIM — no fence stripping, no
// prose heuristics, no path-header promotion. This makes the boundary between
// "path" and "code" explicit, so the parser can never mistake an import
// statement, a long class declaration or a nested markdown fence for the end
// of a file.
//
// Marker scanning only activates when the paste contains at least one PRIMARY
// start marker. A paste without one is parsed by the legacy heuristic parser,
// so existing behaviour is untouched.

export const BLOCK_START = '<<<START';
export const BLOCK_END = '<<<END';

// --- Primary markers -------------------------------------------------------
// Unambiguous tokens that never appear in real source code. A paste is
// treated as "explicit mode" when it contains one of these.
const PRIMARY_MARKER_RES = [
    /<<<+\s*(START|END)\s*>*/i,
    /\[\[\s*(START|END)\s*\]\]/i,
    /={2,}\s*(START|END)\s*={2,}/i,
];

// --- Secondary markers -----------------------------------------------------
// Only honoured once a primary marker is present in the paste. These can
// legitimately appear in prose or markdown, so they must not switch the
// parser into explicit mode on their own.
const SECONDARY_MARKER_RES = [
    /-{2,}\s*(START|END)\s*-{2,}/i,
    /<!--\s*(START|END)\s*-->/i,
    /\/\*\s*(START|END)\s*\*\//i,
];

const FENCE_LINE_RE = /^\s*(`{3,}|~{3,})/;

function normaliseKind(raw) {
    if (!raw) return null;
    const k = String(raw).trim().toUpperCase();
    return k === 'START' || k === 'END' ? k : null;
}

// A marker line may carry the file path in front of it ("app/X.php <<<START").
// The prefix must look like a path — never a comment marker or prose.
function isPathLikePrefix(prefix) {
    if (!prefix) return true;
    if (/\s/.test(prefix)) return false;
    if (!/[./]/.test(prefix)) return false;
    return /^[a-zA-Z0-9._\-\/[\]()]+$/.test(prefix);
}

/**
 * Match a marker on a single line.
 * Returns { kind: 'START'|'END', prefix: string } or null.
 */
function matchMarker(line, allowSecondary) {
    if (!line) return null;
    const t = line.trim();
    if (!t) return null;

    const patterns = allowSecondary
        ? [...PRIMARY_MARKER_RES, ...SECONDARY_MARKER_RES]
        : PRIMARY_MARKER_RES;

    let m = null;
    let kind = null;
    let bestIndex = Infinity;
    for (const re of patterns) {
        const hit = re.exec(t);
        if (!hit) continue;
        if (hit.index < bestIndex) {
            bestIndex = hit.index;
            m = hit;
            kind = normaliseKind(hit[1]);
        }
    }
    if (!m || !kind) return null;

    // The marker must be the last thing on the line.
    const after = t.slice(m.index + m[0].length).trim();
    if (after) return null;

    const prefix = t.slice(0, m.index).trim();
    if (!isPathLikePrefix(prefix)) return null;

    return { kind, prefix };
}

export function isBlockStart(line) {
    return matchMarker(line, true)?.kind === 'START';
}

export function isBlockEnd(line) {
    return matchMarker(line, true)?.kind === 'END';
}

/**
 * True when the paste uses the explicit block format.
 *
 * A START *and* an END marker must both be present — a prose mention of
 * "<<<START" alone never switches the parser into explicit mode. Markers
 * inside a fenced container count too: the whole batch is often wrapped in
 * one code container so the user can copy it in a single click.
 */
/**
 * True when the paste uses the explicit block format.
 *
 * A PRIMARY start marker activates the mode — a prose mention of "<<<START"
 * does not, because the marker has to be the last thing on the line.
 * Markers inside a fenced container count too: the whole batch is often
 * wrapped in one code container so the user can copy it in a single click.
 */
export function hasExplicitBlocks(raw) {
    if (!raw) return false;
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
        const primary = matchMarker(line, false);
        if (primary && primary.kind === 'START') return true;
    }
    return false;
}

/**
 * Strip a fence wrapper from a block body.
 * Some models put the code in its own fence inside the <<<START/<<<END
 * block — that fence is noise, not content.
 */
function stripFenceWrapper(content) {
    const lines = content.split('\n');
    if (lines.length < 2) return content;
    const first = lines[0].trim();
    const last = lines[lines.length - 1].trim();
    if (!FENCE_LINE_RE.test(first) || !FENCE_LINE_RE.test(last)) return content;
    // a closing fence must not carry an info string
    const lastMatch = last.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (!lastMatch || lastMatch[2].trim()) return content;
    return lines.slice(1, lines.length - 1).join('\n');
}

/**
 * Split a paste into regions.
 *
 * Returns an array of:
 *   { type: 'text',  lines: string[] }
 *   { type: 'block', preceding: string[], content: string, hasEndMarker: boolean }
 *
 * `preceding` holds the non-blank lines that sit directly above the start
 * marker (nearest first, max 3). The caller picks the first one that is a
 * valid path — those lines are removed from the surrounding text region so
 * the legacy parser never sees them as a second header.
 */
export function splitExplicitBlocks(raw) {
    const regions = [];
    if (!raw) return regions;

    const lines = raw.split(/\r?\n/);
    let regionStart = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Markers are recognised inside a fenced container as well — the
        // whole batch is usually wrapped in one code block.
        const marker = matchMarker(line, true);
        if (!marker || marker.kind !== 'START') continue;

        // Collect the body verbatim until the matching end marker.
        const body = [];
        let hasEndMarker = false;
        let j = i + 1;
        for (; j < lines.length; j++) {
            const end = matchMarker(lines[j], true);
            if (end && end.kind === 'END') { hasEndMarker = true; break; }
            body.push(lines[j]);
        }

        // Collect the candidate path lines directly above the marker.
        const preceding = [];
        const precedingIdx = [];
        for (let k = i - 1; k >= 0 && preceding.length < 3; k--) {
            const candidate = lines[k].trim();
            if (!candidate) continue;
            if (FENCE_LINE_RE.test(candidate)) break;
            if (matchMarker(candidate, true)) break;
            preceding.push(candidate);
            precedingIdx.push(k);
        }

        // Text region ends before the oldest collected path candidate.
        const cutAt = precedingIdx.length ? precedingIdx[precedingIdx.length - 1] : i;
        if (cutAt > regionStart) {
            regions.push({ type: 'text', lines: lines.slice(regionStart, cutAt) });
        }

        const pathCandidates = marker.prefix ? [marker.prefix, ...preceding] : preceding;
        regions.push({
            type: 'block',
            preceding: pathCandidates,
            content: stripFenceWrapper(body.join('\n')),
            hasEndMarker,
        });

        i = j;             // continue after the end marker
        regionStart = i + 1;
    }

    if (regionStart < lines.length) {
        regions.push({ type: 'text', lines: lines.slice(regionStart) });
    }
    return regions;
}
