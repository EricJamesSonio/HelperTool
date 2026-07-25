let _modalEl = null;
let _onSave = null;

export function openShortcutSetup(type, repoPath, currentConfig) {
  closeShortcutSetup();

  const overlay = document.createElement('div');
  overlay.className = 'shortcut-setup-overlay';

  const label = type === 'server' ? 'Server' : 'Client';
  const cfg = currentConfig || {};

  overlay.innerHTML = `
    <div class="shortcut-setup-modal">
      <div class="shortcut-setup-header">
        <h3>Set up ${label} Shortcut</h3>
        <button class="shortcut-setup-close">&times;</button>
      </div>
      <div class="shortcut-setup-body">
        <div class="shortcut-setup-field">
          <label>Working directory</label>
          <input type="text" class="shortcut-setup-input shortcut-setup-cwd" value="${escapeHtml(cfg.cwd || repoPath || '')}" placeholder="e.g. C:/project/code" spellcheck="false"/>
        </div>
        <div class="shortcut-setup-field">
          <label>Command to run</label>
          <input type="text" class="shortcut-setup-input shortcut-setup-cmd" value="${escapeHtml(cfg.command || '')}" placeholder="e.g. npm run dev" spellcheck="false"/>
        </div>
        <p class="shortcut-setup-hint">Left-click the ${label.toLowerCase()} button to run this command in the Terminal panel.</p>
      </div>
      <div class="shortcut-setup-footer">
        <button class="shortcut-setup-btn shortcut-setup-btn-cancel">Cancel</button>
        <button class="shortcut-setup-btn shortcut-setup-btn-save">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  _modalEl = overlay;

  const cwdInput = overlay.querySelector('.shortcut-setup-cwd');
  const cmdInput = overlay.querySelector('.shortcut-setup-cmd');

  const close = () => closeShortcutSetup();
  overlay.querySelector('.shortcut-setup-close').addEventListener('click', close);
  overlay.querySelector('.shortcut-setup-btn-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('.shortcut-setup-btn-save').addEventListener('click', async () => {
    const cwd = cwdInput.value.trim();
    const command = cmdInput.value.trim();
    if (!cwd || !command) return;
    try {
      await window.electronAPI.shortcutSetConfig({ repoPath, type, cwd, command });
      close();
      if (_onSave) _onSave();
    } catch (err) {
      console.error('[ShortcutSetup] Save failed:', err);
    }
  });

  setTimeout(() => cwdInput.focus(), 100);
}

export function closeShortcutSetup() {
  if (_modalEl) {
    _modalEl.remove();
    _modalEl = null;
  }
}

export function onShortcutSave(fn) {
  _onSave = fn;
}

export function showConfirmDialog(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';

    overlay.innerHTML = `
      <div class="confirm-dialog-modal">
        <div class="confirm-dialog-body">
          <p class="confirm-dialog-message">${escapeHtml(message)}</p>
        </div>
        <div class="confirm-dialog-footer">
          <button class="confirm-dialog-btn confirm-dialog-btn-cancel">Cancel</button>
          <button class="confirm-dialog-btn confirm-dialog-btn-confirm">Yes</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector('.confirm-dialog-btn-cancel').addEventListener('click', () => close(false));
    overlay.querySelector('.confirm-dialog-btn-confirm').addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

    const confirmBtn = overlay.querySelector('.confirm-dialog-btn-confirm');
    setTimeout(() => confirmBtn.focus(), 100);

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    });
  });
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
