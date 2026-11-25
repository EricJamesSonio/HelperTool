/**
 * PDF Writer parser: reads [[SECTION: S#]] blocks pasted from the AI and
 * validates them against the sections found in the PDF.
 */

import { EDITABLE_KINDS, pageLabel } from './writerModel.js';

const OPEN = /^\s*\[\[\s*SECTION\s*:\s*([A-Za-z0-9_-]+)[^\]]*\]\]\s*$/i;
const CLOSE = /^\s*\[\[\s*END\s*\]\]\s*$/i;
const HOLDER = /\[CONFIRM[^\]]*\]/gi;

export function parseBlocks(text) {
  const blocks = [];
  const errors = [];
  let current = null;
  let outside = 0;
  const rows = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  rows.forEach((row, i) => {
    if (/^\s*```/.test(row)) return;
    const open = OPEN.exec(row);
    if (open) {
      if (current) {
        errors.push('Block ' + current.id + ' has no [[END]] before the next [[SECTION]] (line ' + (i + 1) + ').');
      }
      current = { id: open[1].toUpperCase(), lines: [], line: i + 1 };
      blocks.push(current);
      return;
    }
    if (CLOSE.test(row)) {
      if (!current) errors.push('Found [[END]] without a block (line ' + (i + 1) + ').');
      current = null;
      return;
    }
    if (current) current.lines.push(row);
    else if (row.trim()) outside += 1;
  });
  if (current) errors.push('Block ' + current.id + ' is missing its [[END]].');
  return { blocks, errors, outside };
}

/**
 * Lists every distinct [CONFIRM: ...] placeholder in the pasted text,
 * with the sections it appears in and one line of context.
 */
export function findPlaceholders(text) {
  const map = new Map();
  let sec = '';
  String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach((row) => {
    const open = OPEN.exec(row);
    if (open) {
      sec = open[1].toUpperCase();
      return;
    }
    if (CLOSE.test(row)) {
      sec = '';
      return;
    }
    const found = row.match(HOLDER);
    if (!found) return;
    found.forEach((raw) => {
      let item = map.get(raw);
      if (!item) {
        const label = raw.replace(/^\[CONFIRM\s*:?\s*/i, '').replace(/\]$/, '').trim();
        item = { raw, label: label || 'missing information', count: 0, sections: [], context: '' };
        map.set(raw, item);
      }
      item.count += 1;
      if (sec && item.sections.indexOf(sec) === -1) item.sections.push(sec);
      if (!item.context) item.context = row.trim();
    });
  });
  return Array.from(map.values());
}

/**
 * Replaces every occurrence of one placeholder. An empty value removes it and
 * tidies the spacing and punctuation on the lines it was on.
 */
export function fillPlaceholder(text, raw, value) {
  const remove = value === null || value === undefined || value === '';
  return String(text || '').split('\n').map((row) => {
    if (row.indexOf(raw) === -1) return row;
    if (!remove) return row.split(raw).join(value);
    return row
      .split(raw)
      .join('')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([.,;:!?])/g, '$1')
      .replace(/\s+$/, '');
  }).join('\n');
}
/**
 * Removes the whole sentence (or the whole bullet or line) that holds a
 * placeholder, so no broken wording is left behind.
 */
export function dropSentence(text, raw) {
  const out = [];
  String(text || '').split('\n').forEach((row) => {
    if (row.indexOf(raw) === -1) {
      out.push(row);
      return;
    }
    let line = row;
    let guard = 0;
    while (line.indexOf(raw) !== -1 && guard < 20) {
      guard += 1;
      const at = line.indexOf(raw);
      const before = line.slice(0, at);
      const after = line.slice(at + raw.length);
      const cut = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '));
      const prefix = /^(\s*(?:#{1,2}|[-*])\s+)/.exec(line);
      const m = /[.!?](\s|$)/.exec(after);
      const tail = m ? after.slice(m.index + 1).replace(/^\s+/, '') : '';
      if (cut === -1) {
        line = (prefix ? prefix[1] : '') + tail;
      } else {
        const head = before.slice(0, cut + 1);
        line = head + (tail ? ' ' + tail : '');
      }
    }
    if (/[A-Za-z0-9]/.test(line)) out.push(line.replace(/\s+$/, ''));
  });
  return out.join('\n');
}

export function toItems(rawLines) {
  const items = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      items.push({ type: 'p', text: para.join(' ').replace(/\s+/g, ' ').trim() });
      para = [];
    }
  };
  for (const raw of rawLines) {
    const text = raw.trim();
    if (!text) {
      flush();
      continue;
    }
    let m = /^##\s+(.*)$/.exec(text);
    if (m) {
      flush();
      items.push({ type: 'h2', text: m[1].trim() });
      continue;
    }
    m = /^#\s+(.*)$/.exec(text);
    if (m) {
      flush();
      items.push({ type: 'h1', text: m[1].trim() });
      continue;
    }
    m = /^[-*\u2022\u25cf]\s+(.*)$/.exec(text);
    if (m) {
      flush();
      items.push({ type: 'b', text: m[1].trim() });
      continue;
    }
    para.push(text);
  }
  flush();
  return items.filter((item) => item.text);
}

export function toSlotLines(rawLines) {
  return rawLines
    .map((row) => row.trim().replace(/^#{1,2}\s+/, ''))
    .filter((row) => row);
}

function countType(items, type) {
  return items.filter((item) => item.type === type).length;
}

export function checkText(text, sections) {
  const byId = new Map(sections.map((s) => [s.id.toUpperCase(), s]));
  const parsed = parseBlocks(text);
  const result = {
    ok: false,
    errors: parsed.errors.slice(),
    warnings: [],
    blocks: [],
    replace: [],
    tocPages: null,
  };
  if (parsed.outside) {
    result.warnings.push(parsed.outside + ' line(s) outside any block were ignored.');
  }
  const seen = new Set();
  for (const block of parsed.blocks) {
    const info = { id: block.id, title: '', ok: true, messages: [], summary: '' };
    const sec = byId.get(block.id);
    if (!sec) {
      info.ok = false;
      info.messages.push('This PDF has no section with this ID.');
    } else {
      info.title = sec.title;
      const body = block.lines.join('\n');
      if (seen.has(block.id)) {
        info.ok = false;
        info.messages.push('This section appears more than once.');
      } else if (EDITABLE_KINDS.indexOf(sec.kind) === -1) {
        info.ok = false;
        info.messages.push('This section cannot be rewritten (it is kept as is).');
      } else if (/\[CONFIRM/i.test(body)) {
        info.ok = false;
        info.messages.push('It still contains [CONFIRM: ...] placeholders. Fill them in first.');
      } else if (sec.kind === 'slots') {
        const lines = toSlotLines(block.lines);
        let padded = 0;
        if (lines.length < sec.lines.length) {
          const tail = sec.lines.slice(lines.length);
          if (tail.every((l) => !/[A-Za-z0-9]/.test(l.t))) {
            padded = tail.length;
            while (lines.length < sec.lines.length) lines.push('');
          }
        }
        if (lines.length !== sec.lines.length) {
          info.ok = false;
          info.messages.push('Needs exactly ' + sec.lines.length + ' lines but has ' + lines.length + '.');
        } else {
          result.replace.push({ start: sec.start, end: sec.end, mode: 'slots', lines });
          info.summary = pageLabel(sec) + ': ' + sec.lines.length + ' lines';
          if (padded) {
            info.messages.push('The last ' + (padded === 1 ? 'line' : padded + ' lines') + ' of the original only held punctuation, so ' + (padded === 1 ? 'it is' : 'they are') + ' left blank.');
          }
        }
      } else {
        const items = toItems(block.lines);
        if (!items.length) {
          info.ok = false;
          info.messages.push('The block is empty.');
        } else {
          result.replace.push({ start: sec.start, end: sec.end, mode: 'flow', items });
          info.summary = pageLabel(sec) + ': ' + countType(items, 'h1') + ' heading, ' +
            countType(items, 'h2') + ' sub heading, ' + countType(items, 'p') + ' paragraphs, ' +
            countType(items, 'b') + ' bullets';
          if (sec.hasHeading && items[0].type !== 'h1') {
            info.messages.push('The heading line is missing. Contents matching may not find this section.');
          }
        }
      }
      seen.add(block.id);
    }
    result.blocks.push(info);
  }
  if (!parsed.blocks.length) {
    result.errors.push('No [[SECTION: S#]] blocks were found in the pasted text.');
  }
  const toc = sections.find((s) => s.kind === 'toc');
  if (toc) {
    result.tocPages = [toc.start, toc.end];
    if (result.replace.length) {
      result.warnings.push('The contents page numbers will be updated automatically.');
    }
  }
  result.ok = result.errors.length === 0 && result.blocks.every((b) => b.ok) && result.replace.length > 0;
  return result;
}