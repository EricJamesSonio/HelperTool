const _ops = [];
let _seq = 0;

function _panel() {
  return document.querySelector('.bm-panel-inline');
}

function _closeMenus() {
  document.querySelectorAll('.bm-dropdown-menu.open').forEach((m) => m.classList.remove('open'));
}

function _renderPill() {
  const panel = _panel();
  if (!panel) return;
  let pill = panel.querySelector('#bmBusyPill');

  if (!_ops.length) {
    if (pill) pill.remove();
    panel.classList.remove('bm-is-busy');
    return;
  }

  panel.classList.add('bm-is-busy');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'bmBusyPill';
    pill.className = 'bm-busy-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.innerHTML = '<span class="bm-spinner"></span><span class="bm-busy-text"></span>';
    panel.appendChild(pill);
  }
  pill.querySelector('.bm-busy-text').textContent = _ops[_ops.length - 1].label;
}

export function isBusy() {
  return _ops.length > 0;
}

export function startBusy(label, btn) {
  const op = { id: ++_seq, label };
  if (btn) {
    btn.disabled = true;
    btn.classList.add('bm-btn-loading');
    btn.setAttribute('aria-busy', 'true');
  }
  _ops.push(op);
  _closeMenus();
  _renderPill();

  let ended = false;
  return function end() {
    if (ended) return;
    ended = true;
    const i = _ops.indexOf(op);
    if (i > -1) _ops.splice(i, 1);
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('bm-btn-loading');
      btn.removeAttribute('aria-busy');
    }
    _renderPill();
  };
}

export async function runBusy(label, btn, fn) {
  if (isBusy()) return undefined;
  const end = startBusy(label, btn);
  try {
    return await fn();
  } finally {
    end();
  }
}