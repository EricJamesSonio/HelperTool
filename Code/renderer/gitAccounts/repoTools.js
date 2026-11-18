import { openModal } from '../utils/uiModal.js';
import { alertDialog } from '../utils/confirmDialog.js';

const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
const FOLDER_RE = /^[^\\/:*?\x22<>|]+$/;
const CACHE_TTL = 5 * 60 * 1000;

const I_CHEV = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 8l5 5 5-5"/></svg>';

const GITIGNORES = [
  ['', 'None'],
  ['Node', 'Node'],
  ['Python', 'Python'],
  ['Java', 'Java'],
  ['VisualStudio', 'Visual Studio'],
  ['Laravel', 'Laravel'],
  ['Go', 'Go'],
];

const LICENSES = [
  ['', 'None'],
  ['mit', 'MIT'],
  ['apache-2.0', 'Apache 2.0'],
  ['gpl-3.0', 'GNU GPL v3'],
];

const repoCache = new Map();
const jobs = new Map();

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\x22/g, '&quot;');
}

function api() {
  return window.gitReposAPI || null;
}

function pageApi() {
  return window.gitReposPageAPI || null;
}

function accountsApi() {
  return window.gitAccountsAPI || null;
}

function pickFolder() {
  const a = window.electronAPI;
  if (!a || !a.selectFolder) return Promise.resolve(null);
  return a.selectFolder();
}

function setBusy(el, on, label) {
  const b = el.querySelector('[data-ui="submit"]');
  if (!b) return;
  if (!b.dataset.label) b.dataset.label = b.textContent;
  b.disabled = on;
  b.textContent = on ? label : b.dataset.label;
}

function joinPath(dir, name) {
  const sep = dir.indexOf('\\') !== -1 ? '\\' : '/';
  return dir.replace(/[\\/]+$/, '') + sep + name;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

async function openInHelper(repoPath) {
  try {
    const mod = await import('../app_manager/repoManager.js');
    await mod.loadRepo(repoPath);
  } catch (err) {
    console.error('[GitRepoTools] Could not open the cloned repo:', err);
  }
}

function optionsHtml(list) {
  return list.map((o) => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('');
}

function avatarHtml(acc) {
  const letter = (acc.username || acc.name || '?').charAt(0);
  let img = '';
  if (acc.avatarUrl) {
    const sep = acc.avatarUrl.indexOf('?') === -1 ? '?' : '&';
    img = '<img src="' + esc(acc.avatarUrl + sep + 's=64') + '" alt="" referrerpolicy="no-referrer">';
  }
  return '<span class="ga-av sm"><span class="ga-av-l">' + esc(letter) + '</span>' + img + '</span>';
}

async function loadAccounts() {
  const a = accountsApi();
  if (!a) return { error: 'Fully restart the app to enable account switching.' };
  try {
    const res = await a.list(null);
    if (!res || !res.success) return { error: (res && res.error) || 'Could not load accounts.' };
    return { accounts: res.accounts || [], activeId: res.activeId || null };
  } catch (err) {
    return { error: err && err.message ? err.message : 'Could not load accounts.' };
  }
}

function streamRepos(accountId, handlers) {
  const pages = pageApi();
  let stopped = false;
  (async () => {
    let page = 1;
    while (!stopped) {
      let res = null;
      try {
        res = await pages.page({ accountId, page });
      } catch (err) {
        if (!stopped) handlers.onError(err && err.message ? err.message : 'Could not load repositories.');
        return;
      }
      if (stopped) return;
      if (!res || !res.success) {
        handlers.onError((res && res.error) || 'Could not load repositories.');
        return;
      }
      handlers.onBatch(res.repos || []);
      if (!res.hasMore) break;
      page = res.nextPage || page + 1;
    }
    if (!stopped) handlers.onDone();
  })();
  return () => {
    stopped = true;
  };
}

function getJob(accountId) {
  let job = jobs.get(accountId);
  if (job) return job;
  job = { acc: [], subs: new Set() };
  jobs.set(accountId, job);
  streamRepos(accountId, {
    onBatch: (batch) => {
      job.acc = job.acc.concat(batch);
      job.subs.forEach((s) => s.onBatch(batch));
    },
    onDone: () => {
      jobs.delete(accountId);
      repoCache.set(accountId, { repos: job.acc, at: Date.now() });
      job.subs.forEach((s) => s.onDone(job.acc));
    },
    onError: (msg) => {
      jobs.delete(accountId);
      job.subs.forEach((s) => s.onError(msg));
    },
  });
  return job;
}

function subscribeRepos(accountId, handlers) {
  const job = getJob(accountId);
  if (job.acc.length) handlers.onBatch(job.acc.slice());
  job.subs.add(handlers);
  return () => {
    job.subs.delete(handlers);
  };
}

function isFresh(hit) {
  return !!hit && Date.now() - hit.at < CACHE_TTL;
}

export function warmRepos(accountId) {
  if (!accountId || !pageApi()) return;
  if (isFresh(repoCache.get(accountId))) return;
  getJob(accountId);
}

function mountPicker(host, accounts, initialId, note, onChange) {
  let selId = initialId;
  let open = false;
  let locked = false;

  function nameOf(a) {
    return a.label || a.name || a.username;
  }

  function textHtml(a) {
    return '<span class="grt-acc-text"><span class="grt-acc-name">' + esc(nameOf(a)) + '</span>' +
      '<span class="grt-acc-sub">@' + esc(a.username) + '</span></span>';
  }

  function paint() {
    const cur = accounts.find((a) => a.id === selId) || null;
    let h = '<div class="grt-lbl">GitHub account</div>' +
      '<div class="grt-acc-wrap">' +
        '<button type="button" class="grt-acc-btn' + (open ? ' open' : '') + '" data-pk="toggle"' + (locked ? ' disabled' : '') + '>' +
          (cur ? avatarHtml(cur) + textHtml(cur) : '<span class="grt-acc-text">No account</span>') +
          '<span class="grt-acc-chev">' + I_CHEV + '</span>' +
        '</button>';
    if (open) {
      h += '<div class="grt-acc-list">' + accounts.map((a) =>
        '<div class="grt-acc-opt' + (a.id === selId ? ' active' : '') + '" data-pk="pick" data-id="' + esc(a.id) + '">' +
          avatarHtml(a) + textHtml(a) +
        '</div>'
      ).join('') + '</div>';
    }
    h += '</div><div class="grt-acc-note">' + esc(note) + '</div>';
    host.innerHTML = h;
  }

  function onDocDown(e) {
    if (!host.isConnected) {
      document.removeEventListener('mousedown', onDocDown, true);
      return;
    }
    if (!open || host.contains(e.target)) return;
    open = false;
    paint();
  }

  document.addEventListener('mousedown', onDocDown, true);

  host.addEventListener('click', (e) => {
    const el = e.target.closest('[data-pk]');
    if (!el || locked) return;
    if (el.dataset.pk === 'toggle') {
      open = !open;
      paint();
      return;
    }
    open = false;
    const id = el.dataset.id;
    if (id !== selId) {
      selId = id;
      paint();
      onChange(id);
    } else {
      paint();
    }
  });

  paint();
  return {
    getId: () => selId,
    lock: (v) => {
      locked = !!v;
      if (locked) open = false;
      paint();
    },
  };
}

function createRepoList(el, o) {
  let repos = [];
  let names = new Set();
  let selected = null;
  let query = '';
  let loading = true;
  let error = '';

  function rebuildNames() {
    names = new Set(repos.map((r) => String(r.name || '').toLowerCase()));
  }

  function matches(r) {
    if (!query) return true;
    return r.fullName.toLowerCase().indexOf(query) !== -1 || String(r.description || '').toLowerCase().indexOf(query) !== -1;
  }

  function rowHtml(r) {
    const on = selected && selected.fullName === r.fullName;
    return '<div class="grt-row' + (on ? ' active' : '') + (o.selectable ? '' : ' static') + '" data-full="' + esc(r.fullName) + '">' +
      '<div class="grt-row-top">' +
        '<span class="grt-row-name">' + esc(r.fullName) + '</span>' +
        (r.private ? '<span class="grt-badge">Private</span>' : '') +
        (r.fork ? '<span class="grt-badge">Fork</span>' : '') +
      '</div>' +
      '<div class="grt-row-sub">' + esc(r.description || 'No description') + (r.language ? ' - ' + esc(r.language) : '') + '</div>' +
    '</div>';
  }

  function paintCount() {
    if (!o.countEl) return;
    o.countEl.innerHTML = (loading ? '<span class="ga-spin"></span>' : '') +
      '<span>' + repos.length + (loading ? '+' : '') + ' repositories</span>';
  }

  function paint() {
    const top = el.scrollTop;
    const rows = repos.filter(matches);
    let h = rows.map(rowHtml).join('');
    if (error) {
      h += '<div class="grt-empty grt-err">' + esc(error) + '</div>';
    } else if (loading) {
      if (rows.length) h += '<div class="grt-more"><span class="ga-spin"></span><span>Loading more...</span></div>';
      else h += '<div class="grt-empty">' + (repos.length ? 'No matches yet. Still loading...' : 'Loading repositories...') + '</div>';
    } else if (!rows.length) {
      h += '<div class="grt-empty">' + (repos.length ? 'No matches.' : 'No repositories found.') + '</div>';
    }
    el.innerHTML = h;
    el.scrollTop = top;
    paintCount();
    if (o.onUpdate) o.onUpdate();
  }

  el.addEventListener('click', (e) => {
    if (!o.selectable) return;
    const row = e.target.closest('.grt-row');
    if (!row) return;
    const hit = repos.find((r) => r.fullName === row.dataset.full);
    if (!hit) return;
    selected = hit;
    paint();
    if (o.onSelect) o.onSelect(hit);
  });

  return {
    reset() {
      repos = [];
      names = new Set();
      selected = null;
      loading = true;
      error = '';
      paint();
    },
    add(batch) {
      const seen = new Set(repos.map((r) => r.fullName));
      repos = repos.concat(batch.filter((r) => !seen.has(r.fullName)));
      rebuildNames();
      paint();
    },
    replace(next) {
      repos = next.slice();
      rebuildNames();
      if (selected) selected = repos.find((r) => r.fullName === selected.fullName) || null;
      paint();
    },
    done() {
      loading = false;
      paint();
    },
    fail(msg) {
      loading = false;
      error = msg;
      paint();
    },
    setQuery(q) {
      query = String(q || '').trim().toLowerCase();
      paint();
    },
    getSelected() {
      return selected;
    },
    hasName(name) {
      const n = String(name || '').toLowerCase();
      return !!n && names.has(n);
    },
  };
}

function infoHtml(r) {
  if (!r) return '<div class="grt-info-empty">Pick a repository from the list.</div>';
  const kv = [
    ['Visibility', r.private ? 'Private' : 'Public'],
    ['Language', r.language || 'Not set'],
    ['Default branch', r.defaultBranch || 'Unknown'],
    ['Last push', fmtDate(r.pushedAt) || 'Unknown'],
    ['Stars', String(r.stars || 0)],
  ];
  return '<div class="grt-info-name">' + esc(r.fullName) +
      (r.private ? '<span class="grt-badge">Private</span>' : '') +
      (r.fork ? '<span class="grt-badge">Fork</span>' : '') +
    '</div>' +
    '<div class="grt-info-desc">' + esc(r.description || 'No description') + '</div>' +
    '<div class="grt-kv">' + kv.map((p) => '<span>' + esc(p[0]) + '</span><b>' + esc(p[1]) + '</b>').join('') + '</div>' +
    (r.htmlUrl ? '<button type="button" class="grt-btn" data-gh="' + esc(r.htmlUrl) + '">Open on GitHub</button>' : '');
}

function loadList(list, accountId, state) {
  if (state.unsub) state.unsub();
  state.unsub = null;
  list.reset();
  const hit = repoCache.get(accountId);
  if (hit) list.replace(hit.repos);
  if (isFresh(hit)) {
    list.done();
    return;
  }
  state.unsub = subscribeRepos(accountId, {
    onBatch: (batch) => {
      if (!hit) list.add(batch);
    },
    onDone: (all) => {
      if (hit) list.replace(all);
      list.done();
    },
    onError: (msg) => {
      if (hit) list.done();
      else list.fail(msg);
    },
  });
}

export async function openCloneModal() {
  const a = api();
  if (!a || !pageApi()) {
    alertDialog('Fully restart the app to enable cloning.');
    return;
  }
  const ctx = await loadAccounts();
  if (ctx.error) {
    alertDialog(esc(ctx.error));
    return;
  }
  if (!ctx.accounts.length) {
    alertDialog('Add a GitHub account first.');
    return;
  }
  const startId = ctx.accounts.some((x) => x.id === ctx.activeId) ? ctx.activeId : ctx.accounts[0].id;

  let parentDir = '';
  let list = null;
  let picker = null;
  const stream = { unsub: null };

  const bodyHtml =
    '<div class="grt-split">' +
      '<div class="grt-left">' +
        '<div id="grtAcc" class="grt-acc"></div>' +
        '<div class="grt-lbl">Selected repository</div>' +
        '<div id="grtInfo" class="grt-info">' + infoHtml(null) + '</div>' +
        '<div class="grt-lbl">Clone into</div>' +
        '<div class="grt-path">' +
          '<input id="grtPath" class="grt-in" type="text" readonly placeholder="Choose a folder...">' +
          '<button type="button" id="grtBrowse" class="grt-btn">Browse</button>' +
        '</div>' +
        '<div class="grt-lbl">Folder name</div>' +
        '<input id="grtName" class="grt-in" type="text" autocomplete="off" spellcheck="false" placeholder="Select a repository first">' +
        '<div id="grtHint" class="grt-hint"></div>' +
        '<label class="grt-check"><input type="checkbox" id="grtOpen" checked><span>Open in Helper Tool after cloning</span></label>' +
      '</div>' +
      '<div class="grt-right">' +
        '<div class="grt-right-head">' +
          '<input id="grtSearch" class="grt-in" type="text" autocomplete="off" spellcheck="false" placeholder="Search your repositories...">' +
          '<span id="grtCount" class="grt-count"></span>' +
        '</div>' +
        '<div id="grtList" class="grt-list"></div>' +
      '</div>' +
    '</div>';

  openModal({
    title: 'Clone repository',
    submitText: 'Clone',
    bodyHtml,
    onClose: () => {
      if (stream.unsub) stream.unsub();
      stream.unsub = null;
    },
    onMount: (modal) => {
      const el = modal.el;
      el.querySelector('.ui-modal').classList.add('grt-modal');
      const infoEl = el.querySelector('#grtInfo');
      const pathEl = el.querySelector('#grtPath');
      const nameEl = el.querySelector('#grtName');
      const hintEl = el.querySelector('#grtHint');
      const searchEl = el.querySelector('#grtSearch');

      function updateHint() {
        const name = nameEl.value.trim();
        hintEl.textContent = parentDir && name ? 'Will clone to: ' + joinPath(parentDir, name) : '';
      }

      list = createRepoList(el.querySelector('#grtList'), {
        selectable: true,
        countEl: el.querySelector('#grtCount'),
        onSelect: (r) => {
          infoEl.innerHTML = infoHtml(r);
          nameEl.value = r.name;
          updateHint();
        },
      });

      picker = mountPicker(
        el.querySelector('#grtAcc'),
        ctx.accounts,
        startId,
        'Used only for this clone. Your active account does not change.',
        (id) => {
          infoEl.innerHTML = infoHtml(null);
          nameEl.value = '';
          updateHint();
          loadList(list, id, stream);
        }
      );

      infoEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-gh]');
        if (b && window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(b.dataset.gh);
      });
      searchEl.addEventListener('input', () => list.setQuery(searchEl.value));
      nameEl.addEventListener('input', updateHint);
      el.querySelector('#grtBrowse').addEventListener('click', async () => {
        const p = await pickFolder();
        if (!p) return;
        parentDir = p;
        pathEl.value = p;
        updateHint();
      });

      loadList(list, startId, stream);
    },
    onSubmit: async ({ el }) => {
      const selected = list ? list.getSelected() : null;
      if (!selected) throw new Error('Select a repository to clone.');
      if (!parentDir) throw new Error('Choose the folder to clone into.');
      const folderName = el.querySelector('#grtName').value.trim();
      if (!FOLDER_RE.test(folderName) || folderName === '.' || folderName === '..') {
        throw new Error('Enter a valid folder name.');
      }
      const open = el.querySelector('#grtOpen').checked;
      setBusy(el, true, 'Cloning...');
      picker.lock(true);
      try {
        const res = await a.clone({
          accountId: picker.getId(),
          fullName: selected.fullName,
          parentDir,
          folderName,
          open,
        });
        if (!res || !res.success) throw new Error((res && res.error) || 'Clone failed.');
        if (open) setTimeout(() => openInHelper(res.path), 0);
      } finally {
        setBusy(el, false);
        picker.lock(false);
      }
    },
  });
}

export async function openCreateModal() {
  const a = api();
  if (!a || !pageApi()) {
    alertDialog('Fully restart the app to enable repository creation.');
    return;
  }
  const ctx = await loadAccounts();
  if (ctx.error) {
    alertDialog(esc(ctx.error));
    return;
  }
  if (!ctx.accounts.length) {
    alertDialog('Add a GitHub account first.');
    return;
  }
  const startId = ctx.accounts.some((x) => x.id === ctx.activeId) ? ctx.activeId : ctx.accounts[0].id;

  let parentDir = '';
  let list = null;
  let picker = null;
  const stream = { unsub: null };

  const bodyHtml =
    '<div class="grt-split">' +
      '<div class="grt-left">' +
        '<div id="grtAcc" class="grt-acc"></div>' +
        '<div class="grt-lbl">Repository name</div>' +
        '<input id="grtNewName" class="grt-in" type="text" autocomplete="off" spellcheck="false" placeholder="my-new-repo">' +
        '<div id="grtNameWarn" class="grt-warn"></div>' +
        '<div class="grt-lbl">Description (optional)</div>' +
        '<input id="grtDesc" class="grt-in" type="text" autocomplete="off" placeholder="What is this repository for?">' +
        '<div class="grt-lbl">Visibility</div>' +
        '<select id="grtVis" class="grt-in"><option value="private">Private</option><option value="public">Public</option></select>' +
        '<label class="grt-check"><input type="checkbox" id="grtReadme" checked><span>Add a README file</span></label>' +
        '<div class="grt-two">' +
          '<div><div class="grt-lbl">.gitignore</div><select id="grtIgnore" class="grt-in">' + optionsHtml(GITIGNORES) + '</select></div>' +
          '<div><div class="grt-lbl">License</div><select id="grtLicense" class="grt-in">' + optionsHtml(LICENSES) + '</select></div>' +
        '</div>' +
        '<div class="grt-sep"></div>' +
        '<label class="grt-check"><input type="checkbox" id="grtClone" checked><span>Clone after creating</span></label>' +
        '<div id="grtCloneBox">' +
          '<div class="grt-lbl">Clone into</div>' +
          '<div class="grt-path">' +
            '<input id="grtPath" class="grt-in" type="text" readonly placeholder="Choose a folder...">' +
            '<button type="button" id="grtBrowse" class="grt-btn">Browse</button>' +
          '</div>' +
          '<div id="grtHint" class="grt-hint"></div>' +
          '<label class="grt-check"><input type="checkbox" id="grtOpen" checked><span>Open in Helper Tool after cloning</span></label>' +
        '</div>' +
      '</div>' +
      '<div class="grt-right">' +
        '<div class="grt-right-head">' +
          '<input id="grtSearch" class="grt-in" type="text" autocomplete="off" spellcheck="false" placeholder="Search existing repositories...">' +
          '<span id="grtCount" class="grt-count"></span>' +
        '</div>' +
        '<div id="grtList" class="grt-list"></div>' +
      '</div>' +
    '</div>';

  openModal({
    title: 'Create repository',
    submitText: 'Create',
    bodyHtml,
    onClose: () => {
      if (stream.unsub) stream.unsub();
      stream.unsub = null;
    },
    onMount: (modal) => {
      const el = modal.el;
      el.querySelector('.ui-modal').classList.add('grt-modal');
      const cloneEl = el.querySelector('#grtClone');
      const boxEl = el.querySelector('#grtCloneBox');
      const pathEl = el.querySelector('#grtPath');
      const nameEl = el.querySelector('#grtNewName');
      const hintEl = el.querySelector('#grtHint');
      const warnEl = el.querySelector('#grtNameWarn');
      const searchEl = el.querySelector('#grtSearch');

      function updateHint() {
        const name = nameEl.value.trim();
        hintEl.textContent = parentDir && name ? 'Will clone to: ' + joinPath(parentDir, name) : '';
      }

      function updateWarn() {
        if (!list || !picker) return;
        const name = nameEl.value.trim();
        if (!list.hasName(name)) {
          warnEl.textContent = '';
          return;
        }
        const acc = ctx.accounts.find((x) => x.id === picker.getId());
        warnEl.textContent = 'A repository named ' + name + ' already exists' + (acc ? ' on @' + acc.username : '') + '.';
      }

      list = createRepoList(el.querySelector('#grtList'), {
        selectable: false,
        countEl: el.querySelector('#grtCount'),
        onUpdate: updateWarn,
      });

      picker = mountPicker(
        el.querySelector('#grtAcc'),
        ctx.accounts,
        startId,
        'Used only for creating this repository. Your active account does not change.',
        (id) => loadList(list, id, stream)
      );

      searchEl.addEventListener('input', () => list.setQuery(searchEl.value));
      cloneEl.addEventListener('change', () => {
        boxEl.style.display = cloneEl.checked ? '' : 'none';
      });
      nameEl.addEventListener('input', () => {
        updateHint();
        updateWarn();
      });
      el.querySelector('#grtBrowse').addEventListener('click', async () => {
        const p = await pickFolder();
        if (!p) return;
        parentDir = p;
        pathEl.value = p;
        updateHint();
      });

      loadList(list, startId, stream);
    },
    onSubmit: async ({ el }) => {
      const name = el.querySelector('#grtNewName').value.trim();
      if (!NAME_RE.test(name) || name === '.' || name === '..') {
        throw new Error('Use a name of letters, numbers, dots, dashes or underscores.');
      }
      if (list && list.hasName(name)) {
        throw new Error('You already have a repository named ' + name + ' on this account.');
      }
      const wantClone = el.querySelector('#grtClone').checked;
      if (wantClone && !parentDir) throw new Error('Choose the folder to clone into, or untick Clone after creating.');
      const openAfter = el.querySelector('#grtOpen').checked;
      const accountId = picker.getId();

      setBusy(el, true, 'Creating...');
      picker.lock(true);
      try {
        const res = await a.createRepo({
          accountId,
          name,
          description: el.querySelector('#grtDesc').value.trim(),
          isPrivate: el.querySelector('#grtVis').value !== 'public',
          readme: el.querySelector('#grtReadme').checked,
          gitignore: el.querySelector('#grtIgnore').value,
          license: el.querySelector('#grtLicense').value,
        });
        if (!res || !res.success) throw new Error((res && res.error) || 'Could not create the repository.');
        repoCache.delete(accountId);
        if (!wantClone) return;

        setBusy(el, true, 'Cloning...');
        const cl = await a.clone({
          accountId,
          fullName: res.repo.fullName,
          parentDir,
          folderName: res.repo.name,
          open: openAfter,
        });
        if (!cl || !cl.success) {
          const why = (cl && cl.error) || 'unknown error';
          setTimeout(() => {
            alertDialog('Repository ' + esc(res.repo.fullName) + ' was created, but cloning failed: ' + esc(why) + '. Use Clone to try again.');
          }, 0);
          return;
        }
        if (openAfter) setTimeout(() => openInHelper(cl.path), 0);
      } finally {
        setBusy(el, false);
        picker.lock(false);
      }
    },
  });
}