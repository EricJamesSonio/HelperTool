'use strict';

// Repair helpers for pasted file content.
//
// LLMs regularly return code that is *syntactically* broken even though it
// looks fine at a glance:
//
//   1. Collapsed files — the whole SFC / module on one line:
//        <template>…</template> <script setup> import a from 'x' import b from 'y' …
//      Adjacent `import` statements without newlines are a real JS syntax error.
//   2. Typographic quotes — `emit(‘confirm’)`, `:class="{ ‘is-on’: x }"`.
//      Those are invalid in template expressions and break the compiler, but
//      the syntax tree alone does not catch them (attributes are not parsed
//      as JavaScript).
//
// Both are repaired *conservatively*: the collapse repair only runs when the
// block has no usable line structure, and every repair is verified afterwards.
// If the repaired text parses worse than the original, the original wins.

const syntaxVerifier = require('./syntaxVerifier');

const JS_FAMILY = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts', 'vue']);

const STATEMENT_KEYWORDS = new Set([
    'import', 'export', 'const', 'let', 'var', 'function', 'class', 'async',
    'if', 'for', 'while', 'do', 'switch', 'try', 'return', 'throw', 'await',
]);

// A statement can start right after one of these characters.
const SPLIT_AFTER = new Set([';', '}', ')', "'", '"', '`']);

function isJsFamily(ext) {
    return JS_FAMILY.has(String(ext || '').toLowerCase().replace(/^\./, ''));
}

/**
 * True when the block has no usable line structure (one non-empty line).
 */
function isCollapsed(text) {
    const t = String(text ?? '').trim();
    if (!t) return false;
    return t.split(/\r?\n/).filter(l => l.trim()).length <= 1;
}

/**
 * Convert paired typographic quotes to ASCII.
 *
 * Skips a pair that sits directly inside an ASCII-quoted string
 * (`title="“ok”"`), because rewriting that only produces more broken quotes.
 * Word-internal apostrophes ("don’t") are left alone too — no opening pair.
 */
function fixSmartQuotes(text) {
    const src = String(text ?? '');
    if (!/[\u2018\u2019\u201C\u201D]/.test(src)) return { text: src, changed: false };
    const out = src
        .replace(/(?<!["'])\u2018([^\u2018\u2019\r\n]{1,300})\u2019/g, "'$1'")
        .replace(/(?<!["'])\u201C([^\u201C\u201D\r\n]{1,300})\u201D/g, '"$1"');
    return { text: out, changed: out !== src };
}

/**
 * Put each SFC section tag on its own line.
 */
function splitSfcSections(text) {
    return String(text ?? '')
        .replace(/[ \t]*(?=<\/(?:template|script|style)>)/gi, '\n')
        .replace(/(<\/(?:template|script|style)>)[ \t]*(?!\r?\n)/gi, '$1\n')
        .replace(/[ \t]*(?=<(?:script|style)\b[^>]*>)/gi, '\n')
        .replace(/(<(?:script|style)\b[^>]*>)[ \t]*(?!\r?\n)/gi, '$1\n')
        .replace(/\n{3,}/g, '\n\n');
}

/**
 * Insert line breaks between top-level statements.
 *
 * String / template-literal / comment aware, and only splits at bracket depth
 * 0, so object literals, arrow bodies and template expressions stay intact.
 */
function rewrapJsStatements(text) {
    const src = String(text ?? '');
    const out = [];
    let i = 0;
    let depth = 0;
    let quote = null;
    let prev = '';

    while (i < src.length) {
        const ch = src[i];
        const next = src[i + 1];

        if (quote) {
            out.push(ch);
            if (ch === '\\') { out.push(next ?? ''); i += 2; continue; }
            if (ch === quote) quote = null;
            i += 1;
            continue;
        }

        if (ch === "'" || ch === '"' || ch === '`') {
            quote = ch;
            out.push(ch);
            prev = ch;
            i += 1;
            continue;
        }

        // Comments are copied verbatim.
        if (ch === '/' && next === '/') {
            const end = src.indexOf('\n', i);
            const stop = end === -1 ? src.length : end;
            out.push(src.slice(i, stop));
            i = stop;
            continue;
        }
        if (ch === '/' && next === '*') {
            const end = src.indexOf('*/', i);
            const stop = end === -1 ? src.length : end + 2;
            out.push(src.slice(i, stop));
            i = stop;
            continue;
        }

        if (ch === '{' || ch === '(' || ch === '[') depth += 1;
        else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);

        if (depth === 0 && ch === ';') {
            out.push(';\n');
            i += 1;
            while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i += 1;
            prev = ';';
            continue;
        }

        if (depth === 0 && /\s/.test(ch) && SPLIT_AFTER.has(prev)) {
            const rest = src.slice(i).trimStart();
            const word = (rest.match(/^[A-Za-z_$][\w$]*/) || [''])[0];
            if (STATEMENT_KEYWORDS.has(word)) {
                out.push('\n');
                i += 1;
                continue;
            }
        }

        out.push(ch);
        if (!/\s/.test(ch)) prev = ch;
        i += 1;
    }

    return out
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+/, '')
        .replace(/\s+$/, '');
}

function rewrapVue(text) {
    const withSections = splitSfcSections(text);
    return withSections.replace(
        /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
        (_m, open, body, close) => {
            const inner = rewrapJsStatements(body);
            return inner ? `${open}\n${inner}\n${close}` : `${open}${close}`;
        },
    );
}

async function safeVerify(text, ext) {
    try {
        return await syntaxVerifier.verifySyntax(text, ext);
    } catch (_) {
        return null;
    }
}

/**
 * Repair a pasted block and report what was changed.
 *
 * @returns {Promise<{
 *   text: string,
 *   repairs: string[],
 *   error: null | { ok:false, error:string, line?:number, column?:number, snippet?:string },
 *   collapsed: boolean,
 * }>}
 *
 * `error` is the verification result of the text that will actually be used.
 */
async function prepareContent(text, ext) {
    const original = String(text ?? '');
    const e = String(ext || '').toLowerCase().replace(/^\./, '');
    const repairs = [];
    const collapsed = isCollapsed(original);

    if (!original.trim()) {
        return { text: original, repairs, error: null, collapsed };
    }

    const before = await safeVerify(original, e);

    let candidate = original;
    const quoted = fixSmartQuotes(candidate);
    if (quoted.changed) {
        candidate = quoted.text;
        repairs.push('smart quotes');
    }

    // Only re-expand a block when it has no line structure *and* it is broken.
    // A valid one-liner is someone's intentional formatting — leave it alone.
    if (isJsFamily(e) && isCollapsed(candidate) && before && !before.ok) {
        const expanded = e === 'vue' ? rewrapVue(candidate) : rewrapJsStatements(candidate);
        if (expanded && expanded.trim() && expanded !== candidate) {
            candidate = expanded;
            repairs.push('single-line');
        }
    }

    const after = candidate === original ? before : await safeVerify(candidate, e);

    // Never turn valid code into invalid code.
    if (before === null && after && !after.ok) {
        return { text: original, repairs: [], error: null, collapsed };
    }

    return { text: candidate, repairs, error: after, collapsed };
}

module.exports = {
    prepareContent,
    fixSmartQuotes,
    isCollapsed,
    isJsFamily,
    rewrapJsStatements,
    rewrapVue,
    splitSfcSections,
};
