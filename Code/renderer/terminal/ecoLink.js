const ICON_ECO = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4c-4 0-7.5 2.5-9 6 1.5 3.5 5 6 9 6s7.5-2.5 9-6c-1.5-3.5-5-6-9-6z"/><circle cx="10" cy="10" r="2.5"/></svg>';
const KIND_RE = /^\s*(server|client)\b/i;

export function shortcutKindOf(label) {
  const m = KIND_RE.exec(String(label || ''));
  return m ? m[1].toLowerCase() : null;
}

export function createEcoButton(onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'terminal-eco-btn';
  btn.hidden = true;
  btn.title = 'Ecosystem Tool - logs, API calls and errors of this terminal';
  btn.innerHTML = ICON_ECO + '<span>Ecosystem</span>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

export async function openEcosystem(spec, terminalId) {
  const tools = await import('../app_manager/toolsManager.js');
  const eco = await import('../ecoDashboardUI.js');
  if (!eco.isOpen()) tools.closeAllPanels();
  return eco.attachTerminal({
    cwd: spec.cwd,
    command: spec.command,
    label: spec.label,
    terminalId,
  });
}