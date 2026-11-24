/**
 * pdfMaster.js
 * Public API for the PDF Master tool: open / close / isOpen / getPanel.
 */

import { createPanel } from './app_manager/panels/panelFactory.js';
import * as ui from './pdfMaster/ui.js';

let _panel = null;

function injectCss() {
  if (document.getElementById('pdfMasterCss')) return;
  const link = document.createElement('link');
  link.id = 'pdfMasterCss';
  link.rel = 'stylesheet';
  link.href = './styles/pdf-master.css';
  document.head.appendChild(link);
}

function ensurePanel() {
  if (_panel) return;
  injectCss();
  const made = createPanel({
    id: 'pdfMasterPanel',
    className: 'pdfm-panel',
    title: 'PDF Master',
    containerId: 'pdfMasterContainer',
    closeBtnId: 'closePdfMasterBtn',
  });
  _panel = made.panel;
  ui.mount(made.container);
}

export async function open() {
  ensurePanel();
  _panel.classList.add('open');
  ui.onShow();
}

export function close() {
  if (_panel) _panel.classList.remove('open');
}

export function isOpen() {
  return !!_panel && _panel.classList.contains('open');
}

export function getPanel() {
  return _panel;
}