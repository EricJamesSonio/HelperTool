const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
const ZOOM_KEY = 'helpertool-ui-zoom';

let _zoom = 1;
let _zoomKeyHandler = null;

function _clamp(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 1;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) * 10) / 10;
}

function _readSaved() {
  try {
    return _clamp(localStorage.getItem(ZOOM_KEY) || 1);
  } catch (_) {
    return 1;
  }
}

function _saveZoom() {
  try {
    localStorage.setItem(ZOOM_KEY, String(_zoom));
  } catch (_) {}
}

function setZoom(val, persist = true) {
  _zoom = _clamp(val);
  document.documentElement.style.setProperty('--ui-zoom', String(_zoom));

  const lbl = document.getElementById('zoomLevel');
  if (lbl) lbl.textContent = Math.round(_zoom * 100) + '%';

  const outBtn = document.getElementById('zoomOutBtn');
  const inBtn = document.getElementById('zoomInBtn');
  if (outBtn) outBtn.disabled = _zoom <= ZOOM_MIN;
  if (inBtn) inBtn.disabled = _zoom >= ZOOM_MAX;

  if (persist) _saveZoom();
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

function _mountInTitlebar() {
  const controls = document.getElementById('zoomControls');
  const host = document.querySelector('.titlebar-controls');
  if (!controls || !host) return controls;
  controls.classList.add('zoom-controls--titlebar');
  controls.style.display = '';
  if (controls.parentElement !== host) host.insertBefore(controls, host.firstChild);
  return controls;
}

export function initZoomManager() {
  _mountInTitlebar();

  document.getElementById('zoomInBtn')?.addEventListener('click', () => setZoom(_zoom + ZOOM_STEP));
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => setZoom(_zoom - ZOOM_STEP));
  document.getElementById('zoomResetBtn')?.addEventListener('click', () => setZoom(1));

  const lbl = document.getElementById('zoomLevel');
  if (lbl) {
    lbl.title = 'Reset zoom (Ctrl+0)';
    lbl.addEventListener('click', () => setZoom(1));
  }

  if (_zoomKeyHandler) destroyZoomManager();
  _zoomKeyHandler = (e) => {
    const canvasPanel = document.getElementById('canvasPanelWrapper');
    if (canvasPanel && canvasPanel.style.display !== 'none') return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      setZoom(_zoom + ZOOM_STEP);
    } else if (e.key === '-') {
      e.preventDefault();
      setZoom(_zoom - ZOOM_STEP);
    } else if (e.key === '0') {
      e.preventDefault();
      setZoom(1);
    }
  };
  document.addEventListener('keydown', _zoomKeyHandler);

  setZoom(_readSaved(), false);
}

export function destroyZoomManager() {
  if (_zoomKeyHandler) {
    document.removeEventListener('keydown', _zoomKeyHandler);
    _zoomKeyHandler = null;
  }
}