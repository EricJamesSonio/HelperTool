let _overlayId = 0;

const STYLE_ID = 'cfDialogStyle';

const I_WARN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M10 2.5L1.8 16.5h16.4L10 2.5z"/><path d="M10 8v4"/><path d="M10 14.3v.1"/></svg>';
const I_INFO = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5"/><path d="M10 6.2v.1"/></svg>';

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@keyframes cfFadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes cfPop { from { opacity: 0; transform: translateY(8px) scale(0.97) } to { opacity: 1; transform: none } }
.cf-overlay {
  position: fixed;
  inset: 0;
  z-index: 100010;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(3px);
  animation: cfFadeIn 0.12s ease;
}
.cf-box {
  width: min(440px, 92vw);
  padding: 22px 22px 18px;
  background: var(--bg-surface, #0c1427);
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  animation: cfPop 0.14s ease;
}
.cf-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.cf-icon {
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.cf-icon.danger {
  background: var(--red-dim, rgba(248, 81, 73, 0.14));
  color: var(--red, #f87171);
}
.cf-icon.info {
  background: var(--accent-dim, rgba(34, 211, 238, 0.12));
  color: var(--accent, #22d3ee);
}
.cf-text {
  flex: 1;
  min-width: 0;
}
.cf-title {
  margin-bottom: 6px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary, #eef2ff);
}
.cf-msg {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary, #94a3c4);
  word-break: break-word;
}
.cf-msg strong,
.cf-msg b {
  color: var(--text-primary, #eef2ff);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 600;
}
.cf-input {
  width: 100%;
  margin-top: 12px;
  padding: 9px 12px;
  border: 1px solid var(--border-default, rgba(255, 255, 255, 0.12));
  border-radius: 7px;
  background: var(--bg-raised, #1a2540);
  color: var(--text-primary, #eef2ff);
  font-family: inherit;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}
.cf-input:focus {
  border-color: var(--accent, #22d3ee);
  box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.15);
}
.cf-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
.cf-btn {
  height: 34px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 7px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.cf-btn:focus-visible {
  outline: 2px solid var(--accent, #22d3ee);
  outline-offset: 2px;
}
.cf-btn-cancel {
  background: var(--bg-raised, #1a2540);
  border-color: var(--border-default, rgba(255, 255, 255, 0.12));
  color: var(--text-secondary, #94a3c4);
}
.cf-btn-cancel:hover {
  color: var(--text-primary, #eef2ff);
}
.cf-btn-danger {
  background: var(--red, #f87171);
  color: #ffffff;
}
.cf-btn-danger:hover {
  filter: brightness(1.1);
}
.cf-btn-primary {
  background: var(--accent, #22d3ee);
  color: #000000;
}
.cf-btn-primary:hover {
  filter: brightness(1.1);
}
`;
  document.head.appendChild(style);
}

function openDialog(opts) {
  injectStyle();
  const id = ++_overlayId;

  return new Promise((resolve) => {
    const tone = opts.danger ? 'danger' : 'info';
    const overlay = document.createElement('div');
    overlay.className = 'cf-overlay';
    overlay.id = 'cfOverlay-' + id;

    const cancelHtml = opts.showCancel
      ? '<button type="button" class="cf-btn cf-btn-cancel" data-cf="cancel">' + opts.cancelText + '</button>'
      : '';
    const inputHtml = opts.input
      ? '<input type="text" class="cf-input" value="' + escAttr(opts.value || '') + '" autocomplete="off" spellcheck="false">'
      : '';

    overlay.innerHTML =
      '<div class="cf-box" role="dialog" aria-modal="true">' +
        '<div class="cf-head">' +
          '<div class="cf-icon ' + tone + '">' + (opts.danger ? I_WARN : I_INFO) + '</div>' +
          '<div class="cf-text">' +
            '<div class="cf-title">' + opts.title + '</div>' +
            '<div class="cf-msg">' + opts.message + '</div>' +
            inputHtml +
          '</div>' +
        '</div>' +
        '<div class="cf-actions">' +
          cancelHtml +
          '<button type="button" class="cf-btn ' + (opts.danger ? 'cf-btn-danger' : 'cf-btn-primary') + '" data-cf="ok">' + opts.okText + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    const okBtn = overlay.querySelector('[data-cf="ok"]');
    const cancelBtn = overlay.querySelector('[data-cf="cancel"]');
    const input = overlay.querySelector('.cf-input');
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(result);
    }

    function accept() {
      finish(opts.input ? (input.value.trim() || null) : true);
    }

    function dismiss() {
      finish(opts.input ? null : false);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
        return;
      }
      if (e.key === 'Enter') {
        const active = document.activeElement;
        if (active && active.tagName === 'BUTTON' && overlay.contains(active)) {
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (opts.input || !opts.danger) accept();
      }
    }

    document.addEventListener('keydown', onKey, true);
    okBtn.addEventListener('click', accept);
    if (cancelBtn) cancelBtn.addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });

    setTimeout(() => {
      if (input) {
        input.focus();
        input.select();
      } else if (opts.danger && cancelBtn) {
        cancelBtn.focus();
      } else {
        okBtn.focus();
      }
    }, 30);
  });
}

export function alertDialog(message) {
  return openDialog({
    title: 'Notice',
    message,
    okText: 'OK',
    cancelText: '',
    showCancel: false,
    danger: false,
    input: false,
  }).then(() => undefined);
}

export function confirmDialog(message, options = {}) {
  return openDialog({
    title: options.title || 'Are you sure?',
    message,
    okText: options.confirmText || 'Confirm',
    cancelText: options.cancelText || 'Cancel',
    showCancel: true,
    danger: options.danger !== false,
    input: false,
  });
}

export function promptDialog(message, defaultValue = '', options = {}) {
  return openDialog({
    title: options.title || 'Input needed',
    message,
    okText: options.confirmText || 'Confirm',
    cancelText: options.cancelText || 'Cancel',
    showCancel: true,
    danger: false,
    input: true,
    value: defaultValue,
  });
}