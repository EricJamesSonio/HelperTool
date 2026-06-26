import { state } from './state.js';
import { listConversations, getConversation } from './history.js';
import { openTerminalForRepo, closeTerminalSession, showWelcome } from './chat.js';
import {
  hasTerminalSession, writeToTerminal, writeToSlot, fitActiveTerminal,
  getActiveSlots, getFreeSlot, killSlot, activateSlot, setParallelConfig
} from './terminalManager.js';
import { renderConvList } from './repoTabs.js';
import { getLoadingController } from './loading.js';
import { getProvider, getProviderList } from './providers.js';

export function renderShellSelect() {
  const select = document.getElementById('ocShellSelect');
  if (!select) return;
  select.innerHTML = '';

const shells = state.terminalShells && state.terminalShells.length > 0
  ? state.terminalShells
  : [
      { name: 'PowerShell (powershell.exe)', cmd: 'powershell.exe', args: ['-NoLogo', '-NoExit'] },
      { name: 'Command Prompt (cmd.exe)', cmd: 'cmd.exe', args: [] },
      { name: 'Git Bash (bash.exe)', cmd: 'bash.exe', args: [] },
      { name: 'WSL / Ubuntu (wsl.exe)', cmd: 'wsl.exe', args: [] },
    ];

  for (const shell of shells) {
    const opt = document.createElement('option');
    opt.value = shell.cmd + '|' + (shell.args || []).join('||');
    opt.textContent = shell.name;
    select.appendChild(opt);
  }

  if (!state.selectedShell) {
    const s = shells[0];
    state.selectedShell = s.cmd + '|' + (s.args || []).join('||');
  }

  select.value = state.selectedShell;
  select.addEventListener('change', () => {
    state.selectedShell = select.value;
  });
}

export function getSelectedShell() {
  if (!state.selectedShell && state.terminalShells.length > 0) {
    const s = state.terminalShells[0];
    state.selectedShell = s.cmd + '|' + (s.args || []).join('||');
  }

  // Fallback default
  if (!state.selectedShell) {
    return { cmd: 'powershell.exe', args: ['-NoLogo', '-NoExit'] };
  }

  const parts = state.selectedShell.split('|');
  const cmd = parts[0];
  const rawArgs = parts.slice(1).filter(Boolean).map(a => a.replace(/\|\|/g, ' '));

  // Always ensure -NoExit for powershell so it doesn't quit immediately
  if (cmd.toLowerCase().includes('powershell')) {
    const args = rawArgs.filter(a => a.trim());
    if (!args.includes('-NoExit')) args.push('-NoExit');
    if (!args.includes('-NoLogo')) args.push('-NoLogo');
    return { cmd, args };
  }

  return { cmd, args: rawArgs };
}

export function renderAIProviderSelect() {
  const select = document.getElementById('ocAIProviderSelect');
  if (!select) return;
  select.innerHTML = '';

  const providers = getProviderList();
  for (const p of providers) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    select.appendChild(opt);
  }

  select.value = state.selectedProvider;
  select.addEventListener('change', () => {
    state.selectedProvider = select.value;
    refreshSidebar(true);
  });
}

export function renderSidebarToggle() {
  const btn = document.getElementById('ocSidebarToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    const sidebar = document.getElementById('ocSidebar');
    const main = document.getElementById('ocMain');
    if (sidebar) sidebar.classList.toggle('collapsed', state.sidebarCollapsed);
    if (main) main.classList.toggle('expanded', state.sidebarCollapsed);
    if (btn) btn.textContent = state.sidebarCollapsed ? '▶' : '◀';
  });

  const main = document.getElementById('ocMain');
  if (main) {
    main.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'padding-left') {
        fitActiveTerminal();
      }
    });
  }
}

export async function refreshSidebar(forceLoading = false) {
  const repoPath = state.activeTab;
  if (!repoPath) return;

  const cached = state.conversations[repoPath] || [];
  if (cached.length === 0 || forceLoading) {
    renderConvList(true);
  }

  const convs = await listConversations(repoPath, state.selectedProvider);
  const currentConvs = state.conversations[repoPath] || [];

  const serverIds = new Set(convs.map(c => c.id));
  const localOnly = currentConvs.filter(c => c.id.startsWith('local_') && !serverIds.has(c.id));
  state.conversations[repoPath] = [...localOnly, ...convs];

  if (!state.messages[repoPath]) state.messages[repoPath] = [];
  renderConvList();
}

export async function loadConversation(convId) {
  const repoPath = state.activeTab;
  if (!repoPath) return;

  if (!state.parallelMode) {
    state.activeConvId[repoPath] = convId;

    const lc = getLoadingController();
    lc.start('Loading conversation...');

    if (hasTerminalSession(repoPath)) {
      closeTerminalSession(repoPath);
    }

    try {
      await openTerminalForRepo(repoPath);
    } catch (e) {
      console.error('[CS] loadConversation error:', e);
      lc.hide();
    }
    renderConvList();
    return;
  }

  // Parallel mode
  const slots = getActiveSlots();
  const existingSlot = slots.findIndex(s => s && s.convId === convId);
  if (existingSlot >= 0) {
    state.activeSlotIndex = existingSlot;
    activateSlot(existingSlot);
    renderConvList();
    return;
  }

  const freeSlot = getFreeSlot();
  if (freeSlot >= 0) {
    state.activeSlotIndex = freeSlot;
    state.slotData[freeSlot] = { repoPath, convId };
    state.activeConvId[repoPath] = convId;
    try {
      await openTerminalForRepo(repoPath, freeSlot);
    } catch (e) {
      console.error('[CS] loadConversation error:', e);
    }
    renderConvList();
    return;
  }

  // All slots full — show replace dialog
  const picked = await showReplaceDialog();
  if (picked === null) {
    renderConvList();
    return;
  }

  killSlot(picked);
  state.activeSlotIndex = picked;
  state.slotData[picked] = { repoPath, convId };
  state.activeConvId[repoPath] = convId;
  try {
    await openTerminalForRepo(repoPath, picked);
  } catch (e) {
    console.error('[CS] loadConversation error:', e);
  }
  renderConvList();
}

export async function startNewChat() {
  const repoPath = state.activeTab;
  if (!repoPath) return;

  if (state.parallelMode) {
    const slotIndex = state.activeSlotIndex;
    writeToSlot(slotIndex, '/exit\n');
    await new Promise(r => setTimeout(r, 2000));
    killSlot(slotIndex);
    await new Promise(r => setTimeout(r, 1000));
    state.slotData[slotIndex] = null;
    await refreshSidebar();
    renderConvList();
    const input = document.getElementById('ocInput');
    if (input) setTimeout(() => input.focus(), 50);
    return;
  }

  state.activeConvId[repoPath] = null;
  state.messages[repoPath] = [];
  state.messageCache[repoPath] = [];

  if (hasTerminalSession(repoPath)) {
    writeToTerminal(repoPath, '/exit\n');
    await new Promise(r => setTimeout(r, 2000));
    closeTerminalSession(repoPath);
    await new Promise(r => setTimeout(r, 1000));
    await refreshSidebar();
  }

  showWelcome();
  renderConvList();

  const input = document.getElementById('ocInput');
  if (input) setTimeout(() => input.focus(), 50);
}

function showReplaceDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'oc-replace-overlay';
    overlay.innerHTML = `
      <div class="oc-replace-dialog">
        <div class="oc-replace-title">Terminals full</div>
        <div class="oc-replace-text">Replace which terminal?</div>
        <div class="oc-replace-options"></div>
        <button class="oc-btn oc-replace-cancel">Cancel</button>
      </div>
    `;

    const optionsContainer = overlay.querySelector('.oc-replace-options');
    const count = state.parallelSlots;
    for (let i = 0; i < count; i++) {
      const btn = document.createElement('button');
      btn.className = 'oc-btn oc-replace-option';
      const data = state.slotData[i];
      btn.textContent = data ? `Terminal ${i + 1}` : `Terminal ${i + 1} (empty)`;
      btn.dataset.slot = i;
      btn.addEventListener('click', () => {
        overlay.remove();
        resolve(i);
      });
      optionsContainer.appendChild(btn);
    }

    overlay.querySelector('.oc-replace-cancel').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });

    document.body.appendChild(overlay);
  });
}

export function renderParallelModeControls() {
  const container = document.getElementById('ocAISettings');
  if (!container) return;

  const existing = document.getElementById('ocParallelSettings');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'oc-term-settings';
  div.id = 'ocParallelSettings';
  div.innerHTML = `
    <label class="oc-settings-label">Parallel Mode</label>
    <div class="oc-parallel-row">
      <label class="oc-toggle">
        <input type="checkbox" id="ocParallelToggle" ${state.parallelMode ? 'checked' : ''}>
        <span class="oc-toggle-slider"></span>
      </label>
      <select class="oc-settings-select oc-parallel-select" id="ocParallelSelect" ${state.parallelMode ? '' : 'disabled'}>
        <option value="2" ${state.parallelSlots === 2 ? 'selected' : ''}>2</option>
        <option value="3" ${state.parallelSlots === 3 ? 'selected' : ''}>3</option>
        <option value="4" ${state.parallelSlots === 4 ? 'selected' : ''}>4</option>
      </select>
    </div>
  `;

  container.after(div);

  const toggle = document.getElementById('ocParallelToggle');
  const select = document.getElementById('ocParallelSelect');

  toggle.addEventListener('change', () => {
    const mode = toggle.checked;
    select.disabled = !mode;
    setParallelConfig(mode, Number(select.value));
  });

  select.addEventListener('change', () => {
    setParallelConfig(true, Number(select.value));
  });
}

export async function refreshSidebarAfterDelay(delay = 1500) {
  setTimeout(async () => {
    await refreshSidebar();
  }, delay);
}

