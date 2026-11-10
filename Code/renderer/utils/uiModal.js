const I_CLOSE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg>';

export function buildModal(opts = {}) {
  const {
    title = '',
    bodyHtml = '',
    submitText = 'Save',
    cancelText = 'Cancel',
    hideFooter = false,
    onSubmit = null,
    onClose = null,
  } = opts;

  const overlay = document.createElement('div');
  overlay.className = 'ui-modal-overlay';
  overlay.innerHTML =
    '<div class="ui-modal" role="dialog" aria-modal="true">' +
      '<div class="ui-modal-head">' +
        '<span class="ui-modal-title">' + title + '</span>' +
        '<button type="button" class="ui-icon-btn" data-ui="close" title="Close">' + I_CLOSE + '</button>' +
      '</div>' +
      '<div class="ui-modal-body">' + bodyHtml + '</div>' +
      '<div class="ui-modal-error"></div>' +
      (hideFooter
        ? ''
        : '<div class="ui-modal-foot">' +
            '<button type="button" class="ui-btn ui-btn--ghost" data-ui="cancel">' + cancelText + '</button>' +
            (onSubmit ? '<button type="button" class="ui-btn ui-btn--primary" data-ui="submit">' + submitText + '</button>' : '') +
          '</div>') +
    '</div>';

  const errEl = overlay.querySelector('.ui-modal-error');
  const body = overlay.querySelector('.ui-modal-body');
  const nativeRemove = overlay.remove.bind(overlay);
  let closed = false;
  let busy = false;
  let downOnOverlay = false;

  function setError(msg) {
    errEl.textContent = msg || '';
    errEl.style.display = msg ? 'block' : 'none';
  }

  function cleanup() {
    document.removeEventListener('keydown', onKey, true);
  }

  function close() {
    if (closed) return;
    closed = true;
    cleanup();
    nativeRemove();
    if (typeof onClose === 'function') onClose();
  }

  overlay.remove = close;

  async function submit() {
    if (!onSubmit || busy) return;
    busy = true;
    setError('');
    try {
      const result = await onSubmit({ el: overlay, close, setError, errEl });
      if (result !== false) close();
    } catch (err) {
      setError(err && err.message ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  function onKey(e) {
    if (!overlay.isConnected) return;
    if (document.querySelector('.cf-overlay')) return;
    const all = document.querySelectorAll('.ui-modal-overlay');
    if (all[all.length - 1] !== overlay) return;

    if (e.key === 'Escape') {
      if (document.querySelector('.oc-file-picker')) return;
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }

    if (e.key === 'Enter' && onSubmit && overlay.contains(e.target)) {
      const t = e.target;
      const isInput = t.tagName === 'INPUT' && t.type !== 'button';
      if (isInput || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        submit();
      }
    }
  }

  document.addEventListener('keydown', onKey, true);

  overlay.addEventListener('mousedown', (e) => {
    downOnOverlay = e.target === overlay;
  });
  overlay.addEventListener('click', (e) => {
    if (downOnOverlay && e.target === overlay) close();
    downOnOverlay = false;
  });
  overlay.querySelector('[data-ui="close"]').addEventListener('click', close);
  const cancelBtn = overlay.querySelector('[data-ui="cancel"]');
  if (cancelBtn) cancelBtn.addEventListener('click', close);
  const submitBtn = overlay.querySelector('[data-ui="submit"]');
  if (submitBtn) submitBtn.addEventListener('click', submit);

  requestAnimationFrame(() => {
    if (!overlay.isConnected) return;
    if (overlay.contains(document.activeElement)) return;
    const first = overlay.querySelector('input:not([readonly]):not([type="hidden"]), textarea, select');
    if (first) first.focus();
  });

  return { el: overlay, body, errEl, close, setError, submit };
}

export function openModal(opts = {}) {
  const modal = buildModal(opts);
  document.body.appendChild(modal.el);
  if (typeof opts.onMount === 'function') opts.onMount(modal);
  return modal;
}