import { state } from './state.js';
import { listConversations } from './history.js';
import { openTerminalForRepo } from './chat.js';
import {
  fitActiveTerminal,
  getActiveSlots, getFreeSlot, getNextFreeSlot, killSlot, activateSlot, setParallelConfig,
  getSlotForRepo,
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

  if (!state.selectedShell) {
    return { cmd: 'powershell.exe', args: ['-NoLogo', '-NoExit'] };
  }

  const parts = state.selectedShell.split('|');
  const cmd = parts[0];
  const rawArgs = parts.slice(1).filter(Boolean).map(a => a.replace(/\|\|/g, ' '));

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
    const prev = state.selectedProvider;
    state.selectedProvider = select.value;
    try { localStorage.setItem('helpertool-cs-provider', select.value); } catch (_) {}
    const repo = state.activeTab;
    import('./terminalManager.js').then((m) => {
      if (repo && !state.parallelMode) {
        m.switchProviderView(repo, prev);
        m.prewarmSession(repo).catch(() => {});
      } else {
        m.discardPrewarmed();
        if (repo) m.prewarmSession(repo).catch(() => {});
      }
      renderConvList();
      return refreshSidebar(true);
    }).catch(() => {});
  });

  import('./providerTabs.js').then((m) => m.renderProviderTabs()).catch(() => {});
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
    if (btn) btn.textContent = state.sidebarCollapsed ? '\u25b6' : '\u25c0';
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

  const localConvs = convStore.getConversations(repoPath);
  if (localConvs.length === 0 || forceLoading) {
    renderConvList(true);
  } else {
    state.conversations[repoPath] = localConvs;
    if (!state.messages[repoPath]) state.messages[repoPath] = [];
    renderConvList();
  }

  const beforeSnapshot = JSON.stringify(state.conversations[repoPath]?.map(c => c.id + c.title));
  const result = await listConversations(repoPath, state.selectedProvider);
  const serverConvs = result.conversations;

  if (serverConvs.length > 0) {
    convStore.mergeConversations(repoPath, serverConvs);
    const serverIds = new Set(serverConvs.map(c => c.id));
    const allStored = convStore.getConversations(repoPath);
    for (const c of allStored) {
      if (!c.id.startsWith('local_') && !serverIds.has(c.id)) {
        convStore.removeConversation(repoPath, c.id);
      }
    }
    const merged = convStore.getConversations(repoPath);
    const localOnly = localConvs.filter(c => c.id.startsWith('local_') && !serverIds.has(c.id));
    state.conversations[repoPath] = [...localOnly, ...merged.filter(c => !c.id.startsWith('local_'))];

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

  const afterSnapshot = JSON.stringify(state.conversations[repoPath]?.map(c => c.id + c.title));
  if (beforeSnapshot !== afterSnapshot) renderConvList();
}

export async function loadConversation(convId) {
  const repoPath = state.activeTab;
  if (!repoPath) return;

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
  convStore.touchConversation(repoPath, convId);

  if (!convId.startsWith('local_')) {
    const knownConvs = state.conversations[repoPath];
    if (knownConvs && knownConvs.length > 0) {
      const knownIds = new Set(knownConvs.map(c => c.id));
      if (!knownIds.has(convId)) {
        console.log(`[CS] loadConversation: session "${convId}" not in server list, removing stale entry`);
        convStore.removeConversation(repoPath, convId);
        await refreshSidebar();
        startNewChat();
        return;
      }
    }
  }

  if (!state.parallelMode) {
    state.activeConvId[repoPath] = convId;

    const lc = getLoadingController();
    lc.start('Loading conversation...');

    let slot = getSlotForRepo(repoPath);
    if (slot >= 0) {
      killSlot(slot);
    } else {
      slot = getNextFreeSlot();
    }
    if (slot < 0) {
      lc.hide();
      return;
    }
    state.activeSlotIndex = slot;

    try {
      await openTerminalForRepo(repoPath, slot);
    } catch (e) {
      console.error('[CS] loadConversation error:', e);
      lc.hide();
    }
    renderConvList();
    return;
  }

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

  const modalOn = state.parallelMode || state.modalView;

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
    <label class="oc-settings-label" style="margin-top:8px">Window</label>
    <div class="oc-parallel-row">
      <label class="oc-toggle" title="Show Code Swamp in a modal instead of the sidebar dock">
        <input type="checkbox" id="ocModalToggle" ${modalOn ? 'checked' : ''} ${state.parallelMode ? 'disabled' : ''}>
        <span class="oc-toggle-slider"></span>
      </label>
      <span class="oc-settings-label" style="margin:0;text-transform:none;letter-spacing:0">Open in modal</span>
    </div>
  `;

  container.after(div);

  const toggle = document.getElementById('ocParallelToggle');
  const select = document.getElementById('ocParallelSelect');
  const modalToggle = document.getElementById('ocModalToggle');

  toggle.addEventListener('change', () => {
    const mode = toggle.checked;
    select.disabled = !mode;
    if (modalToggle) {
      modalToggle.disabled = mode;
      modalToggle.checked = mode || state.modalView;
    }
    setParallelConfig(mode, Number(select.value));
  });

  select.addEventListener('change', () => {
    setParallelConfig(true, Number(select.value));
  });

  if (modalToggle) {
    modalToggle.addEventListener('change', () => {
      state.modalView = modalToggle.checked;
      try {
        localStorage.setItem('helpertool-cs-modal', modalToggle.checked ? '1' : '0');
      } catch (_) {}
    });
  }
}

export async function refreshSidebarAfterDelay(delay = 1500) {
  setTimeout(async () => {
    await refreshSidebar();
  }, delay);
}