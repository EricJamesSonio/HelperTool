function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value) {
  const url = String(value || '').trim();
  if (!url || /[\u0000-\u001f]/.test(url)) return null;
  if (url.charAt(0) === '#') return url;
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.slice(0, 2) === '//') return null;
  return url;
}

function fileUrl(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  if (!/^(?:[a-zA-Z]:\/|\/)/.test(normalized)) return null;
  const encoded = normalized.split('/').map((part, index) =>
    index === 0 && /^[a-zA-Z]:$/.test(part) ? part : encodeURIComponent(part)
  ).join('/');
  return normalized.charAt(0) === '/' ? 'file://' + encoded : 'file:///' + encoded;
}

function imageUrl(url, basePath) {
  const safe = safeUrl(url);
  if (!safe || safe.charAt(0) === '#' || /^(?:https?:|mailto:)/i.test(safe)) return safe;
  const baseUrl = fileUrl(basePath);
  if (!baseUrl) return safe;
  try {
    return new URL(safe, baseUrl).href;
  } catch (_) {
    return null;
  }
}

function inline(source, basePath) {
  const pattern = /(!?)\[([^\]]+)\]\(([^)]+?)(?:\s+"([^"]*)")?\)|`([^`]+)`|(\*\*|__)(?=\S)(.+?\S)\6|(\*|_)(?=\S)(.+?\S)\8|~~(?=\S)(.+?\S)~~/g;
  let html = '';
  let last = 0;
  let match;
  while ((match = pattern.exec(source))) {
    html += escapeHtml(source.slice(last, match.index));
    if (match[2] !== undefined) {
      const url = match[1] ? imageUrl(match[3], basePath) : safeUrl(match[3]);
      const label = inline(match[2], basePath);
      if (!url) html += label;
      else if (match[1]) html += '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(match[2]) + '" loading="lazy">';
      else {
        const external = /^(https?:|mailto:)/i.test(url);
        html += '<a href="' + escapeHtml(url) + '"' +
          (match[4] ? ' title="' + escapeHtml(match[4]) + '"' : '') +
          (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>';
      }
    } else if (match[5] !== undefined) {
      html += '<code>' + escapeHtml(match[5]) + '</code>';
    } else if (match[6] !== undefined) {
      html += '<strong>' + inline(match[7], basePath) + '</strong>';
    } else if (match[8] !== undefined) {
      html += '<em>' + inline(match[9], basePath) + '</em>';
    } else {
      html += '<del>' + inline(match[10], basePath) + '</del>';
    }
    last = pattern.lastIndex;
  }
  return html + escapeHtml(source.slice(last));
}

function splitTableRow(line) {
  let row = line.trim();
  if (row.charAt(0) === '|') row = row.slice(1);
  if (row.charAt(row.length - 1) === '|') row = row.slice(0, -1);
  return row.split('|').map((cell) => cell.trim());
}

function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isBlockStart(lines, index) {
  const line = lines[index] || '';
  return /^\s{0,3}(```|~~~)/.test(line) ||
    /^\s{0,3}#{1,6}\s/.test(line) ||
    /^\s{0,3}(?:[-*_]\s*){3,}$/.test(line) ||
    /^\s{0,3}>\s?/.test(line) ||
    /^\s{0,3}(?:[-+*]|\d+[.)])\s+/.test(line) ||
    (index + 1 < lines.length && isTableDivider(lines[index + 1]));
}

function renderBlocks(lines, basePath) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(/^\s{0,3}(```+|~~~+)\s*([^\s`]*)?.*$/);
    if (fence) {
      const marker = fence[1].slice(0, 3);
      const language = (fence[2] || '').trim();
      const code = [];
      i++;
      while (i < lines.length && !new RegExp('^\\s{0,3}' + marker + '+\\s*$').test(lines[i])) {
        code.push(lines[i++]);
      }
      if (i < lines.length) i++;
      out.push('<pre><code' + (language ? ' class="language-' + escapeHtml(language) + '"' : '') + '>' +
        escapeHtml(code.join('\n')) + '</code></pre>');
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      out.push('<h' + level + '>' + inline(heading[2], basePath) + '</h' + level + '>');
      i++;
      continue;
    }

    if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const headers = splitTableRow(line);
      const dividers = splitTableRow(lines[i + 1]);
      const alignments = dividers.map((cell) =>
        cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : ''
      );
      const row = (cells, tag) => '<tr>' + headers.map((_, col) =>
        '<' + tag + (alignments[col] ? ' style="text-align:' + alignments[col] + '"' : '') + '>' +
        inline(cells[col] || '', basePath) + '</' + tag + '>'
      ).join('') + '</tr>';
      const body = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        body.push(row(splitTableRow(lines[i]), 'td'));
        i++;
      }
      out.push('<table><thead>' + row(headers, 'th') + '</thead><tbody>' + body.join('') + '</tbody></table>');
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + renderBlocks(quote, basePath) + '</blockquote>');
      continue;
    }

    const listMatch = line.match(/^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const tag = ordered ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        const task = item[2].match(/^\[([ xX])\]\s+(.*)$/);
        const text = task ? task[2] : item[2];
        items.push('<li>' + (task ? '<input type="checkbox" disabled' + (task[1].toLowerCase() === 'x' ? ' checked' : '') + '> ' : '') + inline(text, basePath) + '</li>');
        i++;
      }
      out.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
      continue;
    }

    const paragraph = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines, i)) {
      paragraph.push(lines[i].trim());
      i++;
    }
    out.push('<p>' + paragraph.map((text) => inline(text, basePath)).join(' ') + '</p>');
  }
  return out.join('');
}

export function renderMarkdown(markdown, basePath) {
  return renderBlocks(String(markdown || '').replace(/\r\n?/g, '\n').split('\n'), basePath);
}
