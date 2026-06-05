const BOX_CHARS   = /[│├└─\|+\\]/g;
const NOISE_CHARS = /['"*!?@]/g;

function cleanLine(line) {
    let cleaned = line
        .replace(BOX_CHARS, ' ')
        .replace(NOISE_CHARS, '')
        .replace(/\s+/g, ' ')
        .trim();
    const commentIdx = cleaned.search(/[←#]/);
    if (commentIdx > 0) {
        cleaned = cleaned.substring(0, commentIdx).trim();
    }
    return cleaned;
}

function detectMode(lines) {
    const nonEmpty = lines.filter(l => l.trim());
    if (!nonEmpty.length) return 'flat';

    const hasBox = nonEmpty.some(l => BOX_CHARS.test(l));
    const hasPathSep = nonEmpty.some(l => /[^/]\//.test(l));
    if (hasBox || hasPathSep) return 'tree';

    const indented = nonEmpty.filter(l => /^\s/.test(l)).length;
    const rootLevel = nonEmpty.filter(l => /^\S/.test(l)).length;
    if (indented > 0 && rootLevel > 0) return 'tree';

    return 'flat';
}

function detectIndentUnit(lines) {
    const spacings = lines
        .map(l => l.match(/^(\s+)/)?.[1]?.length ?? 0)
        .filter(len => len > 0);
    if (!spacings.length) return 2;
    return Math.min(...spacings);
}

function indentLevel(rawLine, indentUnit) {
    const boxMatches = rawLine.match(/(?:│\s*|[├└]──\s*)/g);
    if (boxMatches) return boxMatches.length;

    const spaces = rawLine.match(/^(\s+)/)?.[1] ?? '';
    const tabs = (spaces.match(/\t/g) ?? []).length;
    if (tabs > 0) return tabs;
    return Math.floor(spaces.length / indentUnit);
}

export function parseInput(raw) {
    const lines = raw.split('\n');
    const mode = detectMode(lines);

    if (mode === 'tree') {
        const indentUnit = detectIndentUnit(lines);
        return parseTree(lines, indentUnit);
    } else {
        return parseFlat(lines);
    }
}

function parseFlat(lines) {
    const results = [];

    for (const line of lines) {
        const clean = cleanLine(line);
        if (!clean || clean.startsWith('#')) continue;

        const parts = clean.split('/').map(s => s.trim()).filter(Boolean);
        const last = parts[parts.length - 1];

        if (looksLikeFolder(last)) continue;

        results.push(parts.join('/'));
    }

    return dedupe(results);
}

function parseTree(lines, indentUnit) {
    const results = [];
    const folderStack = [];

    for (const rawLine of lines) {
        if (!rawLine.trim()) continue;

        const depth = indentLevel(rawLine, indentUnit);
        const clean = cleanLine(rawLine);

        if (!clean || clean.startsWith('#')) continue;

        const segment = extractSegment(clean);
        if (!segment) continue;

        const isFolder = looksLikeFolder(segment) || clean.endsWith('/');

        folderStack.length = depth;

        if (isFolder) {
            folderStack[depth] = segment.replace(/\/$/, '');
        } else {
            const dir = folderStack.filter(Boolean).join('/');
            const full = dir ? `${dir}/${segment}` : segment;
            results.push(full);
        }
    }

    return dedupe(results);
}

function extractSegment(cleanLine) {
    const parts = cleanLine.split('/').map(s => s.trim()).filter(Boolean);
    return parts[parts.length - 1] ?? '';
}

function looksLikeFolder(name) {
    if (!name) return false;
    if (name.endsWith('/')) return true;
    if (/\.[a-zA-Z0-9]+$/.test(name)) return false;
    return !name.startsWith('.');
}

function dedupe(paths) {
    return [...new Set(paths)];
}
