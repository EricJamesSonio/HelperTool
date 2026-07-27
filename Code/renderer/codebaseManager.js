import { confirmDialog, alertDialog } from './utils/confirmDialog.js';

export function openRenameModal(filePath, fileName, onComplete, isFolder) {
  if (!filePath) return;

  const title = isFolder ? 'Manage Folder' : 'Manage File';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay cm-modal-overlay';

  overlay.innerHTML = `
    <div class="modal-content cm-modal">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close-btn cm-modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="cm-file-path">${_esc(filePath)}</div>
        <label class="cm-field-label">Rename to:</label>
        <input type="text" class="cm-rename-input" value="${_esc(fileName || '')}">
      </div>
      <div class="modal-actions cm-modal-actions">
        <button class="modal-btn cm-delete-btn">Delete</button>
        <button class="modal-btn modal-btn-primary cm-rename-btn">Rename</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const input = overlay.querySelector('.cm-rename-input');
  const renameBtn = overlay.querySelector('.cm-rename-btn');
  const deleteBtn = overlay.querySelector('.cm-delete-btn');
  const closeBtn = overlay.querySelector('.cm-modal-close');

  const keyHandler = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && document.activeElement === input) renameBtn.click();
  };
  document.addEventListener('keydown', keyHandler);

  function close() {
    document.removeEventListener('keydown', keyHandler);
    overlay.classList.remove('open');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    setTimeout(() => { if (overlay.isConnected) overlay.remove(); }, 250);
  }

  renameBtn.addEventListener('click', async () => {
    const newName = input.value.trim();
    if (!newName) return;
    renameBtn.disabled = true;
    renameBtn.textContent = '...';
    const res = await window.electronAPI.renameFile(filePath, newName);
    if (res.success) {
      close();
      onComplete?.();
      showToast('File renamed successfully');
    } else {
      await alertDialog(res.error || 'Failed to rename file');
      renameBtn.disabled = false;
      renameBtn.textContent = 'Rename';
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const ok = await confirmDialog('Delete <strong>' + _esc(filePath) + '</strong>? This cannot be undone.');
    if (!ok) return;
    deleteBtn.disabled = true;
    deleteBtn.textContent = '...';
    const res = await window.electronAPI.deleteFile(filePath);
    if (res.success) {
      close();
      onComplete?.();
      showToast('Deleted successfully');
    } else {
      await alertDialog(res.error || 'Failed to delete file');
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete';
    }
  });

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  setTimeout(() => { input.focus(); input.select(); }, 50);
}

let _moveState = null;

export function startMoveGhost(sourcePath, treeContainer, onComplete) {
  if (!sourcePath) return;
  if (_moveState) _cancelMove();

  const filename = sourcePath.split('/').pop() || sourcePath.split('\\').pop();

  const ghost = document.createElement('div');
  ghost.className = 'cm-ghost';
  ghost.textContent = filename;

  const preview = document.createElement('div');
  preview.className = 'cm-path-preview';

  document.body.appendChild(ghost);
  document.body.appendChild(preview);

  let activeTarget = null;
  let done = false;

  function onMouseMove(e) {
    ghost.style.left = (e.clientX + 14) + 'px';
    ghost.style.top = (e.clientY - 8) + 'px';

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const wrapper = el?.closest('.node-wrapper');
    const isFolder = wrapper?.querySelector('.tree-node.folder');

    if (activeTarget) {
      activeTarget.classList.remove('cm-drop-target');
      activeTarget = null;
    }
    preview.style.display = 'none';

    if (wrapper && isFolder) {
      const fp = wrapper.dataset.nodePath;
      if (fp && fp !== sourcePath && !sourcePath.startsWith(fp + '/') && !fp.startsWith(sourcePath + '/')) {
        activeTarget = wrapper;
        activeTarget.classList.add('cm-drop-target');
        preview.textContent = '→ ' + fp;
        preview.style.display = 'block';
        preview.style.left = (e.clientX + 14) + 'px';
        preview.style.top = (e.clientY + 22) + 'px';
      }
    }
  }

  function onCaptureClick(e) {
    if (done) return;

    const cancelBtn = document.getElementById('moveCancelBtn');
    if (cancelBtn && cancelBtn.contains(e.target)) {
      done = true;
      cleanup();
      return;
    }

    const inTree = treeContainer.contains(e.target);
    if (!inTree) {
      done = true;
      cleanup();
      return;
    }

    e.stopPropagation();

    const wrapper = e.target.closest('.node-wrapper');
    const isFolder = wrapper?.querySelector('.tree-node.folder');

    if (wrapper && isFolder) {
      const targetDir = wrapper.dataset.nodePath;
      if (targetDir && targetDir !== sourcePath && !sourcePath.startsWith(targetDir + '/') && !targetDir.startsWith(sourcePath + '/')) {
        done = true;
        cleanup();
        _executeMove(sourcePath, targetDir, onComplete);
        return;
      }
    }

    done = true;
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      done = true;
      cleanup();
    }
  }

  const cancelBtn = document.getElementById('moveCancelBtn');

  function cleanup() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('click', onCaptureClick, true);
    document.removeEventListener('keydown', onKeyDown);
    if (activeTarget) activeTarget.classList.remove('cm-drop-target');
    ghost.remove();
    preview.remove();
    if (cancelBtn) cancelBtn.style.display = 'none';
    _moveState = null;
  }

  _moveState = { cleanup };

  if (cancelBtn) cancelBtn.style.display = 'inline-flex';

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('click', onCaptureClick, true);
  document.addEventListener('keydown', onKeyDown);
}

function _cancelMove() {
  if (_moveState) {
    _moveState.cleanup();
    _moveState = null;
  }
}

async function _executeMove(sourcePath, targetDir, onComplete) {
  const res = await window.electronAPI.moveFile(sourcePath, targetDir);
  if (res.success) {
    onComplete?.();
    showToast('File moved successfully');
  } else {
    await alertDialog(res.error || 'Failed to move file');
  }
}

export function parseFileNames(input, logPrefix = '') {
  if (!input || !input.trim()) return [];
  const items = input.trim().split(/\s+/);
  const result = [];
  for (const raw of items) {
    const trimmed = raw.replace(/[.,;:!?)]+$/, '');
    if (!trimmed) continue;
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed.startsWith('--')) continue;
    if (!trimmed.includes('.') || trimmed.endsWith('.')) {
      console.warn(`${logPrefix}Skipping "${raw}" — no extension or invalid`);
      continue;
    }
    result.push(trimmed);
  }
  return result;
}

export function openCreateFilesModal(parentPath, onComplete) {
  if (!parentPath) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay cm-modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content cm-modal cm-create-modal">
      <div class="modal-header">
        <h3 class="modal-title">Create Files</h3>
        <button class="modal-close-btn cm-modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="cm-file-path">${_esc(parentPath)}</div>
        <label class="cm-field-label">File names (space-separated):</label>
        <textarea class="cm-create-input" placeholder="index.ts button.tsx utils/helpers.ts types.ts&#10;// comment line ignored&#10;# also ignored" rows="3"></textarea>
        <div class="cm-create-hint">Separate names with spaces. Names without extensions are skipped.</div>
        <div class="cm-create-error" style="display:none"></div>
      </div>
      <div class="modal-actions cm-modal-actions">
        <button class="modal-btn modal-btn-primary cm-create-btn">Create</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const textarea = overlay.querySelector('.cm-create-input');
  const createBtn = overlay.querySelector('.cm-create-btn');
  const closeBtn = overlay.querySelector('.cm-modal-close');
  const errorEl = overlay.querySelector('.cm-create-error');

  const keyHandler = (e) => {
    if (e.key === 'Escape') close();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') createBtn.click();
  };
  document.addEventListener('keydown', keyHandler);

  function close() {
    document.removeEventListener('keydown', keyHandler);
    overlay.classList.remove('open');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    setTimeout(() => { if (overlay.isConnected) overlay.remove(); }, 250);
  }

  createBtn.addEventListener('click', async () => {
    const raw = textarea.value;
    const names = parseFileNames(raw, '[CreateFiles] ');
    if (!names.length) {
      errorEl.textContent = 'No valid file names found. Add names with extensions (e.g. "index.ts").';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';
    createBtn.disabled = true;
    createBtn.textContent = '...';
    const res = await window.electronAPI.createFiles(parentPath, names);
    if (res.success) {
      const count = res.created?.length || names.length;
      close();
      onComplete?.();
      showToast(`Created ${count} file${count !== 1 ? 's' : ''}`);
    } else {
      let msg = res.error || 'Failed to create files';
      if (res.errors?.length) {
        msg += '\n' + res.errors.map(e => `  ${e.fileName}: ${e.error}`).join('\n');
      }
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
      createBtn.disabled = false;
      createBtn.textContent = 'Create';
    }
  });

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  setTimeout(() => { textarea.focus(); }, 50);
}

export function openCreateFolderModal(parentPath, onComplete) {
  if (!parentPath) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay cm-modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content cm-modal cm-create-modal" style="max-width:420px">
      <div class="modal-header">
        <h3 class="modal-title">Create Folder</h3>
        <button class="modal-close-btn cm-modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="cm-file-path">${_esc(parentPath)}</div>
        <label class="cm-field-label">Folder name:</label>
        <input type="text" class="cm-rename-input" placeholder="e.g. my-folder" autocomplete="off">
        <div class="cm-create-error" style="display:none"></div>
      </div>
      <div class="modal-actions cm-modal-actions">
        <button class="modal-btn modal-btn-primary cm-create-btn">Create Folder</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const input = overlay.querySelector('.cm-rename-input');
  const createBtn = overlay.querySelector('.cm-create-btn');
  const closeBtn = overlay.querySelector('.cm-modal-close');
  const errorEl = overlay.querySelector('.cm-create-error');

  const keyHandler = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && document.activeElement === input) createBtn.click();
  };
  document.addEventListener('keydown', keyHandler);

  function close() {
    document.removeEventListener('keydown', keyHandler);
    overlay.classList.remove('open');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    setTimeout(() => { if (overlay.isConnected) overlay.remove(); }, 250);
  }

  createBtn.addEventListener('click', async () => {
    const name = input.value.trim();
    if (!name) {
      errorEl.textContent = 'Folder name cannot be empty.';
      errorEl.style.display = 'block';
      return;
    }
    if (/[<>:"/\\|?*]/.test(name)) {
      errorEl.textContent = 'Invalid characters in folder name.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';
    createBtn.disabled = true;
    createBtn.textContent = '...';
    const res = await window.electronAPI.createFolder(parentPath, name);
    if (res.success) {
      close();
      onComplete?.();
      showToast('Folder created');
    } else {
      errorEl.textContent = res.error || 'Failed to create folder';
      errorEl.style.display = 'block';
      createBtn.disabled = false;
      createBtn.textContent = 'Create Folder';
    }
  });

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  setTimeout(() => { input.focus(); }, 50);
}

export function openInputContentModal(filePath, onComplete) {
  if (!filePath) return;

  const fileName = filePath.split(/[/\\]/).filter(Boolean).pop() || '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay cm-modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content cm-modal cm-content-modal">
      <div class="modal-header">
        <h3 class="modal-title">Input Content</h3>
        <button class="modal-close-btn cm-modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="cm-file-path">${_esc(filePath)}</div>
        <textarea class="cm-content-textarea" placeholder="Type or paste file content here..." spellcheck="false"></textarea>
        <div class="cm-content-error" style="display:none"></div>
      </div>
      <div class="modal-actions cm-modal-actions">
        <button class="modal-btn modal-btn-primary cm-content-save-btn">Save</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const textarea = overlay.querySelector('.cm-content-textarea');
  const saveBtn = overlay.querySelector('.cm-content-save-btn');
  const closeBtn = overlay.querySelector('.cm-modal-close');
  const errorEl = overlay.querySelector('.cm-content-error');

  const keyHandler = (e) => {
    if (e.key === 'Escape') close();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveBtn.click();
  };
  document.addEventListener('keydown', keyHandler);

  function close() {
    document.removeEventListener('keydown', keyHandler);
    overlay.classList.remove('open');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    setTimeout(() => { if (overlay.isConnected) overlay.remove(); }, 250);
  }

  saveBtn.addEventListener('click', async () => {
    const content = textarea.value;
    if (!content) {
      errorEl.textContent = 'Content cannot be empty. Type or paste something.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    const res = await window.electronAPI.writeFile(filePath, content);
    if (res.success) {
      close();
      onComplete?.();
      showToast('Content saved to ' + fileName);
    } else {
      errorEl.textContent = res.error || 'Failed to save content';
      errorEl.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  setTimeout(() => { textarea.focus(); }, 50);
}

export function showToast(message, type = 'success', duration = 3000) {
  const existing = document.querySelector('.cm-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `cm-toast cm-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
