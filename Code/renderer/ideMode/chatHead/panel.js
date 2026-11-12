import { listFunctions, saveFunction, removeFunction, newId, parseFolders } from './store.js';

const RUN_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function createPanel(opts) {
  const el = document.createElement('div');
  el.id = 'ideHdPanel';
  el.className = 'ide-hd-panel ide-root';
  el.hidden = true;
  let editing = null;
  let busyId = '';
  let msg = '';
  let msgWarn = false;

  function renderList() {
    editing = null;
    const fns = listFunctions();
    let rows = '';
    for (const fn of fns) {
      const sub = fn.folders && fn.folders.length ? fn.folders.join(', ') : 'whole repo';
      const kind = fn.files === false ? 'Folders' : 'Structure';
      rows += '<div class="ide-hd-row" data-id="' + esc(fn.id) + '">' +
        '<button type="button" class="ide-hd-run" data-act="run" title="Run and copy to clipboard">' + (busyId === fn.id ? '...' : RUN_ICON) + '</button>' +
        '<div class="ide-hd-info">' +
          '<div class="ide-hd-name">' + esc(fn.name) + '</div>' +
          '<div class="ide-hd-sub">' + kind + ': ' + esc(sub) + '</div>' +
        '</div>' +
        '<button type="button" class="ide-hd-mini" data-act="edit">Edit</button>' +
        '<button type="button" class="ide-hd-mini del" data-act="del">Del</button>' +
      '</div>';
    }
    el.innerHTML =
      '<div class="ide-hd-head">Functions</div>' +
      '<div class="ide-hd-list">' + (rows || '<div class="ide-hd-empty">No functions yet.</div>') + '</div>' +
      '<div class="ide-hd-msg' + (msgWarn ? ' warn' : '') + '">' + esc(msg) + '</div>' +
      '<div class="ide-hd-foot"><button type="button" class="ide-hd-add" data-act="new">+ New function</button></div>';
  }

  function renderEditor(fn, isNew) {
    editing = { fn, isNew };
    el.innerHTML =
      '<div class="ide-hd-head">' + (isNew ? 'New function' : 'Edit function') + '</div>' +
      '<div class="ide-hd-form">' +
        '<label class="ide-hd-lbl">Name</label>' +
        '<input class="ide-hd-in ide-hd-in-name" type="text" spellcheck="false" autocomplete="off" value="' + esc(fn.name) + '" />' +
        '<label class="ide-hd-lbl">Type</label>' +
        '<div class="ide-hd-type">Structure mode (box-drawing tree, copied to clipboard)</div>' +
        '<label class="ide-hd-lbl">Folders (one per line or comma separated, empty = whole repo)</label>' +
        '<textarea class="ide-hd-in ide-hd-in-folders" rows="3" spellcheck="false">' + esc((fn.folders || []).join('\n')) + '</textarea>' +
        '<label class="ide-hd-chk"><input type="checkbox" class="ide-hd-in-onlyfolders"' + (fn.files === false ? ' checked' : '') + ' /> Folders only (hide files)</label>' +
      '</div>' +
      '<div class="ide-hd-msg warn"></div>' +
      '<div class="ide-hd-foot">' +
        '<button type="button" class="ide-hd-mini" data-act="cancel">Cancel</button>' +
        '<button type="button" class="ide-hd-add" data-act="save">Save</button>' +
      '</div>';
    const nameIn = el.querySelector('.ide-hd-in-name');
    if (nameIn) nameIn.focus();
  }

  function saveEditor() {
    if (!editing) return;
    const name = el.querySelector('.ide-hd-in-name').value.trim();
    if (!name) {
      const m = el.querySelector('.ide-hd-msg');
      m.textContent = 'Name cannot be empty.';
      return;
    }
    const folders = parseFolders(el.querySelector('.ide-hd-in-folders').value);
    const onlyFolders = el.querySelector('.ide-hd-in-onlyfolders').checked;
    saveFunction({ id: editing.fn.id, name, type: 'structure', folders, files: !onlyFolders });
    msg = '';
    msgWarn = false;
    renderList();
  }

  async function runRow(id) {
    const fn = listFunctions().find((x) => x.id === id);
    if (!fn || busyId) return;
    busyId = id;
    msg = 'Running...';
    msgWarn = false;
    renderList();
    let res;
    try {
      res = await opts.onRun(fn);
    } catch (err) {
      res = { ok: false, msg: err && err.message ? err.message : 'Run failed' };
    }
    busyId = '';
    msg = res.msg || '';
    msgWarn = !res.ok || !!res.warn;
    if (!editing) renderList();
    if (opts.onResult) opts.onResult(res);
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const row = b.closest('.ide-hd-row');
    const id = row ? row.dataset.id : '';
    if (act === 'run') {
      runRow(id);
      return;
    }
    if (act === 'new') {
      renderEditor({ id: newId(), name: 'get codebase', type: 'structure', folders: ['backend', 'frontend'], files: true }, true);
      return;
    }
    if (act === 'edit') {
      const fn = listFunctions().find((x) => x.id === id);
      if (fn) renderEditor(fn, false);
      return;
    }
    if (act === 'del') {
      const fn = listFunctions().find((x) => x.id === id);
      if (fn && window.confirm('Delete "' + fn.name + '"?')) {
        removeFunction(id);
        msg = '';
        renderList();
      }
      return;
    }
    if (act === 'cancel') {
      renderList();
      return;
    }
    if (act === 'save') saveEditor();
  });

  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      if (editing) renderList();
      else opts.onClose();
      return;
    }
    if (e.key === 'Enter' && editing && e.target.classList.contains('ide-hd-in-name')) {
      e.preventDefault();
      saveEditor();
    }
  });

  renderList();

  return {
    el,
    isOpen: () => !el.hidden,
    open: () => {
      el.hidden = false;
      if (!editing) renderList();
    },
    close: () => {
      el.hidden = true;
    },
  };
}