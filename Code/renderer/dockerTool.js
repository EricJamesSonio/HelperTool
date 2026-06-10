import * as state from './dockerTool/state.js';
import { getPanelTemplate } from './dockerTool/template.js';
import { updateBadge } from './dockerTool/ui.js';
import * as containersTab from './dockerTool/tabs/containers.js';
import * as imagesTab from './dockerTool/tabs/images.js';
import * as statsTab from './dockerTool/tabs/stats.js';

let _panel = null;
let _open = false;

export function isOpen() {
  return _open;
}

export async function open() {
  if (_open) return;
  if (!_panel) _buildPanel();
  _panel.classList.add('open');
  _open = true;
  await _checkConnection();
  await containersTab.render();
  imagesTab.render();
}

export function close() {
  if (!_open) return;
  _panel.classList.remove('open');
  _open = false;
  _cleanupLogModal();
}

function _cleanupLogModal() {
  const overlay = document.getElementById('dtLogOverlay');
  if (overlay) overlay.remove();
}

function _buildPanel() {
  const div = document.createElement('div');
  div.innerHTML = getPanelTemplate();
  _panel = div.firstElementChild;
  document.body.appendChild(_panel);

  _panel.querySelector('#dtCloseBtn').addEventListener('click', () => close());
  _panel.querySelector('#dtRefreshBtn').addEventListener('click', async () => {
    await _checkConnection();
    await containersTab.render();
    imagesTab.render();
    if (state.get('activeTab') === 'stats') statsTab.render();
  });

  const tabs = _panel.querySelector('#dtTabs');
  tabs.addEventListener('click', async (e) => {
    const btn = e.target.closest('.dt-tab');
    if (!btn) return;
    const tab = btn.dataset.tab;
    state.set('activeTab', tab);
    tabs.querySelectorAll('.dt-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.dt-tab-content').forEach(tc => tc.classList.remove('active'));
    const content = document.getElementById('dtTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (content) content.classList.add('active');
    if (tab === 'stats') await statsTab.render();
  });

  containersTab.wireActions();
  imagesTab.wireActions();
}

async function _checkConnection() {
  try {
    const r = await window.dockerAPI.ping();
    state.set('connected', r.ok);
    updateBadge(r.ok);
  } catch {
    state.set('connected', false);
    updateBadge(false);
  }
}
