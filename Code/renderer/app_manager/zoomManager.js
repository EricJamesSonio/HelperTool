import { DEFAULT_PREFERENCES } from '../defaultPreferences.js';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
const ZOOM_KEY = 'helpertool-ui-zoom';
const SHOW_MS = 1400;

let _zoom = DEFAULT_PREFERENCES.app.zoom;
let _zoomKeyHandler = null;
let _indicator = null;
let _hideTimer = null;

function _clamp(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 1;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) * 10) / 10;
}

function _readSaved() {
  try {
    const saved = localStorage.getItem(ZOOM_KEY);
    return _clamp(saved === null ? DEFAULT_PREFERENCES.app.zoom : saved);
  } catch (_) {
    return DEFAULT_PREFERENCES.app.zoom;
  }
}

function _saveZoom() {
  try {
    localStorage.setItem(ZOOM_KEY, String(_zoom));
  } catch (_) {}
}

function _ensureIndicator() {
  if (_indicator && _indicator.isConnected) return _indicator;
  const el = document.createElement('div');
  el.id = 'zoomIndicator';
  el.className = 'zoom-indicator';
  el.innerHTML =
    '<span class="zoom-indicator-val"></span>' +
    '<span class="zoom-indicator-bar"><span class="zoom-indicator-fill"></span></span>' +
    '<span class="zoom-indicator-hint">Ctrl + / Ctrl - to resize, Ctrl 0 to reset</span>';
  document.body.appendChild(el);
  _indicator = el;
  return el;
}

function _showIndicator() {
  const el = _ensureIndicator();
  const val = el.querySelector('.zoom-indicator-val');
  const fill = el.querySelector('.zoom-indicator-fill');
  if (val) val.textContent = Math.round(_zoom * 100) + '%';
  if (fill) fill.style.width = (((_zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100) + '%';
  el.classList.add('show');
  clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => el.classList.remove('show'), SHOW_MS);
}

function setZoom(val, persist = true, announce = false) {
  _zoom = _clamp(val);
  document.documentElement.style.setProperty('--ui-zoom', String(_zoom));
  if (persist) _saveZoom();
  if (announce) _showIndicator();
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

export function initZoomManager() {
  if (_zoomKeyHandler) destroyZoomManager();
  _zoomKeyHandler = (e) => {
    const canvasPanel = document.getElementById('canvasPanelWrapper');
    if (canvasPanel && canvasPanel.style.display !== 'none') return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      setZoom(_zoom + ZOOM_STEP, true, true);
    } else if (e.key === '-') {
      e.preventDefault();
      setZoom(_zoom - ZOOM_STEP, true, true);
    } else if (e.key === '0') {
      e.preventDefault();
      setZoom(1, true, true);
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
  clearTimeout(_hideTimer);
  if (_indicator) {
    _indicator.remove();
    _indicator = null;
  }
}