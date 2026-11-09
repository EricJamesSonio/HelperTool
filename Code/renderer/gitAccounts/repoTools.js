import { openModal } from '../utils/uiModal.js';
import { alertDialog } from '../utils/confirmDialog.js';

const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
const FOLDER_RE = /^[^\\/:*?"<>|]+$/;

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

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function api() {
  return window.gitReposAPI || null;
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

export function openCloneModal() {
  const a = api();
  if (!a) {
    alertDialog('Fully restart the app to enable cloning.');
    return;
  }
  let repos = [];
  let selected = null;
  let parentDir = '';

  const bodyHtml =
    '<div class="grt">' +
      '<input id="grtSearch" class="grt-in" type="text" autocomplete="off" spellcheck="false" placeholder="Search your repositories...">' +
      '<div id="grtList" class="grt-list"><div class="grt-empty">Loading repositories...</div></div>' +
      '<div class="grt-lbl">Clone into</div>' +
      '<div class="grt-path">' +
        '<input id="grtPath" class="grt-in" type="text" readonly placeholder="Choose a folder...">' +
        '<button type="button" id="grtBrowse" class="grt-btn">Browse</button>' +
      '</div>' +
      '<div class="grt-lbl">Folder name</div>' +
      '<input id="grtName" class="grt-in" type="text" autocomplete="off" spellcheck="false" placeholder="Select a repository first">' +
      '<div id="grtHint" class="grt-hint"></div>' +
      '<label class="grt-check"><input type="checkbox" id="grtOpen" checked><span>Open in Helper Tool after cloning</span></label>' +
    '</div>';

  openModal({
    title: 'Clone repository',
    submitText: 'Clone',
    bodyHtml,
    onMount: (modal) => {
      const el = modal.el;
      const listEl = el.querySelector('#grtList');
      const searchEl = el.querySelector('#grtSearch');
      const pathEl = el.querySelector('#grtPath');
      const nameEl = el.querySelector('#grtName');
      const hintEl = el.querySelector('#grtHint');

      function updateHint() {
        const name = nameEl.value.trim();
        hintEl.textContent = parentDir && name ? 'Will clone to: ' + joinPath(parentDir, name) : '';
      }

      function paintList() {
        const q = searchEl.value.trim().toLowerCase();
        const rows = repos.filter((r) => {
          if (!q) return true;
          return r.fullName.toLowerCase().indexOf(q) !== -1 || r.description.toLowerCase().indexOf(q) !== -1;
        });
        if (!rows.length) {
          listEl.innerHTML = '<div class="grt-empty">' + (repos.length ? 'No matches.' : 'No repositories found.') + '</div>';
          return;
        }
        listEl.innerHTML = rows.map((r) => {
          const on = selected && selected.fullName === r.fullName;
          return '<div class="grt-row' + (on ? ' active' : '') + '" data-full="' + esc(r.fullName) + '">' +
            '<div class="grt-row-top">' +
              '<span class="grt-row-name">' + esc(r.fullName) + '</span>' +
              (r.private ? '<span class="grt-badge">Private</span>' : '') +
              (r.fork ? '<span class="grt-badge">Fork</span>' : '') +
            '</div>' +
            '<div class="grt-row-sub">' + esc(r.description || 'No description') + (r.language ? ' - ' + esc(r.language) : '') + '</div>' +
          '</div>';
        }).join('');
      }

      listEl.addEventListener('click', (e) => {
        const row = e.target.closest('.grt-row');
        if (!row) return;
        const hit = repos.find((r) => r.fullName === row.dataset.full);
        if (!hit) return;
        selected = hit;
        nameEl.value = hit.name;
        paintList();
        updateHint();
      });
      searchEl.addEventListener('input', paintList);
      nameEl.addEventListener('input', updateHint);
      el.querySelector('#grtBrowse').addEventListener('click', async () => {
        const p = await pickFolder();
        if (!p) return;
        parentDir = p;
        pathEl.value = p;
        updateHint();
      });

      a.listRepos().then((res) => {
        if (!res || !res.success) {
          listEl.innerHTML = '<div class="grt-empty grt-err">' + esc((res && res.error) || 'Could not load repositories.') + '</div>';
          return;
        }
        repos = res.repos || [];
        paintList();
      }).catch((err) => {
        listEl.innerHTML = '<div class="grt-empty grt-err">' + esc(err && err.message ? err.message : 'Could not load repositories.') + '</div>';
      });
    },
    onSubmit: async ({ el }) => {
      if (!selected) throw new Error('Select a repository to clone.');
      if (!parentDir) throw new Error('Choose the folder to clone into.');
      const folderName = el.querySelector('#grtName').value.trim();
      if (!FOLDER_RE.test(folderName) || folderName === '.' || folderName === '..') {
        throw new Error('Enter a valid folder name.');
      }
      const open = el.querySelector('#grtOpen').checked;
      setBusy(el, true, 'Cloning...');
      try {
        const res = await a.clone({ fullName: selected.fullName, parentDir, folderName, open });
        if (!res || !res.success) throw new Error((res && res.error) || 'Clone failed.');
        if (open) setTimeout(() => openInHelper(res.path), 0);
      } finally {
        setBusy(el, false);
      }
    },
  });
}

export function openCreateModal() {
  const a = api();
  if (!a) {
    alertDialog('Fully restart the app to enable repository creation.');
    return;
  }
  let parentDir = '';

  const bodyHtml =
    '<div class="grt">' +
      '<div class="grt-lbl">Repository name</div>' +
      '<input id="grtNewName" class="grt-in" type="text" autocomplete="off" spellcheck="false" placeholder="my-new-repo">' +
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
    '</div>';

  openModal({
    title: 'Create repository',
    submitText: 'Create',
    bodyHtml,
    onMount: (modal) => {
      const el = modal.el;
      const cloneEl = el.querySelector('#grtClone');
      const boxEl = el.querySelector('#grtCloneBox');
      const pathEl = el.querySelector('#grtPath');
      const nameEl = el.querySelector('#grtNewName');
      const hintEl = el.querySelector('#grtHint');

      function updateHint() {
        const name = nameEl.value.trim();
        hintEl.textContent = parentDir && name ? 'Will clone to: ' + joinPath(parentDir, name) : '';
      }

      cloneEl.addEventListener('change', () => {
        boxEl.style.display = cloneEl.checked ? '' : 'none';
      });
      nameEl.addEventListener('input', updateHint);
      el.querySelector('#grtBrowse').addEventListener('click', async () => {
        const p = await pickFolder();
        if (!p) return;
        parentDir = p;
        pathEl.value = p;
        updateHint();
      });
    },
    onSubmit: async ({ el }) => {
      const name = el.querySelector('#grtNewName').value.trim();
      if (!NAME_RE.test(name) || name === '.' || name === '..') {
        throw new Error('Use a name of letters, numbers, dots, dashes or underscores.');
      }
      const wantClone = el.querySelector('#grtClone').checked;
      if (wantClone && !parentDir) throw new Error('Choose the folder to clone into, or untick "Clone after creating".');
      const openAfter = el.querySelector('#grtOpen').checked;

      setBusy(el, true, 'Creating...');
      try {
        const res = await a.createRepo({
          name,
          description: el.querySelector('#grtDesc').value.trim(),
          isPrivate: el.querySelector('#grtVis').value !== 'public',
          readme: el.querySelector('#grtReadme').checked,
          gitignore: el.querySelector('#grtIgnore').value,
          license: el.querySelector('#grtLicense').value,
        });
        if (!res || !res.success) throw new Error((res && res.error) || 'Could not create the repository.');
        if (!wantClone) return;

        setBusy(el, true, 'Cloning...');
        const cl = await a.clone({
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
      }
    },
  });
}