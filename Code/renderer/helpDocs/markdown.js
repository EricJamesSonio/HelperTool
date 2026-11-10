const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const IMG_LINE_RE = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/;
const HR_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEAD_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE_RE = /^\s*(```|~~~)\s*([\w-]*)\s*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function esc(s) {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveRel(baseDir, src) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) return null;
  const parts = (baseDir ? String(baseDir).split('/') : []).concat(String(src).split('/'));
  const out = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

// alt and src must already be HTML-escaped
function imgHtml(alt, src, opts) {
  const rel = resolveRel(opts.baseDir, src);
  if (rel === null) {
    if (/^(?:https?:|data:image\/)/i.test(src)) {
      return '<img class="hd-md-img loaded" alt="' + alt + '" src="' + src + '">';
    }
    return '';
  }
  return '<img class="hd-md-img" alt="' + alt + '" data-src="' + rel + '">';
}

function inline(text, opts) {
  const stash = [];
  const keep = (html) => {
    stash.push(html);
    return '\u0000' + (stash.length - 1) + '\u0000';
  };

  let s = String(text).replace(/`([^`]+)`/g, (_, c) => keep('<code class="hd-md-code">' + esc(c) + '</code>'));
  s = esc(s);

  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*?&quot;)?\)/g, (_, alt, src) => keep(imgHtml(alt, src, opts)));

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*?&quot;)?\)/g, (_, label, href) => {
    if (/^https?:\/\//i.test(href)) {
      return keep('<a class="hd-md-link" data-ext="1" href="' + href + '">' + label + '</a>');
    }
    return label;
  });

  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\s](?:[^*]*[^*\s])?)\*/g, '<em>$1</em>');

  for (let k = 0; k < 3 && /\u0000\d+\u0000/.test(s); k++) {
    s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => stash[Number(n)] || '');
  }
  return s;
}

function capOf(text) {
  const m = /^\[([^\]]+)\]$/.exec(String(text).trim());
  return m ? m[1] : null;
}

function figureHtml(caption, alt, src, opts, descHtml) {
  return '<figure class="hd-md-fig">' +
    (caption ? '<figcaption class="hd-md-figcap">' + esc(caption) + '</figcaption>' : '') +
    imgHtml(esc(alt), esc(src), opts) +
    (descHtml ? '<p class="hd-md-figdesc">' + descHtml + '</p>' : '') +
    '</figure>';
}

function parseList(lines, start) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST_RE.exec(lines[i]);
    if (m) {
      items.push({
        indent: m[1].replace(/\t/g, '    ').length,
        ordered: /\d/.test(m[2]),
        text: m[3],
      });
      i++;
      continue;
    }
    if (items.length && /^\s{2,}\S/.test(lines[i]) && !FENCE_RE.test(lines[i])) {
      items[items.length - 1].text += ' ' + lines[i].trim();
      i++;
      continue;
    }
    if (items.length && lines[i].trim() === '' && i + 1 < lines.length && LIST_RE.test(lines[i + 1])) {
      i++;
      continue;
    }
    break;
  }
  return { items, next: i };
}

function buildList(items, start, opts) {
  const base = items[start].indent;
  const tag = items[start].ordered ? 'ol' : 'ul';
  let html = '<' + tag + ' class="hd-md-list">';
  let i = start;
  while (i < items.length && items[i].indent >= base) {
    const it = items[i];
    const cap = capOf(it.text);
    let inner = cap ? esc(cap) : inline(it.text, opts);
    i++;
    if (i < items.length && items[i].indent > base) {
      const r = buildList(items, i, opts);
      inner += r.html;
      i = r.next;
    }
    html += '<li' + (cap ? ' class="hd-md-cap"' : '') + '>' + inner + '</li>';
  }
  return { html: html + '</' + tag + '>', next: i };
}

function splitRow(line) {
  let t = line.trim();
  if (t.charAt(0) === '|') t = t.slice(1);
  if (t.charAt(t.length - 1) === '|') t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

function isBlockStart(l) {
  return FENCE_RE.test(l) || HR_RE.test(l) || HEAD_RE.test(l) || LIST_RE.test(l) || /^\s*>/.test(l) || IMG_LINE_RE.test(l);
}

function isTableStart(lines, i) {
  return lines[i].indexOf('|') !== -1 &&
    i + 1 < lines.length &&
    lines[i + 1].indexOf('-') !== -1 &&
    TABLE_SEP_RE.test(lines[i + 1]);
}

function readDesc(lines, start, opts) {
  let j = start;
  while (j < lines.length && !lines[j].trim()) j++;
  const buf = [];
  while (j < lines.length && lines[j].trim() && !isBlockStart(lines[j]) && !isTableStart(lines, j)) {
    buf.push(lines[j].trim());
    j++;
  }
  if (!buf.length) return { html: '', next: start };
  return { html: inline(buf.join(' '), opts), next: j };
}

function renderBlocks(lines, opts) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    let m = FENCE_RE.exec(line);
    if (m) {
      const fence = m[1];
      const buf = [];
      i++;
      while (i < lines.length && lines[i].trim().indexOf(fence) !== 0) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push('<pre class="hd-md-pre"><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }

    if (HR_RE.test(line)) {
      out.push('<hr class="hd-md-hr">');
      i++;
      continue;
    }

    m = HEAD_RE.exec(line);
    if (m) {
      const level = m[1].length;
      out.push('<h' + level + ' class="hd-md-h hd-md-h' + level + '">' + inline(m[2], opts) + '</h' + level + '>');
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push('<blockquote class="hd-md-quote">' + renderBlocks(buf, opts) + '</blockquote>');
      continue;
    }

    if (isTableStart(lines, i)) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') !== -1) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      let t = '<div class="hd-md-tablewrap"><table class="hd-md-table"><thead><tr>';
      head.forEach((c) => { t += '<th>' + inline(c, opts) + '</th>'; });
      t += '</tr></thead><tbody>';
      rows.forEach((r) => {
        t += '<tr>';
        r.forEach((c) => { t += '<td>' + inline(c, opts) + '</td>'; });
        t += '</tr>';
      });
      t += '</tbody></table></div>';
      out.push(t);
      continue;
    }

    if (LIST_RE.test(line)) {
      const parsed = parseList(lines, i);
      const items = parsed.items;
      if (items.length === 1 && capOf(items[0].text)) {
        let j = parsed.next;
        while (j < lines.length && !lines[j].trim()) j++;
        const im = j < lines.length ? IMG_LINE_RE.exec(lines[j]) : null;
        if (im) {
          const d = readDesc(lines, j + 1, opts);
          out.push(figureHtml(capOf(items[0].text), im[1], im[2], opts, d.html));
          i = d.next > j + 1 ? d.next : j + 1;
          continue;
        }
      }
      out.push(buildList(items, 0, opts).html);
      i = parsed.next;
      continue;
    }

    m = IMG_LINE_RE.exec(line);
    if (m) {
      const d = readDesc(lines, i + 1, opts);
      out.push(figureHtml('', m[1], m[2], opts, d.html));
      i = d.next > i + 1 ? d.next : i + 1;
      continue;
    }

    const buf = [];
    while (i < lines.length && lines[i].trim() && (buf.length === 0 || !isBlockStart(lines[i]))) {
      buf.push(lines[i].trim());
      i++;
    }
    out.push('<p class="hd-md-p">' + inline(buf.join(' '), opts) + '</p>');
  }
  return out.join('');
}

export function renderMarkdown(src, opts) {
  const options = opts || {};
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  return renderBlocks(lines, options);
}