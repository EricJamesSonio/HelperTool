import { createPanel } from './panel.js';
import { runFunction } from './actions.js';

const ICON = '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2z"/><path d="M7 7.5h6M7 10.5h3.5"/></svg>';

let btn = null;
let panel = null;
let flashTimer = 0;

function injectCss() {
  if (document.getElementById('ideChatHeadCss')) return;
  const link = document.createElement('link');
  link.id = 'ideChatHeadCss';
  link.rel = 'stylesheet';
  link.href = './styles/ide-chat-head.css';
  document.head.appendChild(link);
}

function syncButton() {
  if (!btn || !panel) return;
  btn.classList.toggle('open', panel.isOpen());
}

function closePanel() {
  if (!panel) return;
  panel.close();
  syncButton();
}

function togglePanel() {
  if (!panel) return;
  if (panel.isOpen()) panel.close();
  else panel.open();
  syncButton();
}

function onResult(res) {
  if (!btn) return;
  btn.classList.remove('ok');
  btn.classList.remove('bad');
  btn.classList.add(res && res.ok ? 'ok' : 'bad');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    btn.classList.remove('ok');
    btn.classList.remove('bad');
  }, 2000);
}

function onDocDown(e) {
  if (!panel || !panel.isOpen()) return;
  if (panel.el.contains(e.target) || (btn && btn.contains(e.target))) return;
  closePanel();
}

export function init() {
  if (document.getElementById('ideHdBtn')) return;
  injectCss();
  panel = createPanel({
    onRun: runFunction,
    onResult,
    onClose: closePanel,
  });
  btn = document.createElement('button');
  btn.id = 'ideHdBtn';
  btn.type = 'button';
  btn.className = 'ide-hd-btn';
  btn.title = 'Chat head functions';
  btn.innerHTML = ICON;
  btn.addEventListener('click', togglePanel);
  document.body.appendChild(btn);
  document.body.appendChild(panel.el);
  document.addEventListener('mousedown', onDocDown, true);
}