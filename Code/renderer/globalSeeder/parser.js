// Structure mode reuses tree/flat parser.
export { parseInput } from '../fileSeederTool/parser.js';

const LANG_TOKENS = new Set([
    'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'less', 'html', 'htm', 'py',
    'json', 'md', 'markdown', 'sh', 'bash', 'shell', 'yaml', 'yml', 'sql',
    'txt', 'xml', 'vue', 'svelte', 'go', 'rs', 'java', 'c', 'cpp', 'rb',
    'php', 'graphql', 'env', 'jsonc',
]);

// extensions we recognise as file-like — only known code/config extensions
const ALLOWED_EXTS = new Set([
    'js','jsx','ts','tsx','mjs','cjs','css','scss','less','html','htm','py',
    'json','jsonc','md','markdown','sh','bash','yaml','yml','sql','txt','xml',
    'vue','svelte','go','rs','java','c','cpp','rb','php','env','module.css','ts',
]);
const EXT_RE = /\.[a-zA-Z0-9]{1,10}$/;
const GLUED_LANG_RE = /(\.[a-zA-Z0-9]{1,10})(js|jsx|ts|tsx|css|scss|less|html|htm|py|json|md|sh|bash|yaml|yml|sql|xml|vue|svelte|go|rs|java|c|cpp|rb|php|env)$/i;
const FENCE_BLOCK_RE = /```[ \t]*[a-zA-Z0-9]*\r?\n([\s\S]*?)```/g;
const CODE_CHARS_RE = /[{}\[\]();=<>`"'$]/;
const INSTRUCTION_PREFIX_RE = /^(replace|and|update|note|this|here|please|the|you can|update the|replace the)\b/i;
const PARTIAL_RE = /\(partial\)/i;

/**
 * Extract path candidate from a single line.
 * Handles: backticks, leading ./, em-dash suffix (" — update ..."), trailing colon,
 * glued lang token ("file.csscss" -> "file.css"), fenced lang line noise.
 * Returns normalized posix relPath or null.
 */
function extractPathCandidate(line) {
    let raw = line.trim();
    if (!raw) return null;
    // strip common markdown heading / list markers before any other logic
    raw = raw.replace(/^#{1,6}\s+/, '').replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim();
    if (!raw) return null;
    // strip surrounding backticks / quotes (whole line)
    raw = raw.replace(/^`+|`+$/g, '').replace(/^'+|'+$/g, '').replace(/^"+|"+$/g, '').trim();
    if (!raw) return null;
    // take first token before space that contains '.'/'/'; handle "hooks/a.ts — update"
    // split on em-dash / en-dash / " — " / " - "
    const dashSplit = raw.split(/\s+[—–-]\s+/);
    let first = dashSplit[0].trim();
    // if first contains spaces, take leading token that looks path-like
    if (/\s/.test(first)) {
        const tokens = first.split(/\s+/);
        const pathTok = tokens.find(t => t.includes('/') || EXT_RE.test(t));
        first = pathTok || tokens[0];
    }
    // strip wrapping backticks/quotes/brackets from the token itself (e.g. "`components/...`" )
    first = first.replace(/^`+|`+$/g, '').replace(/^'+|'+$/g, '').replace(/^"+|"+$/g, '').trim();
    // strip trailing punctuation
    first = first.replace(/[:;,]+$/, '').trim();
    // strip leading ./ or /
    first = first.replace(/^\.?\//, '').trim();
    // strip wrapping [] ()
    first = first.replace(/^[\[\(]+|[\]\)]+$/g, '').trim();
    first = first.replace(/^`+|`+$/g, '').trim();

    // handle glued lang token: "SharePanel.module.csscss" => "SharePanel.module.css"
    const glued = first.match(GLUED_LANG_RE);
    if (glued) {
        const ext = glued[1];
        const restBeforeExt = first.slice(0, first.lastIndexOf(ext));
        const candidate = (restBeforeExt + ext).replace(/\\/g, '/');
        if (isValidPath(candidate)) return candidate;
    }

    first = first.replace(/\\/g, '/');
    if (!isValidPath(first)) return null;
    return first;
}

function isValidPath(p) {
    if (!p) return false;
    if (/\s/.test(p)) return false;
    if (LANG_TOKENS.has(p.toLowerCase())) return false;
    if (!EXT_RE.test(p)) return false;
    if (p.length < 3) return false;
    if (p.startsWith('-') || p.startsWith('.')) return false;
    if (!/^[a-zA-Z0-9._\-\/]+$/.test(p)) return false;
    const ext = p.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTS.has(ext) && !LANG_TOKENS.has(ext)) return false;
    return true;
}

function isInstructionLine(line) {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith('```')) return false;
    if (LANG_TOKENS.has(t.toLowerCase())) return false;
    // long prose ending with period, no code chars, starts with capital instruction
    if (INSTRUCTION_PREFIX_RE.test(t)) return true;
    // contains em dash and no code chars
    if (/[—–]/.test(t) && !CODE_CHARS_RE.test(t)) return true;
    // sentence-like: >40 chars, contains spaces, ends with ., no code chars, no leading code keyword
    if (t.length > 40 && /\s/.test(t) && t.endsWith('.') && !CODE_CHARS_RE.test(t)) {
        if (!/^(import|export|const|let|var|function|class|interface|type|return|if|for|while|async|await|from|wrap|trigger|panel|hint|row|input)\b/i.test(t)) {
            return true;
        }
    }
    // "Replace the ..." "And update the..."
    if (/^(replace|and)\s+the\b/i.test(t) && !CODE_CHARS_RE.test(t)) return true;
    return false;
}

function cleanContentBuffer(buf) {
    if (!buf.length) return '';
    const raw = buf.join('\n');
    // Priority 1: if fenced blocks exist, concatenate their interiors
    const fences = [];
    let m;
    FENCE_BLOCK_RE.lastIndex = 0;
    while ((m = FENCE_BLOCK_RE.exec(raw)) !== null) {
        fences.push(m[1].replace(/\n$/, ''));
    }
    if (fences.length) {
        return fences.join('\n').trim();
    }
    // Priority 2: unfenced — strip language token lines and instruction lines
    const out = [];
    for (let i = 0; i < buf.length; i++) {
        const line = buf[i];
        const t = line.trim();
        // skip standalone lang token line (single word lang)
        if (LANG_TOKENS.has(t.toLowerCase())) continue;
        if (isInstructionLine(line)) continue;
        out.push(line);
    }
    // trim leading/trailing blank lines
    let s = out.join('\n');
    // remove leading blank line after path if first line was lang token and got stripped
    s = s.replace(/^\n+/, '').replace(/\n+$/, '');
    return s;
}

/**
 * Smart content parser: handles fenced and unfenced pastes, noise filtering.
 * Flow: path line → buffer until next path line → clean buffer → entry.
 * Handles glued csscss, em-dash suffix, backticked paths.
 * Fence-aware: lines inside ``` fences are never treated as path headers (so file-tree blocks are ignored).
 * Partial-aware: any path line containing "(Partial)" is skipped entirely.
 */
export function parseContentBlocks(raw) {
    const lines = raw.split(/\r?\n/);
    const entries = [];
    const byPath = new Map();

    let curPath = null;
    let buf = [];
    let curIsPartial = false;
    let inFence = false;

    function flush() {
        if (!curPath) return;
        if (curIsPartial) {
            // skip Partial files completely — user handles manually
            curPath = null;
            buf = [];
            curIsPartial = false;
            return;
        }
        const content = cleanContentBuffer(buf);
        // normalize path
        const relPath = curPath.replace(/\\/g, '/').replace(/^\.?\//, '');
        // dedup last wins
        if (byPath.has(relPath)) {
            byPath.get(relPath).content = content;
            const idx = entries.findIndex(e => e.relPath === relPath);
            if (idx !== -1) entries[idx].content = content;
        } else {
            const entry = { relPath, content };
            byPath.set(relPath, entry);
            entries.push(entry);
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const isFenceLine = trimmed.startsWith('```');

        if (isFenceLine) {
            // fence delimiter — push to current file's buffer and toggle state, never treat as path
            if (curPath !== null) buf.push(line);
            inFence = !inFence;
            continue;
        }

        if (inFence) {
            if (curPath !== null) buf.push(line);
            continue;
        }

        // Outside fence — check for path candidate
        const cand = extractPathCandidate(line);
        if (cand) {
            const t = line.trim();
            if (/^\s*(import|export)\b/.test(t) && /from\s+["']/.test(t)) {
                if (curPath !== null) buf.push(line);
                continue;
            }
            // Check Partial flag on the original line (on path line, case-insensitive)
            const isPartial = PARTIAL_RE.test(line);
            flush();
            curPath = cand;
            curIsPartial = isPartial;
            buf = [];
            continue;
        }
        if (curPath !== null) {
            buf.push(line);
        }
    }
    flush();
    return entries;
}
