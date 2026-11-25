/**
 * pdfMaster.js
 * Public API for the PDF Master tool: open / close / isOpen / getPanel.
 */

import { createPanel } from './app_manager/panels/panelFactory.js';
import * as ui from './pdfMaster/ui.js';
import * as writer from './pdfMaster/writerUI.js';

let _panel = null;

function injectCss(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function ensurePanel() {
  if (_panel) return;
  injectCss('pdfMasterCss', './styles/pdf-master.css');
  injectCss('pdfWriterCss', './styles/pdf-writer.css');
  const made = createPanel({
    id: 'pdfMasterPanel',
    className: 'pdfm-panel',
    title: 'PDF Master',
    containerId: 'pdfMasterContainer',
    closeBtnId: 'closePdfMasterBtn',
  });
  _panel = made.panel;
  ui.mount(made.container);
  writer.mount(made.container);
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