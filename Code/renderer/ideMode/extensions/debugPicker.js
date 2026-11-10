import { esc } from '../highlight.js';

const LS_PICK = 'helpertool-ide-dbg-pick:';

function attr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function normRoot(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function loadPicked(root) {
  try {
    const raw = localStorage.getItem(LS_PICK + normRoot(root));
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? new Set(list) : null;
  } catch (_) {
    return null;
  }
}

export function savePicked(root, picked) {
  try {
    localStorage.setItem(LS_PICK + normRoot(root), JSON.stringify(Array.from(picked)));
  } catch (_) {}
}

function cardHtml(e, on) {
  const langs = (e.langs || []).map((l) => '<span class="ide-dbg-plang">' + esc(l) + '</span>').join('');
  return '<button type="button" class="ide-dbg-pcard' + (on ? ' on' : '') + '" data-act="pick-toggle" data-id="' + attr(e.id) + '" role="checkbox" aria-checked="' + (on ? 'true' : 'false') + '">' +
    '<span class="ide-dbg-pbox">' + (on ? '\u2713' : '') + '</span>' +
    '<span class="ide-dbg-pbadge" style="color:var(' + e.color + ')">' + esc(e.badge) + '</span>' +
    '<span class="ide-dbg-pinfo">' +
      '<span class="ide-dbg-pname">' + esc(e.name) + '</span>' +
      '<span class="ide-dbg-plangs">' + langs + '</span>' +
    '</span>' +
  '</button>';
}

export function pickerHtml(exts, picked, canBack) {
  const n = exts.filter((e) => picked.has(e.id)).length;
  const head =
    '<div class="ide-dbg-phead">' +
      '<div>' +
        '<div class="ide-dbg-ptitle">Choose what to check</div>' +
        '<div class="ide-dbg-psub">Only the extensions you tick are run, and only on the file types they handle.</div>' +
      '</div>' +
      '<div class="ide-dbg-pbtns">' +
        '<button type="button" class="ide-dbg-btn" data-act="pick-all">Select all</button>' +
        '<button type="button" class="ide-dbg-btn" data-act="pick-none">Clear</button>' +
      '</div>' +
    '</div>';
  const body = exts.length
    ? '<div class="ide-dbg-pgrid">' + exts.map((e) => cardHtml(e, picked.has(e.id))).join('') + '</div>'
    : '<div class="ide-dbg-empty">No extension is enabled for this repo. Turn one on in Extensions first.</div>';
  const foot =
    '<div class="ide-dbg-pfoot">' +
      '<span class="ide-dbg-pcount">' + n + ' of ' + exts.length + ' selected</span>' +
      (canBack ? '<button type="button" class="ide-dbg-btn" data-act="pick-back">Back to results</button>' : '') +
      '<button type="button" class="ide-dbg-run" data-act="pick-run"' + (n ? '' : ' disabled') + '>Run debug</button>' +
    '</div>';
  return head + body + foot;
}