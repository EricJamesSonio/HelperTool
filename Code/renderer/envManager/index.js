import { state, setState } from './state.js';
import { getModalShell } from './template.js';
import { renderFileList, renderLeftActions } from './fileList.js';
import { renderEditor } from './editor.js';
import { closeCreateForm } from './createFlow.js';

let _container = null;

export function open(repoPath) {
  if (!repoPath) return;
  _container = document.getElementById('app') || document.body;
  setState({
    open: true,
    repoPath,
    files: [],
    activeFile: null,
    entries: [],
    dirty: false,
    creating: false,
    loading: false,
    error: null,
    searchQuery: '',
  });
  _render();
  wireOverlayEvents();
  loadFileList();
}

export function close() {
  if (state.dirty) {
    if (!confirm('You have unsaved changes. Discard them?')) return;
  }
  const overlay = document.getElementById('envOverlay');
  if (overlay) overlay.remove();
  setState({
    open: false,
    repoPath: null,
    files: [],
    activeFile: null,
    entries: [],
    dirty: false,
    creating: false,
    loading: false,
    error: null,
    searchQuery: '',
  });
  _container = null;
}

export function loadFile(fileName) {
  if (!fileName) return;
  setState({ activeFile: fileName, loading: true, error: null });

  window.envAPI.readFile(state.repoPath, fileName).then(r => {
    if (r.success) {
      const entries = r.entries.map(e => ({ ...e, revealed: false }));
      setState({ entries, loading: false, dirty: false, error: null });
    } else {
      setState({ entries: [], loading: false, dirty: false, error: r.error });
    }
    renderEditor();
    renderFileList();
  }).catch(err => {
    setState({ entries: [], loading: false, error: err.message });
    renderEditor();
    renderFileList();
  });
}

export async function loadFileList() {
  setState({ loading: true });
  try {
    const r = await window.envAPI.listFiles(state.repoPath);
    if (r.success) {
      const files = r.files;
      setState({ files, loading: false });
      renderFileList();
      renderLeftActions();
      if (files.length > 0 && !state.activeFile) {
        loadFile(files[0]);
      } else {
        renderEditor();
      }
    } else {
      setState({ loading: false, error: r.error });
    }
  } catch (err) {
    setState({ loading: false, error: err.message });
  }
}

function _render() {
  if (!_container) return;
  const existing = document.getElementById('envOverlay');
  if (existing) existing.remove();

  const shell = document.createElement('div');
  shell.innerHTML = getModalShell();
  _container.appendChild(shell.firstElementChild);

  const repoEl = document.getElementById('envHeaderRepo');
  if (repoEl) {
    const repoName = state.repoPath?.split(/[\\/]/).pop() || '';
    repoEl.textContent = repoName;
  }
}

function wireOverlayEvents() {
  const overlay = document.getElementById('envOverlay');
  if (!overlay) return;

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay && !state.dirty) {
      close();
    } else if (e.target === overlay && state.dirty) {
      if (confirm('You have unsaved changes. Discard them?')) close();
    }
  });

  document.getElementById('envCloseBtn')?.addEventListener('click', close);

  document.addEventListener('keydown', _onKeyDown);
}

function _onKeyDown(e) {
  if (e.key === 'Escape') {
    if (state.creating) {
      closeCreateForm();
      return;
    }
    close();
    document.removeEventListener('keydown', _onKeyDown);
  }
}
