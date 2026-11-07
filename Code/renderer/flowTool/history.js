import { state as appState } from '../app_manager/appState.js';
import { diffLines, collapseDiff, diffStats } from './review.js';
import { confirmDialog } from '../utils/confirmDialog.js';

const KIND_LABEL = { new: 'new', modified: 'modified', deleted: 'deleted' };

function bridge() {
  return window.electronAPI && window.electronAPI.fileSeeder;
}

function makeEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtTime(ms) {
  try {
    return new Date(ms).toLocaleString();
  } catch (_) {
    return String(ms);
  }
}

function fileKind(f) {
  if (!f.beforeExisted) return 'new';
  if (!f.afterExisted) return 'deleted';
  return 'modified';
}

function getOps(f) {
  if (f.big) return [];
  if (!f._ops) {
    f._ops = diffLines(f.before == null ? '' : f.before, f.after == null ? '' : f.after);
    f._stats = diffStats(f._ops);
  }
  return f._ops;
}

function renderCode(rows) {
  const pre = makeEl('div', 'ft-code');
  for (const l of rows) {
    const line = makeEl('div', 'ft-code-line');
    line.dataset.t = l.t;
    line.appendChild(makeEl('span', 'ft-code-no', l.t === '...' ? '' : String(l.b || l.a || '')));
    line.appendChild(makeEl('span', 'ft-code-sign', l.t === ' ' || l.t === '...' ? '' : l.t));
    line.appendChild(makeEl('span', 'ft-code-text', l.text));
    pre.appendChild(line);
  }
  if (!rows.length) pre.appendChild(makeEl('div', 'ft-note', 'No changes.'));
  return pre;
}

export function mountHistory(root) {
  const right = root.querySelector('#ftRight');
  const btn = root.querySelector('#ftHistoryBtn');
  const listEl = root.querySelector('#ftHistoryList');
  const detailEl = root.querySelector('#ftHistoryDetail');
  const noteEl = root.querySelector('#ftHistoryNote');
  const backBtn = root.querySelector('#ftHistoryBack');
  const clearBtn = root.querySelector('#ftHistoryClear');
  if (!right || !btn || !listEl || !detailEl) return { refresh: async () => {} };

  const st = { items: [], id: null, path: null, record: null, busy: false };

  const base = () => appState.selectedRepoPath || null;
  const isShown = () => right.dataset.mode === 'history';

  function setNote(tone, text) {
    noteEl.dataset.tone = tone;
    noteEl.textContent = text || '';
  }

  function setBtn() {
    btn.textContent = st.items.length ? 'History (' + st.items.length + ')' : 'History';
  }

  async function loadItems() {
    const b = base();
    const api = bridge();
    if (!b || !api || !api.flowHistoryList) {
      st.items = [];
      setBtn();
      return;
    }
    try {
      const res = await api.flowHistoryList(b);
      st.items = (res && res.items) || [];
    } catch (_) {
      st.items = [];
    }
    setBtn();
  }

  function renderList() {
    listEl.textContent = '';
    if (!st.items.length) {
      listEl.appendChild(makeEl('div', 'ft-empty', 'Nothing applied yet. Files you apply from the review are listed here, so you can look at them or revert them.'));
      return;
    }
    for (const it of st.items) {
      const done = it.files.filter((f) => f.reverted).length;
      const row = makeEl('div', 'ft-hist-item');
      row.dataset.selected = String(it.id === st.id);
      row.dataset.reverted = String(done === it.files.length && it.files.length > 0);
      row.appendChild(makeEl('div', 'ft-hist-title', it.title || 'Applied'));
      const sub = makeEl('div', 'ft-hist-sub');
      sub.appendChild(makeEl('span', '', fmtTime(it.at)));
      sub.appendChild(makeEl('span', '', it.files.length + ' file(s)'));
      if (done) {
        const chip = makeEl('span', 'ft-chip', done === it.files.length ? 'reverted' : done + ' reverted');
        chip.dataset.kind = 'reverted';
        sub.appendChild(chip);
      }
      row.appendChild(sub);
      row.addEventListener('click', () => select(it.id));
      listEl.appendChild(row);
    }
  }

  function renderDetail() {
    detailEl.textContent = '';
    if (!st.id) {
      detailEl.appendChild(makeEl('div', 'ft-empty', 'Select an entry on the left to see the files it changed.'));
      return;
    }
    const rec = st.record;
    if (!rec) {
      detailEl.appendChild(makeEl('div', 'ft-note', 'Loading...'));
      return;
    }

    const head = makeEl('div', 'ft-detail-head');
    head.appendChild(makeEl('div', 'ft-detail-path', rec.title || 'Applied'));
    head.appendChild(makeEl('span', 'ft-note', fmtTime(rec.at)));
    head.appendChild(makeEl('div', 'ft-spacer'));
    const open = rec.files.filter((f) => !f.reverted && !f.big);
    const allBtn = makeEl('button', 'ft-btn ft-danger', open.length === rec.files.length ? 'Revert all' : 'Revert remaining');
    allBtn.disabled = st.busy || open.length === 0;
    allBtn.addEventListener('click', () => doRevert(null));
    head.appendChild(allBtn);
    detailEl.appendChild(head);

    const filesBox = makeEl('div', 'ft-hist-files');
    for (const f of rec.files) {
      const row = makeEl('div', 'ft-hist-file');
      row.dataset.selected = String(f.path === st.path);
      row.dataset.reverted = String(!!f.reverted);
      row.appendChild(makeEl('div', 'ft-hist-file-name', f.path));
      getOps(f);
      if (f._stats) row.appendChild(makeEl('span', 'ft-note', '+' + f._stats.add + ' / -' + f._stats.del));
      const kind = fileKind(f);
      const chip = makeEl('span', 'ft-chip', KIND_LABEL[kind] || kind);
      chip.dataset.kind = kind;
      row.appendChild(chip);
      if (f.reverted) {
        const rc = makeEl('span', 'ft-chip', 'reverted');
        rc.dataset.kind = 'reverted';
        row.appendChild(rc);
      }
      row.addEventListener('click', () => {
        st.path = f.path;
        renderDetail();
      });
      filesBox.appendChild(row);
    }
    detailEl.appendChild(filesBox);

    const f = rec.files.find((x) => x.path === st.path) || rec.files[0];
    if (!f) return;
    const fhead = makeEl('div', 'ft-detail-head');
    fhead.appendChild(makeEl('div', 'ft-detail-path', f.path));
    fhead.appendChild(makeEl('span', 'ft-note', 'What this apply changed'));
    fhead.appendChild(makeEl('div', 'ft-spacer'));
    const oneBtn = makeEl('button', 'ft-btn ft-danger', 'Revert this file');
    oneBtn.disabled = st.busy || f.reverted || f.big;
    oneBtn.addEventListener('click', () => doRevert([f.path]));
    fhead.appendChild(oneBtn);
    detailEl.appendChild(fhead);

    if (f.big) {
      detailEl.appendChild(makeEl('div', 'ft-note', 'This file is too large to keep a copy of, so it cannot be shown or reverted.'));
      return;
    }
    detailEl.appendChild(renderCode(collapseDiff(getOps(f))));
  }

  async function select(id) {
    const b = base();
    const api = bridge();
    st.id = id;
    st.record = null;
    st.path = null;
    renderList();
    renderDetail();
    if (!b || !api || !api.flowHistoryGet) return;
    try {
      const res = await api.flowHistoryGet(b, id);
      if (st.id !== id) return;
      if (res && res.record) {
        st.record = res.record;
        st.path = res.record.files.length ? res.record.files[0].path : null;
      } else {
        setNote('error', (res && res.error) || 'Could not load this entry.');
      }
    } catch (err) {
      setNote('error', (err && err.message) || String(err));
    }
    renderDetail();
  }

  async function showHistory() {
    await loadItems();
    if (!st.items.find((i) => i.id === st.id)) st.id = st.items.length ? st.items[0].id : null;
    renderList();
    if (st.id) {
      await select(st.id);
    } else {
      st.record = null;
      renderDetail();
    }
  }

  async function doRevert(paths) {
    const b = base();
    const api = bridge();
    const rec = st.record;
    if (!b || !api || !api.flowHistoryRevert || !rec || st.busy) return;
    const what = paths && paths.length === 1 ? paths[0] : (paths ? paths.length + ' files' : 'all remaining files');
    const ok = await confirmDialog(
      'Revert <strong>' + esc(what) + '</strong>?<br><br>Each file goes back to the version it had before this apply. Files this apply created are deleted.'
    );
    if (!ok) return;
    st.busy = true;
    renderDetail();
    try {
      let res = await api.flowHistoryRevert(b, rec.id, { paths: paths || null });
      if (res && res.needsForce) {
        const list = res.conflicts.map((p) => esc(p)).join('<br>');
        const ok2 = await confirmDialog(
          'These files were changed after this apply:<br><br>' + list + '<br><br>Reverting overwrites those later edits. Continue?'
        );
        if (!ok2) {
          st.busy = false;
          renderDetail();
          return;
        }
        res = await api.flowHistoryRevert(b, rec.id, { paths: paths || null, force: true });
      }
      if (!res || res.error) {
        setNote('error', (res && res.error) || 'Revert failed.');
      } else {
        const bad = (res.errors || []).length + (res.skipped || []).length;
        setNote(bad ? 'error' : 'ok', 'Reverted ' + res.reverted.length + ' file(s)' + (bad ? ', ' + bad + ' could not be reverted.' : '.'));
        const refresh = document.getElementById('refreshBtn');
        if (refresh) refresh.click();
      }
    } catch (err) {
      setNote('error', (err && err.message) || String(err));
    }
    st.busy = false;
    await loadItems();
    renderList();
    await select(rec.id);
  }

  btn.addEventListener('click', async () => {
    if (isShown()) {
      right.dataset.mode = 'review';
      return;
    }
    setNote('info', '');
    right.dataset.mode = 'history';
    await showHistory();
  });

  backBtn.addEventListener('click', () => {
    right.dataset.mode = 'review';
  });

  clearBtn.addEventListener('click', async () => {
    const b = base();
    const api = bridge();
    if (!b || !api || !api.flowHistoryClear || !st.items.length) return;
    const ok = await confirmDialog('Clear the applied history for this repo? The files on disk are not touched, but you can no longer revert them.');
    if (!ok) return;
    await api.flowHistoryClear(b);
    st.id = null;
    st.record = null;
    setNote('info', 'History cleared.');
    await showHistory();
  });

  document.addEventListener('ft:history-changed', async () => {
    await loadItems();
    if (isShown()) await showHistory();
  });

  loadItems();
  return { refresh: loadItems };
}