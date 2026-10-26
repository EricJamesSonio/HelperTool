// Structure mode reuses tree/flat parser.
export { parseInput } from '../fileSeederTool/parser.js';

import { hasExplicitBlocks, splitExplicitBlocks } from './blockFormat.js';

const LANG_TOKENS = new Set([
    'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'less', 'html', 'htm', 'py',
    'json', 'md', 'markdown', 'sh', 'bash', 'shell', 'yaml', 'yml', 'sql',
    'txt', 'xml', 'vue', 'svelte', 'go', 'rs', 'java', 'c', 'cpp', 'rb',
    'php', 'graphql', 'env', 'jsonc', 'toml', 'ini',
]);

// extensions we recognise as file-like — only known code/config extensions
const ALLOWED_EXTS = new Set([
    'js','jsx','ts','tsx','mjs','cjs','mts','cts','css','scss','less','html','htm','py',
    'json','jsonc','md','markdown','sh','bash','yaml','yml','sql','txt','xml',
    'vue','svelte','go','rs','java','c','cpp','rb','php','blade','env','gitignore',
    'toml','ini','cfg','conf','mako','lock','properties','csv','svg','gql','prisma','proto','j2','jinja',
    'gitattributes','dockerignore','editorconfig','prettierrc','prettierignore','eslintrc','eslintignore','npmrc','nvmrc',
]);
// Well-known files that have no extension.
const SPECIAL_BASENAMES = new Set(['Dockerfile', 'Makefile', 'Procfile']);
// .env, .env.example, .env.local, .env.production ...
const ENV_FILE_RE = /^\.env(\.[A-Za-z0-9_-]+)?$/;

const EXT_RE = /\.[a-zA-Z0-9]{1,10}$/;
const GLUED_LANG_RE = /(\.[a-zA-Z0-9]{1,10})(js|jsx|ts|tsx|css|scss|less|html|htm|py|json|md|sh|bash|yaml|yml|sql|xml|vue|svelte|go|rs|java|c|cpp|rb|php|env)$/i;
const CODE_CHARS_RE = /[{}\[\]();=<>`"'$:,?]/;
const INSTRUCTION_PREFIX_RE = /^(replace|and|update|note|this|here|please|the|you can|update the|replace the)\b/i;
const PARTIAL_RE = /\(partial\)/i;
const SURGICAL_RE = /\((add(?:\s+after|\s+before)?|replace|update|remove)\s*:\s*([^)]+)\)/i;
// Import-like lines must never become file headers — their quoted string
// literals (e.g. from "@/lib/..." or from "./Checkbox.js") look path-like.
const IMPORT_LINE_RE = /^\s*(import|export)\b.*\bfrom\b\s*["']/;
const REQUIRE_CALL_RE = /(require|import)\s*\(\s*["']/;
const FROM_STRING_RE = /\bfrom\s*["'][^"']+["']/;
const DECL_FROM_RE = /^\s*(import|export|const|let|var)\b.*\bfrom\b\s*["']/;
// PHP namespace imports — "use App\Models\Resort;" / "use function foo\bar();"
const PHP_USE_RE = /^\s*use\s+(?:function\s+|const\s+)?[A-Za-z_\\][\w\\]*(?:\s+as\s+\w+)?\s*;?\s*$/;
// Blade directives — "@include('partials.header')" etc.
const BLADE_DIRECTIVE_RE = /^\s*@(?:include|extends|section|yield|push|stack|once|each|if|else|elseif|endif|unless|endunless|foreach|endforeach|forelse|empty|endempty|isset|endisset|csrf|method|auth|can|endcan|class|style|props|json|dd|env)\b/;
// A class/interface/trait/enum declaration is CODE, never prose. Without this
// guard a long PSR-12 declaration line ("class ResortController extends
// Controller") looks like an English sentence and truncates the whole file.
const DECLARATION_RE = /^\s*(?:(?:final|abstract|readonly|partial|sealed|static)\s+)*(?:class|interface|trait|enum)\b/;
// SFC block tracking for .vue files
const SFC_OPEN_RE = /<(template|script|style)\b[^>]*>/i;
const SFC_CLOSE_RE = /<\/(template|script|style)\s*>/i;

export function isImportLike(line) {
    if (!line) return false;
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith('```')) return false;
    if (IMPORT_LINE_RE.test(line)) return true;
    if (REQUIRE_CALL_RE.test(line)) return true;
    if (DECL_FROM_RE.test(line) && FROM_STRING_RE.test(line)) return true;
    if (PHP_USE_RE.test(line)) return true;
    if (BLADE_DIRECTIVE_RE.test(line)) return true;
    return false;
}

// Extension of a path (last dot segment), lowercased. "index.blade.php" -> "php"
function extOfPath(p) {
    if (!p) return '';
    const base = p.split('/').pop() || '';
    const dot = base.lastIndexOf('.');
    if (dot <= 0) return '';
    return base.slice(dot + 1).toLowerCase();
}

/**
 * Extract path candidate from a single line.
 * Handles: backticks, leading ./, em-dash suffix (" — update ..."), trailing colon,
 * glued lang token ("file.csscss" -> "file.css"), fenced lang line noise.
 * Returns normalized posix relPath or null.
 */
function extractPathCandidate(line) {
    let raw = line.trim();
    if (!raw) return null;
    // Never treat import/export/from lines as headers (checked on raw line too)
    if (isImportLike(line)) return null;
    // Overlong lines are code/prose, never a path header
    if (raw.length > 260) return null;
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
    // Header must START with the path — the first token must be path-like.
    // This rejects mid-line import string literals like: import X from "@/a/b.js"
    if (/\s/.test(first)) {
        const tokens = first.split(/\s+/);
        const head = tokens[0];
        const headLooksPath = head.includes('/') || EXT_RE.test(head);
        if (!headLooksPath) return null;
        first = head;
    }
    // strip wrapping backticks/quotes/brackets/decorators from the token itself (e.g. "`components/...`" or "``!components/.../!``")
    first = first.replace(/^[`'\"!*~>\|\[\(\s]+/, '').replace(/[`'\"!*~>\|\)\]\s]+$/, '').trim();
    // strip trailing punctuation
    first = first.replace(/[:;,]+$/, '').trim();
    // strip leading ./ or /
    first = first.replace(/^\.?\//, '').trim();
    // final pass strip any remaining wrapping ` " '
    first = first.replace(/^`+|`+$/g, '').replace(/^'+|'+$/g, '').replace(/^"+|"+$/g, '').trim();

    const direct = first.replace(/\\/g, '/');
    // The path may already be valid on its own — prefer it. Otherwise a real
    // extension such as ".cjs" / ".jsonc" gets mis-read as a glued lang token
    // (".c" + "js") and the file is written to the wrong path.
    if (isValidPath(direct)) return direct;

    // handle glued lang token: "SharePanel.module.csscss" => "SharePanel.module.css"
    const glued = first.match(GLUED_LANG_RE);
    if (glued) {
        const ext = glued[1];
        const restBeforeExt = first.slice(0, first.lastIndexOf(ext));
        const candidate = (restBeforeExt + ext).replace(/\\/g, '/');
        if (isValidPath(candidate)) return candidate;
    }

    if (!isValidPath(direct)) return null;
    return direct;
}

function isValidPath(p) {
    if (!p) return false;
    if (/\s/.test(p)) return false;
    if (LANG_TOKENS.has(p.toLowerCase())) return false;
    if (p.startsWith('-')) return false;
    if (p.length < 3) return false;
    // Never allow traversal ("../x"). Dot-folders such as ".github" are fine.
    if (p.split('/').some(seg => seg === '..' || seg === '.')) return false;
    // Allow Next.js dynamic segments: [param], [[...param]], (group), and catch-all ... inside
    if (!/^[a-zA-Z0-9._\-\/\[\]\(\)]+$/.test(p)) return false;
    const base = p.split('/').pop() || '';
    if (!base) return false;
    if (SPECIAL_BASENAMES.has(base)) return true;
    if (ENV_FILE_RE.test(base)) return true;
    // dotfiles like .gitignore / .dockerignore (no second dot in the name)
    const isDotfile = base.startsWith('.') && base.indexOf('.', 1) === -1;
    if (!isDotfile && !EXT_RE.test(base)) return false;
    // Strip bracket/parenthesis wrappers for ext check
    const cleanForExt = base.replace(/[\[\]\(\)]/g, '');
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
    // A declaration line is code, however prose-like it reads.
    if (DECLARATION_RE.test(line)) return false;
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
        if (!/^(import|export|const|let|var|function|class|interface|type|return|if|for|while|async|await|from|wrap|trigger|panel|hint|row|input|namespace|use|public|private|protected|static|final|abstract|enum|trait|extends|implements)\b/i.test(t)) {
            return true;
        }
    }
    // "Replace the ..." "And update the..."
    if (/^(replace|and)\s+the\b/i.test(t) && !CODE_CHARS_RE.test(t)) return true;
    return false;
}

// ---------------------------------------------------------------------------
// Fence handling
// ---------------------------------------------------------------------------

/**
 * Extract the interiors of the top-level fenced blocks in a buffer.
 *
 * A fence with an info string ("```ts") is always an OPENER, never a closer,
 * and a closing fence must be at least as long as the opener — that keeps
 * nested markdown fences intact instead of cutting the file at the inner
 * fence.
 *
 * Returns an empty array when the buffer contains no fences at all.
 */
function parseFenceBlocks(buf) {
    const fences = [];
    for (let i = 0; i < buf.length; i++) {
        const m = buf[i].match(/^\s*(`{3,}|~{3,})(.*)$/);
        if (!m) continue;
        fences.push({ index: i, len: m[1].length, hasInfo: m[2].trim().length > 0 });
    }
    if (!fences.length) return [];

    const blocks = [];
    let fi = 0;
    while (fi < fences.length) {
        const open = fences[fi];
        let close = -1;
        for (let k = fi + 1; k < fences.length; k++) {
            const f = fences[k];
            if (f.hasInfo) continue;          // "```js" opens a nested block
            if (f.len < open.len) continue;    // shorter fence — nested block
            close = k;
            break;
        }
        if (close !== -1) {
            blocks.push(buf.slice(open.index + 1, fences[close].index).join('\n'));
            fi = close + 1;
        } else {
            if (fi === 0 && fences.length === 1 && open.index > 0) {
                // Lone closing fence (missing opening) — content sits before it.
                blocks.push(buf.slice(0, open.index).join('\n'));
            } else {
                // Unclosed opener (truncated paste) — content sits after it.
                blocks.push(buf.slice(open.index + 1).join('\n'));
            }
            break;
        }
    }
    return blocks;
}

function trimBlankEdges(text) {
    return text.replace(/^\n+/, '').replace(/\n+$/, '');
}

function cleanContentBuffer(buf, ext) {
    if (!buf.length) return '';
    const raw = buf.join('\n');
    const phpLike = ext === 'php';
    const vueLike = ext === 'vue';

    // Priority 1.5: closing fence but no opening — treat content before the closing fence as fenced
    // This handles the common AI output pattern where the opening ``` is missing:
    //   path (Replace: target)
    //   php
    //       code...
    //   ```
    const fenceIdxs = [];
    for (let i = 0; i < buf.length; i++) {
        if (buf[i].trim().startsWith('```')) fenceIdxs.push(i);
    }
    if (fenceIdxs.length === 1 && fenceIdxs[0] > 0) {
        // Take everything before the closing fence, strip lang tokens and leading/trailing blanks
        return buf.slice(0, fenceIdxs[0])
            .filter(l => !LANG_TOKENS.has(l.trim().toLowerCase()))
            .join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
    }

    // Priority 1: if fenced blocks exist, use their interiors.
    const fences = parseFenceBlocks(buf);
    if (fences.length) {
        return fences.map(f => f.replace(/\n$/, '')).join('\n').trim();
    }
    // Priority 2: unfenced — strip language token lines and instruction lines,
    // and treat the first instruction-like line after code as a terminator (drops trailing prose like "That's the shape: …")
    const out = [];
    let seenCode = false;
    let inSfcBlock = false;
    for (let i = 0; i < buf.length; i++) {
        const line = buf[i];
        const t = line.trim();
        if (LANG_TOKENS.has(t.toLowerCase())) continue;
        if (t.startsWith('```')) continue; // skip fence delimiters
        if (vueLike) {
            if (SFC_OPEN_RE.test(line)) inSfcBlock = true;
            else if (SFC_CLOSE_RE.test(line)) inSfcBlock = false;
        }
        // PHP is whitespace sensitive and full of prose-looking declaration
        // lines — never terminate a PHP file on a "prose" heuristic.
        const isInstr = phpLike ? false : isInstructionLine(line);
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
            // A declaration line is code, however prose-like it reads.
            const isDeclaration = DECLARATION_RE.test(line);
            // Inside a Vue SFC block the text is markup/code, never trailing prose.
            // PHP is whitespace sensitive and full of prose-looking declaration
            // lines — never terminate a PHP file on a "prose" heuristic.
            if (isProse && isTopLevel && !isDeclaration && !phpLike && !(vueLike && inSfcBlock)) break;
        }
        out.push(line);
    }
    // trim leading/trailing blank lines
    return trimBlankEdges(out.join('\n'));
}

// ---------------------------------------------------------------------------
// Entry bookkeeping
// ---------------------------------------------------------------------------

/**
 * True when the current file's buffer ends with a closing fence whose
 * opening fence is missing — the AI wrote the code without the opening
 * ```. The file therefore ended at that fence and the next path line starts
 * a new file instead of continuing the current one.
 */
function hasUnmatchedClosingFence(buf) {
    let count = 0;
    let lastWasBare = false;
    for (const line of buf) {
        const t = line.trim();
        if (!t.startsWith('```')) continue;
        count++;
        const m = t.match(/^(`{3,}|~{3,})(.*)$/);
        lastWasBare = !!(m && m[2].trim() === '');
    }
    return count % 2 === 1 && lastWasBare;
}

function pushEntry(entry, entries, byPath) {
    const isSurgical = entry.mode !== 'full';
    if (!isSurgical && byPath.has(entry.relPath)) {
        // full mode: last wins
        Object.assign(byPath.get(entry.relPath), entry);
        const idx = entries.findIndex(e => e.relPath === entry.relPath && e.mode === 'full');
        if (idx !== -1) entries[idx] = { ...entries[idx], ...entry };
        else entries.push(entry);
    } else {
        if (!isSurgical) byPath.set(entry.relPath, entry);
        entries.push(entry);
    }
}

function surgicalFromLine(line) {
    const surgicalMatch = line.match(SURGICAL_RE);
    if (!surgicalMatch) return null;
    const opRaw = surgicalMatch[1].toLowerCase().replace(/\s+/g, '');
    const targetRaw = surgicalMatch[2].trim();
    if (opRaw === 'update' || opRaw === 'replace') return { mode: 'update', target: targetRaw };
    if (opRaw === 'addafter' || opRaw === 'add') return { mode: 'addAfter', target: targetRaw };
    if (opRaw === 'addbefore') return { mode: 'addBefore', target: targetRaw };
    if (opRaw === 'remove') return { mode: 'remove', target: targetRaw };
    return { mode: 'update', target: targetRaw };
}

// ---------------------------------------------------------------------------
// Legacy (heuristic) region parser
// ---------------------------------------------------------------------------

function parseRegion(lines, entries, byPath) {
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
        const content = cleanContentBuffer(buf, extOfPath(curPath));
        const relPath = curPath.replace(/\\/g, '/').replace(/^\.?\//, '');
        pushEntry({ relPath, content, mode: curMode, target: curTarget }, entries, byPath);
        curPath = null; buf = []; curMode = 'full'; curTarget = null;
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const isFenceLine = trimmed.startsWith('```');

        // Path check first — even inside an outer wrapper fence we want to catch headers like
        // "```" (outer) -> "components/foo.tsx" -> "```tsx"
        // Code fences belonging to an open file are never headers (kills
        // import string literals and file-tree blocks inside code).
        if (!isFenceLine) {
            if (isImportLike(line)) {
                if (curPath !== null) buf.push(line);
                continue;
            }
            const cand = extractPathCandidate(line);
            if (cand) {
                let isHeader = !inFence;
                if (inFence) {
                    // Inside a file's own code fence: never a new header —
                    // UNLESS the fence we are "inside" is actually a closing
                    // fence whose opening was never emitted. Then the file
                    // ended there and this path line starts the next file.
                    if (curPath !== null) {
                        if (!hasUnmatchedClosingFence(buf)) {
                            buf.push(line);
                            continue;
                        }
                        isHeader = true;
                        inFence = false;
                    } else {
                        let j = i + 1;
                        while (j < lines.length && !lines[j].trim()) j++;
                        if (j < lines.length && lines[j].trim().startsWith('```')) isHeader = true;
                        else isHeader = false;
                    }
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
                        const s = surgicalFromLine(line);
                        curMode = s.mode;
                        curTarget = s.target;
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
}

// ---------------------------------------------------------------------------
// Explicit block parser (<<<START … <<<END)
// ---------------------------------------------------------------------------

function parseExplicitBlock(region, entries, byPath) {
    let path = null;
    let sourceLine = null;
    for (const line of region.preceding) {
        const cand = extractPathCandidate(line);
        if (cand) { path = cand; sourceLine = line; break; }
    }
    // No path → nothing we can seed. Silently skipped (like "(Partial)").
    if (!path) return null;

    if (!surgicalFromLine(sourceLine) && PARTIAL_RE.test(sourceLine)) return null;

    const surgical = surgicalFromLine(sourceLine);
    const mode = surgical ? surgical.mode : 'full';
    const target = surgical ? surgical.target : null;

    const relPath = path.replace(/\\/g, '/').replace(/^\.?\//, '');
    const entry = {
        relPath,
        content: trimBlankEdges(region.content),
        mode,
        target,
    };
    if (!region.hasEndMarker) {
        entry.warning = 'no END marker — content may be truncated';
    }
    pushEntry(entry, entries, byPath);
    return entry;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Does at least one explicit block carry a usable path line?
 *
 * Safety net for prose that merely *mentions* the markers (a README
 * documenting the format, for example). If no block has a path above its
 * start marker, the paste is not a block format and the legacy parser has to
 * handle it.
 */
function hasUsableExplicitBlock(regions) {
    for (const region of regions) {
        if (region.type !== 'block') continue;
        for (const line of region.preceding) {
            if (extractPathCandidate(line)) return true;
        }
    }
    return false;
}

/**
 * Smart content parser.
 *
 * Two formats are supported:
 *  1. Explicit blocks — "<path>" + "<<<START" + verbatim code + "<<<END".
 *     Content is taken literally: no fence stripping, no prose heuristics and
 *     no path-header promotion inside the block. This is the format the AI
 *     rule asks for and the only safe one for PHP/Vue files.
 *     The whole batch may be wrapped in a single fenced container.
 *  2. Legacy heuristic parsing — fenced or unfenced "path + code" pastes.
 *
 * Both formats can be mixed in a single paste.
 */
export function parseContentBlocks(raw) {
    const entries = [];
    const byPath = new Map();
    if (!raw || !raw.trim()) return entries;

    if (hasExplicitBlocks(raw)) {
        const regions = splitExplicitBlocks(raw);
        if (hasUsableExplicitBlock(regions)) {
            for (const region of regions) {
                if (region.type === 'text') parseRegion(region.lines, entries, byPath);
                else parseExplicitBlock(region, entries, byPath);
            }
            return entries;
        }
    }

    parseRegion(raw.split(/\r?\n/), entries, byPath);
    return entries;
}

// Exported for the UI/tests: does this paste use the explicit block format?
export { hasExplicitBlocks };
