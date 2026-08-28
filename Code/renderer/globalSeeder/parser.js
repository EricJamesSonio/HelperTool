// Structure mode reuses the battle-tested tree/flat parser you already have.
export { parseInput } from '../fileSeederTool/parser.js';

const FENCE_RE = /```[ \t]*([a-zA-Z0-9]*)\r?\n([\s\S]*?)```/g;

const LANG_TOKENS = new Set([
    'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'less', 'html', 'htm', 'py',
    'json', 'md', 'markdown', 'sh', 'bash', 'shell', 'yaml', 'yml', 'sql',
    'txt', 'xml', 'vue', 'svelte', 'go', 'rs', 'java', 'c', 'cpp', 'rb',
    'php', 'graphql', 'env', 'jsonc',
]);

function looksLikePath(line) {
    const stripped = line.trim().replace(/^`+|`+$/g, '').trim();
    if (!stripped) return false;
    if (LANG_TOKENS.has(stripped.toLowerCase())) return false;
    if (/\s/.test(stripped)) return false;
    if (!/\.[a-zA-Z0-9]{1,10}$/.test(stripped)) return false;
    return true;
}

/**
 * Parses Claude-style "`path/to/file.ext`\n\n```lang\n...code...\n```" blocks.
 * For each fenced code block, walks backwards through the preceding lines
 * (skipping blanks and bare language labels) to find the file path line
 * that introduces it.
 * @returns {{ relPath: string, content: string }[]}
 */
export function parseContentBlocks(raw) {
    const entries = [];
    const byPath  = new Map();
    let cursor = 0;
    let m;

    FENCE_RE.lastIndex = 0;
    while ((m = FENCE_RE.exec(raw)) !== null) {
        const fenceStart = m.index;
        const content    = m[2].replace(/\n$/, '');

        const preceding      = raw.slice(cursor, fenceStart);
        const precedingLines = preceding.split('\n').map(l => l.trim());

        let relPath = null;
        for (let i = precedingLines.length - 1; i >= 0; i--) {
            const line = precedingLines[i];
            if (!line) continue;
            if (looksLikePath(line)) {
                relPath = line.replace(/^`+|`+$/g, '').trim();
                break;
            }
            if (LANG_TOKENS.has(line.toLowerCase())) continue;
            break; // hit unrelated content — stop scanning
        }

        if (relPath) {
            relPath = relPath.replace(/\\/g, '/').replace(/^\.?\//, '');
            if (byPath.has(relPath)) {
                byPath.get(relPath).content = content; // last occurrence wins
            } else {
                const entry = { relPath, content };
                byPath.set(relPath, entry);
                entries.push(entry);
            }
        }

        cursor = FENCE_RE.lastIndex;
    }

    return entries;
}