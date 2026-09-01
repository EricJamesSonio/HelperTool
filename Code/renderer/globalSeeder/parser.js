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
    'vue','svelte','go','rs','java','c','cpp','rb','php','env','gitignore','module.css','ts',
]);
const EXT_RE = /\.[a-zA-Z0-9]{1,10}$/;
const GLUED_LANG_RE = /(\.[a-zA-Z0-9]{1,10})(js|jsx|ts|tsx|css|scss|less|html|htm|py|json|md|sh|bash|yaml|yml|sql|xml|vue|svelte|go|rs|java|c|cpp|rb|php|env)$/i;
const FENCE_BLOCK_RE = /```[ \t]*[a-zA-Z0-9]*\r?\n([\s\S]*?)```/g;
const CODE_CHARS_RE = /[{}\[\]();=<>`"'$:,?]/;
const INSTRUCTION_PREFIX_RE = /^(replace|and|update|note|this|here|please|the|you can|update the|replace the)\b/i;
const PARTIAL_RE = /\(partial\)/i;
const SURGICAL_RE = /\((add(?:\s+after|\s+before)?|replace|update|remove)\s*:\s*([^)]+)\)/i;

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
    // strip obvious wrapper noise before/after the path (e.g. "``!components/.../!``" -> "components/...")
    // only strip leading/trailing non-path symbols, keep the literal path intact (no dot->slash conversion)
    raw = raw.replace(/^[`'\"!*~>\|\s]+/, '').replace(/[`'\"!*~>\|\s]+$/, '').trim();
    if (!raw) return null;
    // strip surrounding backticks / quotes (whole line) — second pass for nested wrappers
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
    // strip wrapping backticks/quotes/brackets/decorators from the token itself (e.g. "`components/...`" or "``!components/.../!``")
    first = first.replace(/^[`'\"!*~>\|\[\(\s]+/, '').replace(/[`'\"!*~>\|\)\]\s]+$/, '').trim();
    // strip trailing punctuation
    first = first.replace(/[:;,]+$/, '').trim();
    // strip leading ./ or /
    first = first.replace(/^\.?\//, '').trim();
    // final pass strip any remaining wrapping ` " '
    first = first.replace(/^`+|`+$/g, '').replace(/^'+|'+$/g, '').replace(/^"+|"+$/g, '').trim();

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
    // dotfiles like .gitignore / .env are valid
    const isDotfile = p.startsWith('.') && !p.includes('/');
    if (p.startsWith('-')) return false;
    if (p.startsWith('.') && !isDotfile) return false;
    if (!isDotfile && !EXT_RE.test(p)) return false;
    if (p.length < 3) return false;
    // Allow Next.js dynamic segments: [param], [[...param]], (group), and catch-all ... inside
    if (!/^[a-zA-Z0-9._\-\/\[\]\(\)\.]+$/.test(p)) return false;
    // Strip bracket/parenthesis wrappers for ext check, but keep them for path validity
    const cleanForExt = p.replace(/[\[\]\(\)]/g, '');
    const ext = cleanForExt.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTS.has(ext) && !LANG_TOKENS.has(ext)) return false;
    return true;
}

function isInstructionLine(line) {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith('```')) return false;
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('* ') || t.startsWith('#')) return false; // code comment, keep as code
    if (LANG_TOKENS.has(t.toLowerCase())) return false;
    // JSX text nodes are indented and should not be treated as instruction prose
    // Only top-level (column 0) prose after a file should terminate
    const isIndented = /^\s/.test(line);
    if (isIndented) {
        // Indented lines inside a file (JSX text like "Helper for doctors view...") often contain
        // em dashes or read like prose but are legitimate code content — don't treat as instruction
        // Only allow indented instruction if it clearly is top-level AI prose (e.g. "  That's the shape...")
        // which would still be at least 2 spaces but we keep it non-instruction to avoid false truncation
        return false;
    }
    if (/^(that's|this is|the shape|no prose|immediately followed)\b/i.test(t)) return true;
    // long prose ending with period, no code chars, starts with capital instruction
    if (INSTRUCTION_PREFIX_RE.test(t)) return true;
    // contains em dash and no code chars (allow parens/commas — common in prose descriptions)
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
    // Priority 1.5: closing fence but no opening — treat content before closing fence as fenced
    // This handles the common AI output pattern where the opening ``` is missing:
    //   path (Replace: target)
    //   php
    //       code...
    //   ```
    if (!fences.length) {
        const lastFenceIdx = buf.findLastIndex(l => l.trim().startsWith('```'));
        if (lastFenceIdx > 0) {
            const hasOpening = buf.slice(0, lastFenceIdx).some(l => l.trim().startsWith('```'));
            if (!hasOpening) {
                // Take everything before the closing fence, strip lang tokens and leading/trailing blanks
                return buf.slice(0, lastFenceIdx)
                    .filter(l => !LANG_TOKENS.has(l.trim().toLowerCase()))
                    .join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
            }
        }
    }
    // Fallback for unclosed fence (truncated paste): if buf starts with ``` but no closing found, return everything after opening fence
    const firstFenceIdx = buf.findIndex(l => l.trim().startsWith('```'));
    if (firstFenceIdx !== -1) {
        // Check if there's no closing fence after it
        const hasClosing = buf.slice(firstFenceIdx + 1).some(l => l.trim().startsWith('```'));
        if (!hasClosing) {
            return buf.slice(firstFenceIdx + 1).join('\n').trim();
        }
    }
    // Priority 2: unfenced — strip language token lines and instruction lines,
    // and treat the first instruction-like line after code as a terminator (drops trailing prose like "That's the shape: …")
    const out = [];
    let seenCode = false;
    for (let i = 0; i < buf.length; i++) {
        const line = buf[i];
        const t = line.trim();
        if (LANG_TOKENS.has(t.toLowerCase())) continue;
        if (t.startsWith('```')) continue; // skip fence delimiters
        const isInstr = isInstructionLine(line);
        if (isInstr) {
            if (seenCode) break; // trailing prose after code — stop here (only top-level, not indented JSX text)
            continue;
        }
        // consider a line code-like if it has a code char, is a comment, or is blank (blank is allowed between code lines)
        const isCodeComment = t.startsWith('//') || t.startsWith('/*') || t.startsWith('*');
        if (CODE_CHARS_RE.test(line) || t === '' || isCodeComment) {
            if (t !== '') seenCode = true;
        } else if (seenCode && t.length > 0) {
            // prose-like line after code without being an instruction (e.g. "That's the shape: …" without em dash)
            // treat as terminator as well — but not for code comments and not for indented JSX text
            const isTopLevel = !/^\s/.test(line);
            const isProse = t.length > 30 && /\s/.test(t) && !CODE_CHARS_RE.test(t) && !isCodeComment;
            if (isProse && isTopLevel) break;
        }
        out.push(line);
    }
    // trim leading/trailing blank lines
    let s = out.join('\n');
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
    let curMode = 'full'; // 'full' | 'partial' | 'update'
    let curTarget = null;
    let inFence = false;

    function flush() {
        if (!curPath) return;
        if (curMode === 'partial') {
            curPath = null; buf = []; curMode = 'full'; curTarget = null;
            return;
        }
        const content = cleanContentBuffer(buf);
        const relPath = curPath.replace(/\\/g, '/').replace(/^\.?\//, '');
        const entry = { relPath, content, mode: curMode, target: curTarget };
        const isSurgical = curMode !== 'full';
        if (!isSurgical && byPath.has(relPath)) {
            // full mode: last wins
            Object.assign(byPath.get(relPath), entry);
            const idx = entries.findIndex(e => e.relPath === relPath && e.mode === 'full');
            if (idx !== -1) entries[idx] = { ...entries[idx], ...entry };
            else entries.push(entry);
        } else {
            if (!isSurgical) byPath.set(relPath, entry);
            entries.push(entry);
        }
        curPath = null; buf = []; curMode = 'full'; curTarget = null;
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const isFenceLine = trimmed.startsWith('```');

        // Path check first — even inside an outer wrapper fence we want to catch headers like
        // "```" (outer) -> "components/foo.tsx" -> "```tsx"
        // So we peek ahead: a path inside a fence is only a header if the next non-empty line is a fence
        if (!isFenceLine) {
            const cand = extractPathCandidate(line);
            if (cand) {
                const t = line.trim();
                if (/^\s*(import|export)\b/.test(t) && /from\s+["']/.test(t)) {
                    if (curPath !== null) buf.push(line);
                    continue;
                }
                let isHeader = !inFence;
                if (inFence) {
                    let j = i + 1;
                    while (j < lines.length && !lines[j].trim()) j++;
                    if (j < lines.length && lines[j].trim().startsWith('```')) isHeader = true;
                }
                if (isHeader) {
                    const surgicalMatch = line.match(SURGICAL_RE);
                    const isPartial = !surgicalMatch && PARTIAL_RE.test(line);
                    flush();
                    curPath = cand;
                    if (isPartial) {
                        curMode = 'partial';
                        curTarget = null;
                    } else if (surgicalMatch) {
                        const opRaw = surgicalMatch[1].toLowerCase().replace(/\s+/g, '');
                        const targetRaw = surgicalMatch[2].trim();
                        if (opRaw === 'update' || opRaw === 'replace') { curMode = 'update'; curTarget = targetRaw; }
                        else if (opRaw === 'addafter' || opRaw === 'add') { curMode = 'addAfter'; curTarget = targetRaw; }
                        else if (opRaw === 'addbefore') { curMode = 'addBefore'; curTarget = targetRaw; }
                        else if (opRaw === 'remove') { curMode = 'remove'; curTarget = targetRaw; }
                        else { curMode = 'update'; curTarget = targetRaw; }
                    } else {
                        curMode = 'full';
                        curTarget = null;
                    }
                    buf = [];
                    continue;
                }
            }
        }

        if (isFenceLine) {
            // fence delimiter — push to current file's buffer and toggle state
            if (curPath !== null) buf.push(line);
            inFence = !inFence;
            continue;
        }

        if (inFence) {
            if (curPath !== null) buf.push(line);
            continue;
        }

        if (curPath !== null) {
            buf.push(line);
        }
    }
    flush();
    return entries;
}
