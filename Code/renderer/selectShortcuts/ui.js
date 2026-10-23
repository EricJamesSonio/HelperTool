// ===== File: Code\renderer\selectShortcuts\ui.js =====
// Config modal + chip row for the named "select shortcut" presets.

import {
  loadSelectShortcuts,
  addSelectShortcut,
  updateSelectShortcut,
  removeSelectShortcut,
  makeShortcutId,
} from './store.js';

let _modalEl = null;

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toast(message, type = 'success', duration = 3000) {
  const existing = document.querySelector('.ss-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `ss-toast ss-toast-${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 200);
  }, duration);
}

export function showSelectToast(message, type = 'success', duration = 3000) {
  toast(message, type, duration);
}

/**
 * Open the shortcut configuration modal.
 * @param {string|null} editingId  shortcut being edited (null = create new)
 * @param {Function}    onChange   called after every add/edit/delete
 */
export function openSelectShortcutConfig(editingId = null, onChange = null) {
  closeSelectShortcutConfig();

  const editing = editingId ? loadSelectShortcuts().find(s => s.id === editingId) : null;
  const others = loadSelectShortcuts().filter(s => s.id !== editingId);

  const overlay = document.createElement('div');
  overlay.className = 'ss-config-overlay';

  overlay.innerHTML = `
    <div class="ss-config-modal">
      <div class="ss-config-header">
        <h3>${editing ? 'Edit shortcut' : 'Add shortcut to select'}</h3>
        <button class="ss-config-close" title="Close">&times;</button>
      </div>
      <div class="ss-config-body">
        <div class="ss-config-field">
          <label>Name</label>
          <input type="text" class="ss-config-input ss-config-name" value="${esc(editing?.name || '')}" placeholder="e.g. fullstack" spellcheck="false"/>
        </div>
        <div class="ss-config-field">
          <label>Folders / files to select</label>
          <textarea class="ss-config-textarea ss-config-targets" rows="5" spellcheck="false" placeholder="backend&#10;frontend">${esc((editing?.targets || []).join('\n'))}</textarea>
          <p class="ss-config-hint">
            One per line (or comma separated). Folder names or repo-relative paths —
            e.g. <code>backend</code>, <code>client/src</code>, <code>server/app/Models/Resort.php</code>.
            In <b>Code</b> mode a folder selects every file inside it; in <b>Structure</b> mode it selects the folder itself.
          </p>
        </div>
        <div class="ss-config-error" style="display:none"></div>
        ${others.length ? `
        <div class="ss-config-field">
          <label>Saved shortcuts</label>
          <div class="ss-config-list">
            ${others.map(s => `
              <div class="ss-config-list-row" data-id="${esc(s.id)}">
                <span class="ss-config-list-name" title="${esc(s.targets.join(', '))}">${esc(s.name)}</span>
                <span class="ss-config-list-targets">${esc(s.targets.join(', '))}</span>
                <button class="ss-config-mini ss-config-edit" data-id="${esc(s.id)}" title="Edit">Edit</button>
                <button class="ss-config-mini ss-config-mini-danger ss-config-delete" data-id="${esc(s.id)}" title="Delete">Delete</button>
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>
      <div class="ss-config-footer">
        <button class="ss-config-btn ss-config-btn-cancel">Cancel</button>
        <button class="ss-config-btn ss-config-btn-save">${editing ? 'Save changes' : 'Add shortcut'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  _modalEl = overlay;

  const nameInput = overlay.querySelector('.ss-config-name');
  const targetsInput = overlay.querySelector('.ss-config-targets');
  const errorEl = overlay.querySelector('.ss-config-error');

  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  };
  const hideError = () => {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  };

  const close = () => closeSelectShortcutConfig();

  overlay.querySelector('.ss-config-close').addEventListener('click', close);
  overlay.querySelector('.ss-config-btn-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelectorAll('.ss-config-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      close();
      openSelectShortcutConfig(btn.dataset.id, onChange);
    });
  });
  overlay.querySelectorAll('.ss-config-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      removeSelectShortcut(btn.dataset.id);
      close();
      onChange?.();
      toast('Shortcut deleted');
    });
  });

  overlay.querySelector('.ss-config-btn-save').addEventListener('click', () => {
    hideError();
    const name = nameInput.value.trim();
    const targets = targetsInput.value
      .split(/[\n,;]+/)
      .map(t => t.trim())
      .filter(Boolean);

    if (!name) { showError('Please give the shortcut a name.'); return; }
    if (!targets.length) { showError('Please add at least one folder or file to select.'); return; }

    if (editing) {
      updateSelectShortcut(editing.id, { name, targets });
      toast(`Shortcut "${name}" updated`);
    } else {
      addSelectShortcut({ id: makeShortcutId(), name, targets });
      toast(`Shortcut "${name}" added`);
    }
    close();
    onChange?.();
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  setTimeout(() => nameInput.focus(), 80);
}

export function closeSelectShortcutConfig() {
  if (_modalEl) {
    _modalEl.remove();
    _modalEl = null;
  }
}

/**
 * Render the saved shortcuts as pills.
 * @param {HTMLElement} container
 * @param {(sc:Object)=>void} onApply   click
 * @param {(sc:Object)=>void} onEdit    right click
 */
export function renderSelectShortcutChips(container, onApply, onEdit) {
  if (!container) return;
  const items = loadSelectShortcuts();
  container.innerHTML = '';

  if (!items.length) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  const label = document.createElement('span');
  label.className = 'select-shortcut-label';
  label.textContent = 'Shortcuts:';
  container.appendChild(label);

  for (const sc of items) {
    const pill = document.createElement('button');
    pill.className = 'select-shortcut-pill';
    pill.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="vertical-align:middle;margin-right:4px"><path d="m11 3-8 8 4 1 1 4 8-8-4-1-1-4Z"/></svg>${esc(sc.name)}`;
    pill.title = `Select: ${sc.targets.join(', ')}\n(right-click to edit)`;
    pill.addEventListener('click', () => onApply?.(sc));
    pill.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      onEdit?.(sc);
    });
    container.appendChild(pill);
  }
}
