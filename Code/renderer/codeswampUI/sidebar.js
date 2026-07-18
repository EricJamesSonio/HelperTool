import { state } from './state.js';
import { listConversations } from './history.js';
import { openTerminalForRepo } from './chat.js';
import {
  fitActiveTerminal,
  getActiveSlots, getFreeSlot, getNextFreeSlot, killSlot, activateSlot, setParallelConfig,
} from './terminalManager.js';
import { renderConvList } from './repoTabs.js';
import { getLoadingController } from './loading.js';
import { getProviderList } from './providers.js';
import { convStore } from './conversationStore.js';

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

  // Step 1: Show cached data from local store immediately, or loading if requested
  const localConvs = convStore.getConversations(repoPath);
  if (localConvs.length === 0 || forceLoading) {
    renderConvList(true);
  } else {
    state.conversations[repoPath] = localConvs;
    if (!state.messages[repoPath]) state.messages[repoPath] = [];
    renderConvList();
  }

  // Step 2: Sync with IPC to pick up any conversations from external sources
  const beforeSnapshot = JSON.stringify(state.conversations[repoPath]?.map(c => c.id + c.title));
  const result = await listConversations(repoPath, state.selectedProvider);
  const serverConvs = result.conversations;

  if (serverConvs.length > 0) {
    convStore.mergeConversations(repoPath, serverConvs);
    const merged = convStore.getConversations(repoPath);
    const serverIds = new Set(serverConvs.map(c => c.id));
    const localOnly = localConvs.filter(c => c.id.startsWith('local_') && !serverIds.has(c.id));
    state.conversations[repoPath] = [...localOnly, ...merged.filter(c => !c.id.startsWith('local_') || serverIds.has(c.id))];

    if (!state.messageCache[repoPath]) state.messageCache[repoPath] = {};
    for (const c of serverConvs) {
      if (c.id && !state.messageCache[repoPath][c.id]) {
        state.messageCache[repoPath][c.id] = { title: c.title, date: c.date };
      }
    }
  } else {
    state.conversations[repoPath] = convStore.getConversations(repoPath);
  }

  if (!state.messages[repoPath]) state.messages[repoPath] = [];

  // Step 3: Only re-render if data actually changed
  const afterSnapshot = JSON.stringify(state.conversations[repoPath]?.map(c => c.id + c.title));
  if (beforeSnapshot !== afterSnapshot) renderConvList();
}

export async function loadConversation(convId) {
  const repoPath = state.activeTab;
  if (!repoPath) return;

  // Store this conversation locally so the sidebar shows it even if IPC is unavailable
  const existing = (state.conversations[repoPath] || []).find(c => c.id === convId);
  if (existing) {
    convStore.addConversation(repoPath, existing);
  } else {
    convStore.addConversation(repoPath, {
      id: convId,
      title: convId,
      date: new Date().toISOString(),
      provider: state.selectedProvider,
    });
  }
  // Bump to top — loaded conversations are recently used
  convStore.touchConversation(repoPath, convId);

  if (!state.parallelMode) {
    state.activeConvId[repoPath] = convId;

    const lc = getLoadingController();
    lc.start('Loading conversation...');

    // Kill only the active slot so other sessions are preserved
    killSlot(state.activeSlotIndex);

    try {
      await openTerminalForRepo(repoPath, state.activeSlotIndex);
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

  state.lastSentMessage = null;

  // In parallel mode, stay within slot limits; in single mode, grow dynamically
  const freeSlot = state.parallelMode ? getFreeSlot() : getNextFreeSlot();
  if (freeSlot >= 0) {
    state.activeConvId[repoPath] = null;
    state.activeSlotIndex = freeSlot;
    state.slotData[freeSlot] = { repoPath, convId: null };
    await openTerminalForRepo(repoPath, freeSlot);
    renderConvList();
  }

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

