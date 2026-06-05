const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

let _zoom = 1;

function setZoom(val) {
  _zoom = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, val)) * 10) / 10;
  const el = document.getElementById('treeContainer');
  if (el) el.style.setProperty('--tree-zoom', _zoom);
  const lbl = document.getElementById('zoomLevel');
  if (lbl) lbl.textContent = Math.round(_zoom * 100) + '%';
}

export function initZoomManager() {
  const treeContainer = document.getElementById('treeContainer');

  // Only show zoom controls when there's a tree
  const controls = document.getElementById('zoomControls');
  const show = () => { if (controls) controls.style.display = ''; };
  const hide = () => { if (controls) controls.style.display = 'none'; };

  const observer = new MutationObserver(() => {
    const hasContent = treeContainer?.children.length > 0;
    if (hasContent) show(); else hide();
  });
  if (treeContainer) {
    observer.observe(treeContainer, { childList: true, subtree: false });
    if (treeContainer.children.length > 0) show();
  }

  // Buttons
  document.getElementById('zoomInBtn')?.addEventListener('click', () => setZoom(_zoom + ZOOM_STEP));
  document.getElementById('zoomOutBtn')?.addEventListener('click', () => setZoom(_zoom - ZOOM_STEP));
  document.getElementById('zoomResetBtn')?.addEventListener('click', () => setZoom(1));

  // Keyboard shortcuts — skip when canvas tool is active
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
    const canvasPanel = document.getElementById('canvasPanelWrapper');
    if (canvasPanel && canvasPanel.style.display !== 'none') return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(_zoom + ZOOM_STEP); }
    else if (e.key === '-') { e.preventDefault(); setZoom(_zoom - ZOOM_STEP); }
    else if (e.key === '0') { e.preventDefault(); setZoom(1); }
  });

  setZoom(1);
}
