import { FLOW_CSS } from './styles.js';
import { getTemplate } from './template.js';
import { state } from './state.js';
import { wire, isOpen as uiIsOpen, startPolling, stopPolling, seedLastSeen, refreshHeader } from './ui.js';

const STYLE_ID = 'ftStyles';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = FLOW_CSS;
  document.head.appendChild(style);
}

function ensurePanel() {
  let panel = document.getElementById('ftPanel');
  if (panel) return panel;
  ensureStyles();
  const holder = document.createElement('div');
  holder.innerHTML = getTemplate();
  panel = holder.firstElementChild;
  document.body.appendChild(panel);
  wire(panel, close);
  state.wired = true;
  return panel;
}

export function getPanel() {
  return ensurePanel();
}

export function isOpen() {
  return uiIsOpen();
}

export async function open() {
  const panel = ensurePanel();
  panel.classList.add('open');
  refreshHeader();
  await seedLastSeen();
  startPolling();
  const box = panel.querySelector('#ftBox');
  if (box) box.focus();
}

export function close() {
  const panel = document.getElementById('ftPanel');
  if (panel) panel.classList.remove('open');
  stopPolling();
}

export async function toggle() {
  if (isOpen()) close();
  else await open();
}