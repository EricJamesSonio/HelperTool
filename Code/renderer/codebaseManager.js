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

  function cleanup() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('click', onCaptureClick, true);
    document.removeEventListener('keydown', onKeyDown);
    if (activeTarget) activeTarget.classList.remove('cm-drop-target');
    ghost.remove();
    preview.remove();
    _moveState = null;
  }

  _moveState = { cleanup };

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
  } else {
    await alertDialog(res.error || 'Failed to move file');
  }
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
