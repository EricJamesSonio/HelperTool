const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^\s{0,3}(`{3,}|~{3,})\s*$/;
const HEAD_RE = /^\s{0,3}#{1,6}\s/;
const QUOTE_RE = /^\s{0,3}>/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_RE = /^\s*\|/;
const TODO_RE = /^\s*[-*+]\s+\[[ xX]\]\s+/;
const BULLET_RE = /^\s*[-*+]\s+/;
const NUM_RE = /^\s*\d+[.)]\s+/;
const SEP_RE = /\s+-{2,}\s+|\s*[\u2013\u2014]\s*|\s+(?:=>|->|\u2192)\s+/;
const CALLOUT_RE = /^(note|tip|warning|important|remember|reminder|caution)\s*:\s*(\S.*)$/i;
const END_PUNCT_RE = /[.!?;,]$/;
const LIST_KINDS = new Set(['bullet', 'todo', 'num']);
const TITLE_MAX = 70;
const LIST_TITLE_MAX = 60;

function normLine(line) {
    let out = line.replace(/^(\s*)[\u2022\u25AA\u25E6]\s*/, '$1- ');
    const todo = /^(\s*)\[([ xX]?)\]\s+(\S.*)$/.exec(out);
    if (todo) {
        const mark = todo[2].toLowerCase() === 'x' ? 'x' : ' ';
        out = todo[1] + '- [' + mark + '] ' + todo[3];
    }
    return out;
}

function kindOf(line) {
    if (HEAD_RE.test(line)) return 'head';
    if (QUOTE_RE.test(line)) return 'quote';
    if (HR_RE.test(line)) return 'hr';
    if (TABLE_RE.test(line)) return 'table';
    if (TODO_RE.test(line)) return 'todo';
    if (BULLET_RE.test(line)) return 'bullet';
    if (NUM_RE.test(line)) return 'num';
    return 'plain';
}

function titleLike(t, max) {
    if (!t || t.length > max) return false;
    if (END_PUNCT_RE.test(t)) return false;
    if (/:\s+\S|@|https?:|[`|]/.test(t)) return false;
    return t.split(/\s+/).length <= 10;
}

function stripColon(t) {
    return t.replace(/\s*:\s*$/, '');
}

function cap(word) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function buildTable(rows) {
    const cells = rows.map((r) => r.split(SEP_RE).map((c) => c.trim().replace(/\|/g, '/')));
    const cols = Math.max(...cells.map((r) => r.length));
    const fit = cells.map((r) => {
        const o = r.slice();
        while (o.length < cols) o.push('');
        return o;
    });
    const line = (r) => '| ' + r.join(' | ') + ' |';
    const out = [line(fit[0]), '| ' + fit[0].map(() => '---').join(' | ') + ' |'];
    for (let i = 1; i < fit.length; i++) out.push(line(fit[i]));
    return out.join('\n');
}

function listPiece(run) {
    const bullets = run.every((l) => kindOf(l) === 'bullet');
    if (bullets && run.length >= 2) {
        const rows = run.map((l) => l.replace(BULLET_RE, '').trim());
        const withSep = rows.filter((r) => SEP_RE.test(r)).length;
        if (withSep >= 2) return buildTable(rows);
    }
    return run.map((l) => l.replace(/^\s+/, '')).join('\n');
}

function formatBlock(raw, ctx) {
    const ls = raw.map(normLine);
    if (ls.some((l) => kindOf(l) === 'table')) return ls.join('\n');
    const pieces = [];
    let i = 0;
    while (i < ls.length) {
        const line = ls[i];
        const k = kindOf(line);
        if (LIST_KINDS.has(k)) {
            const run = [];
            while (i < ls.length && LIST_KINDS.has(kindOf(ls[i]))) {
                run.push(ls[i]);
                i++;
            }
            pieces.push(listPiece(run));
            continue;
        }
        if (k === 'quote') {
            const run = [];
            while (i < ls.length && kindOf(ls[i]) === 'quote') {
                run.push(ls[i]);
                i++;
            }
            pieces.push(run.join('\n'));
            continue;
        }
        if (k === 'head' || k === 'hr') {
            pieces.push(line.trim());
            i++;
            continue;
        }
        const t = line.trim();
        if (ctx.auto) {
            const callout = CALLOUT_RE.exec(t);
            if (callout) {
                pieces.push('> **' + cap(callout[1]) + ':** ' + callout[2]);
                i++;
                continue;
            }
            const nextIsList = i + 1 < ls.length && LIST_KINDS.has(kindOf(ls[i + 1]));
            if (nextIsList && titleLike(t, LIST_TITLE_MAX) && (i === 0 || t.endsWith(':'))) {
                pieces.push('### ' + stripColon(t));
                i++;
                continue;
            }
            if (ls.length === 1 && ctx.hasNext && titleLike(t, TITLE_MAX)) {
                pieces.push((t.endsWith(':') ? '### ' : '## ') + stripColon(t));
                i++;
                continue;
            }
            pieces.push(t);
            i++;
            continue;
        }
        const run = [t];
        i++;
        while (i < ls.length && kindOf(ls[i]) === 'plain') {
            run.push(ls[i].trim());
            i++;
        }
        pieces.push(run.join('\n'));
    }
    return pieces.join('\n\n');
}

function splitSegments(lines) {
    const segs = [];
    let cur = { code: false, lines: [] };
    let fence = null;
    const push = () => {
        if (cur.lines.length) segs.push(cur);
    };
    for (const line of lines) {
        if (fence) {
            cur.lines.push(line);
            const close = FENCE_CLOSE.exec(line);
            if (close && close[1].charAt(0) === fence.ch && close[1].length >= fence.len) {
                fence = null;
                push();
                cur = { code: false, lines: [] };
            }
            continue;
        }
        const open = FENCE_OPEN.exec(line);
        if (open) {
            push();
            cur = { code: true, lines: [line] };
            fence = { ch: open[1].charAt(0), len: open[1].length };
            continue;
        }
        cur.lines.push(line);
    }
    push();
    return segs;
}

export function smartFormat(src, opts) {
    const text = String(src || '').replace(/\r\n?/g, '\n');
    if (!text.trim()) return text;
    if (opts && opts.tablesOnly) return tablesOnly(text);
    const segs = splitSegments(text.split('\n'));
    const items = [];
    for (const seg of segs) {
        if (seg.code) {
            items.push({ code: true, lines: seg.lines });
            continue;
        }
        let block = [];
        const flush = () => {
            if (block.length) items.push({ code: false, lines: block });
            block = [];
        };
        for (const l of seg.lines) {
            if (!l.trim()) flush();
            else block.push(l);
        }
        flush();
    }
    const hasHeading = items.some((it) => !it.code && it.lines.some((l) => HEAD_RE.test(l)));
    const auto = !hasHeading;
    return items
        .map((it, k) => (it.code
            ? it.lines.join('\n')
            : formatBlock(it.lines, { auto, hasNext: k < items.length - 1 })))
        .join('\n\n');
}
function tablesOnly(text) {
    const segs = splitSegments(text.split('\n'));
    const out = [];
    for (const seg of segs) {
        if (seg.code) {
            seg.lines.forEach((l) => out.push(l));
            continue;
        }
        const ls = seg.lines;
        let i = 0;
        while (i < ls.length) {
            if (kindOf(normLine(ls[i])) !== 'bullet') {
                out.push(ls[i]);
                i++;
                continue;
            }
            const start = i;
            const run = [];
            while (i < ls.length && kindOf(normLine(ls[i])) === 'bullet') {
                run.push(normLine(ls[i]));
                i++;
            }
            const rows = run.map((l) => l.replace(BULLET_RE, '').trim());
            const withSep = rows.filter((r) => SEP_RE.test(r)).length;
            if (run.length >= 2 && withSep >= 2) {
                if (out.length && out[out.length - 1].trim()) out.push('');
                out.push(buildTable(rows));
                if (i < ls.length && ls[i].trim()) out.push('');
            } else {
                for (let j = start; j < i; j++) out.push(ls[j]);
            }
        }
    }
    return out.join('\n');
}
