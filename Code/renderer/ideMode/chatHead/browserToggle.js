const SVG = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
const I_FULL = SVG + '<path d="M2.5 6V2.5H6"/><path d="M10 2.5h3.5V6"/><path d="M13.5 10v3.5H10"/><path d="M6 13.5H2.5V10"/></svg>';
const I_MIN = SVG + '<path d="M6 2.5V6H2.5"/><path d="M10 2.5V6h3.5"/><path d="M13.5 10H10v3.5"/><path d="M2.5 10H6v3.5"/></svg>';

let btn = null;
let view = { open: false, full: false };

function ensureCss() {
  if (document.getElementById('ideHdBrowserCss')) return;
  const link = document.createElement('link');
  link.id = 'ideHdBrowserCss';
  link.rel = 'stylesheet';
  link.href = './styles/ide-hd-browser.css';
  document.head.appendChild(link);
}

function render() {
  if (!btn) return;
  btn.hidden = !view.open;
  btn.classList.toggle('full', view.full);
  btn.innerHTML = view.full ? I_MIN : I_FULL;
  btn.title = view.full ? 'Minimize the app view (Esc)' : 'Show the app view full screen';
}

async function onClick() {
  try {
    const mod = await import('../browserPane.js');
    mod.setFullscreen(!mod.isFullscreen());
  } catch (err) {
    console.error('[IDE] browser toggle failed:', err);
  }
}

function onState(e) {
  const d = (e && e.detail) || {};
  view = { open: !!d.open, full: !!d.full };
  render();
}

export function init() {
  if (btn) return;
  ensureCss();
  btn = document.createElement('button');
  btn.id = 'ideHdBrowserBtn';
  btn.type = 'button';
  btn.className = 'ide-hd-btn ide-hd-browser';
  btn.hidden = true;
  btn.addEventListener('click', onClick);
  document.body.appendChild(btn);
  document.addEventListener('ide:browser-state', onState);
  render();
}