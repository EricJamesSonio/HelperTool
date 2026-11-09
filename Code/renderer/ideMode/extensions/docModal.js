import { esc } from '../highlight.js';

let overlay = null;
let current = null;
let copyTimer = 0;

function statusText(ctx) {
  if (ctx.override === 'on') return 'Turned on manually for this repo.';
  if (ctx.override === 'off') return 'Turned off manually for this repo.';
  if (ctx.detected) return 'Detected automatically: ' + ctx.detected + '.';
  return 'Not detected in this repo. Use the switch to turn it on anyway.';
}

function buildText(ext, ctx) {
  const lines = [];
  const checks = Array.isArray(ext.checks) ? ext.checks : [];
  lines.push('# ' + ext.name + ' extension');
  lines.push('');
  lines.push(ext.desc);
  lines.push('');
  if (checks.length) {
    lines.push('## What it checks');
    for (const c of checks) lines.push('- ' + c);
    lines.push('');
  }
  lines.push('## File types');
  lines.push(ext.langs.join(', '));
  lines.push('');
  lines.push('## Handled file extensions');
  lines.push(ext.fileExts.map((x) => '.' + x).join(', '));
  lines.push('');
  lines.push('## Where results appear');
  lines.push('Wavy underlines in the editor, hover tips, the Problems panel and the status bar counters.');
  lines.push('');
  lines.push('## Status in this repo');
  lines.push(statusText(ctx) + ' Currently ' + (ctx.on ? 'ON' : 'OFF') + '.');
  return lines.join('\n');
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (_) {
    ok = false;
  }
  ta.remove();
  return ok;
}

async function copy(btn) {
  if (!current) return;
  const text = buildText(current.ext, current.ctx);
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (_) {
    ok = fallbackCopy(text);
  }
  btn.textContent = ok ? 'Copied' : 'Copy failed';
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    btn.textContent = 'Copy as text';
  }, 1500);
}

function render() {
  if (!overlay || !current) return;
  const ext = current.ext;
  const ctx = current.ctx;
  const checks = Array.isArray(ext.checks) ? ext.checks : [];
  const badge = overlay.querySelector('.ide-doc-badge');
  badge.textContent = ext.badge;
  badge.style.color = 'var(' + ext.color + ')';
  overlay.querySelector('.ide-doc-title').textContent = ext.name;
  const tag = overlay.querySelector('.ide-doc-state');
  tag.textContent = ctx.on ? 'ON' : 'OFF';
  tag.className = 'ide-doc-state' + (ctx.on ? ' on' : '');
  const checksHtml = checks.length
    ? '<div class="ide-doc-sec">What it checks</div><ul class="ide-doc-list">' +
      checks.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>'
    : '';
  const types = ext.langs.map((l) => '<span class="ide-doc-pill">' + esc(l) + '</span>').join('');
  const handled = ext.fileExts.map((x) => '<span class="ide-doc-pill">' + esc('.' + x) + '</span>').join('');
  overlay.querySelector('.ide-doc-body').innerHTML =
    '<div class="ide-doc-lead">' + esc(ext.desc) + '</div>' +
    checksHtml +
    '<div class="ide-doc-sec">File types</div><div class="ide-doc-pills">' + types + '</div>' +
    '<div class="ide-doc-sec">Handled file extensions</div><div class="ide-doc-pills">' + handled + '</div>' +
    '<div class="ide-doc-sec">Where results appear</div>' +
    '<div class="ide-doc-text">Wavy underlines in the editor, hover tips, the Problems panel and the status bar counters.</div>' +
    '<div class="ide-doc-sec">Status in this repo</div>' +
    '<div class="ide-doc-text">' + esc(statusText(ctx)) + '</div>';
  overlay.querySelector('.ide-doc-body').scrollTop = 0;
  overlay.querySelector('[data-act="copy"]').textContent = 'Copy as text';
}

function onClick(e) {
  if (e.target === overlay) {
    close();
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'close') close();
  else if (act === 'copy') copy(b);
}

function onKey(e) {
  if (e.key !== 'Escape' || !overlay || overlay.hidden) return;
  e.preventDefault();
  e.stopPropagation();
  close();
}

function build() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'ide-doc-overlay ide-root';
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="ide-doc-modal">' +
      '<div class="ide-doc-head">' +
        '<span class="ide-doc-badge"></span>' +
        '<span class="ide-doc-title"></span>' +
        '<span class="ide-doc-state"></span>' +
        '<span class="ide-doc-sub">Extension documentation</span>' +
        '<button type="button" class="ide-doc-x" data-act="close" title="Close">&times;</button>' +
      '</div>' +
      '<div class="ide-doc-body"></div>' +
      '<div class="ide-doc-foot">' +
        '<span class="ide-doc-hint">The text above is selectable. Copy as text gives you the same content as markdown.</span>' +
        '<button type="button" class="ide-doc-btn" data-act="copy">Copy as text</button>' +
        '<button type="button" class="ide-doc-btn primary" data-act="close">Done</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener('click', onClick);
  document.addEventListener('ide:close-search', () => close());
}

export function isOpen() {
  return !!overlay && !overlay.hidden;
}

export function open(ext, ctx) {
  if (!ext) return;
  build();
  current = { ext, ctx: ctx || { detected: '', override: '', on: false } };
  overlay.hidden = false;
  document.addEventListener('keydown', onKey, true);
  render();
}

export function close() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.removeEventListener('keydown', onKey, true);
}