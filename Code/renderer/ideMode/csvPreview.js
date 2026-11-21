const CSS_ID = 'csvPreviewCss';
const MAX_RENDER = 1500;
const DELIMS = [',', ';', '\t', '|'];
const DELIM_NAME = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' };

const S = {
  rows: [],
  cols: 0,
  header: true,
  sortCol: -1,
  sortDir: 1,
  filter: '',
  delim: ',',
};

let wired = false;

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement('link');
  link.id = CSS_ID;
  link.rel = 'stylesheet';
  link.href = './styles/csv-preview.css';
  document.head.appendChild(link);
}

function detectDelim(text, filePath) {
  if (/\.tsv$/i.test(String(filePath || ''))) return '\t';
  const head = text.slice(0, 6000).split(/\r?\n/).slice(0, 6).join('\n');
  let best = ',';
  let bestN = 0;
  for (const d of DELIMS) {
    let n = 0;
    let inQuote = false;
    for (let i = 0; i < head.length; i++) {
      const ch = head[i];
      if (ch === '"') inQuote = !inQuote;
      else if (!inQuote && ch === d) n++;
    }
    if (n > bestN) {
      bestN = n;
      best = d;
    }
  }
  return best;
}

function parseCsv(text, delim) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  for (; i < n; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"' && cell === '') {
      quoted = true;
    } else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function colName(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function compare(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function visibleRows() {
  const start = S.header ? 1 : 0;
  let list = [];
  for (let r = start; r < S.rows.length; r++) list.push(r);
  const q = S.filter.trim().toLowerCase();
  if (q) {
    list = list.filter((r) => S.rows[r].some((cell) => cell.toLowerCase().indexOf(q) !== -1));
  }
  if (S.sortCol >= 0) {
    const c = S.sortCol;
    list.sort((a, b) => {
      const d = compare(S.rows[a][c] || '', S.rows[b][c] || '') * S.sortDir;
      return d || a - b;
    });
  }
  return list;
}

function headHtml() {
  let html = '<tr><th class="csv-rn">#</th>';
  for (let c = 0; c < S.cols; c++) {
    const label = S.header && S.rows.length ? (S.rows[0][c] || colName(c)) : colName(c);
    const arrow = S.sortCol === c ? (S.sortDir > 0 ? ' \u25B2' : ' \u25BC') : '';
    html += '<th class="csv-th" data-c="' + c + '" title="Click to sort">' + esc(label) + arrow + '</th>';
  }
  return html + '</tr>';
}

function bodyHtml(list) {
  const shown = list.length > MAX_RENDER ? list.slice(0, MAX_RENDER) : list;
  let html = '';
  for (const r of shown) {
    const row = S.rows[r];
    html += '<tr><td class="csv-rn">' + (r + 1) + '</td>';
    for (let c = 0; c < S.cols; c++) {
      const v = row[c] === undefined ? '' : row[c];
      const num = /^-?\d+(?:\.\d+)?$/.test(v) ? ' class="csv-num"' : '';
      const tip = v.length > 40 ? ' title="' + esc(v.slice(0, 600)) + '"' : '';
      html += '<td' + num + tip + '>' + esc(v) + '</td>';
    }
    html += '</tr>';
  }
  return html;
}

function infoText(count) {
  const total = Math.max(0, S.rows.length - (S.header ? 1 : 0));
  let text = total + (total === 1 ? ' row' : ' rows') + ' \u00d7 ' + S.cols + (S.cols === 1 ? ' column' : ' columns');
  if (S.filter.trim()) text += ' \u00b7 ' + count + ' match' + (count === 1 ? '' : 'es');
  if (count > MAX_RENDER) text += ' \u00b7 showing the first ' + MAX_RENDER;
  return text + ' \u00b7 ' + (DELIM_NAME[S.delim] || 'custom') + ' separated';
}

function currentWrap() {
  return document.querySelector('.ide-md-preview .csv-wrap');
}

function update() {
  const wrap = currentWrap();
  if (!wrap) return;
  const list = visibleRows();
  wrap.querySelector('thead').innerHTML = headHtml();
  wrap.querySelector('tbody').innerHTML = bodyHtml(list);
  wrap.querySelector('.csv-info').textContent = infoText(list.length);
}

function wire() {
  if (wired) return;
  wired = true;
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('csv-filter')) {
      S.filter = t.value;
      update();
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('csv-hdr')) {
      S.header = t.checked;
      S.sortCol = -1;
      update();
    }
  });
  document.addEventListener('click', (e) => {
    const th = e.target && e.target.closest ? e.target.closest('.csv-th') : null;
    if (!th || !th.closest('.csv-wrap')) return;
    const c = Number(th.dataset.c);
    if (S.sortCol === c) {
      if (S.sortDir > 0) {
        S.sortDir = -1;
      } else {
        S.sortCol = -1;
        S.sortDir = 1;
      }
    } else {
      S.sortCol = c;
      S.sortDir = 1;
    }
    update();
  });
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'f') return;
    const wrap = currentWrap();
    const input = wrap ? wrap.querySelector('.csv-filter') : null;
    if (!input || !input.offsetParent) return;
    e.preventDefault();
    e.stopPropagation();
    input.focus();
    input.select();
  }, true);
}

export function renderCsv(text, filePath) {
  ensureCss();
  wire();
  const source = String(text || '');
  S.delim = detectDelim(source, filePath);
  S.rows = parseCsv(source, S.delim);
  S.cols = S.rows.reduce((max, r) => Math.max(max, r.length), 0);
  S.header = true;
  S.sortCol = -1;
  S.sortDir = 1;
  S.filter = '';
  if (!S.rows.length) {
    return '<div class="csv-wrap"><div class="csv-empty">This file is empty.</div></div>';
  }
  const list = visibleRows();
  return '<div class="csv-wrap">' +
    '<div class="csv-bar">' +
      '<input type="text" class="csv-filter" placeholder="Filter rows (Ctrl+F)" spellcheck="false" autocomplete="off">' +
      '<label class="csv-hd"><input type="checkbox" class="csv-hdr" checked> First row is header</label>' +
      '<span class="csv-info">' + esc(infoText(list.length)) + '</span>' +
    '</div>' +
    '<div class="csv-scroll"><table class="csv-table">' +
      '<thead>' + headHtml() + '</thead>' +
      '<tbody>' + bodyHtml(list) + '</tbody>' +
    '</table></div>' +
  '</div>';
}