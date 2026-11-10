import { state } from './state.js';
import { writeToSlot, hasTerminalSession, waitForTerminalOpencode, isShellPrompt, restartOpencode, acceptPasteWarning } from './terminalManager.js';
import { openTerminalForRepo } from './chat.js';
import { refreshSidebar } from './sidebar.js';
import { convStore } from './conversationStore.js';
import { renderConvList } from './repoTabs.js';
import { openPromptPicker } from './promptPicker.js';
import { openTicketPanel } from './ticketPanel.js';
import { openStonePanel } from './stonePanel.js';
import { openPlanningPanel } from './planningPanel.js';
import { openBuildKitPanel } from './buildKitPanel.js';
import { open, close as closePicker, isOpen, selectNext, selectPrev, confirmSelection, ensureTreeLoaded, getCachedFiles } from './filePicker.js';
import { getSlotForRepo, pickSlotForRepo, revealTerminalForRepo, awaitPrewarm, waitForTerminalBoot, getTerminalInstances, getFreeSlot } from './terminalManager.js';

function slotForSend(repoPath) {
  if (!state.parallelMode) return pickSlotForRepo(repoPath);
  const insts = getTerminalInstances();
  const act = insts[state.activeSlotIndex];
  if (act && act.repoPath === repoPath) return state.activeSlotIndex;
  const own = getSlotForRepo(repoPath);
  if (own >= 0) return own;
  if (!act) return state.activeSlotIndex;
  const free = getFreeSlot();
  if (free >= 0) return free;
  throw new Error('All parallel slots are used by other repos');
}

function extractFilePathsFromText(text) {
  const knownPaths = getCachedFiles().map(f => f.path);
  if (!knownPaths.length) return [];
  const found = [];
  for (const p of knownPaths) {
    if (text.includes(p)) {
      found.push(p);
    }
  }
  return found;
}

async function handleAtMention(input) {
  const val = input.value;
  const cursorPos = input.selectionStart;
  const atIdx = val.lastIndexOf('@', cursorPos);
  if (atIdx === -1 || atIdx < val.lastIndexOf(' ', cursorPos)) {
    if (isOpen()) closePicker();
    return;
  }
  const query = val.slice(atIdx + 1, cursorPos);
  if (query.length > 50) {
    if (isOpen()) closePicker();
    return;
  }
  if (state.activeTab) {
    await ensureTreeLoaded(state.activeTab);
    open(query, input);
  }
}

export function renderInput() {
  const area = document.getElementById('ocInputArea');
  if (!area) return;

  area.innerHTML = `
    <div class="oc-pending-files" id="ocPendingFiles"></div>
    <div class="oc-input-row">
      <textarea class="oc-input" id="ocInput" placeholder="Type a message..." rows="1"></textarea>
      <button class="oc-btn oc-btn-file" id="ocAttachBtn" title="Attach file">File</button>
      <button class="oc-btn oc-btn-prompt" id="ocPromptBtn" title="Load prompt">Prompt</button>
      <button class="oc-btn oc-btn-ticket" id="ocTicketBtn" title="Tickets">Ticket</button>
      <button class="oc-btn oc-btn-stone" id="ocStoneBtn" title="Infinity Stones">Stones</button>
      <button class="oc-btn oc-btn-planning" id="ocPlanningBtn" title="Plans">Plan</button>
      <button class="oc-btn oc-btn-kit" id="ocKitBtn" title="Build Kits">Kit</button>
    </div>
    <div class="oc-input-actions">
      <button class="oc-btn oc-btn-mode plan" id="ocModeBtn">Plan</button>
      <button class="oc-btn oc-btn-send" id="ocSendBtn">Send</button>
    </div>
  `;

  const input = document.getElementById('ocInput');
  const sendBtn = document.getElementById('ocSendBtn');
  const modeBtn = document.getElementById('ocModeBtn');
  const attachBtn = document.getElementById('ocAttachBtn');
  const promptBtn = document.getElementById('ocPromptBtn');
  const ticketBtn = document.getElementById('ocTicketBtn');
  const stoneBtn = document.getElementById('ocStoneBtn');
  const planningBtn = document.getElementById('ocPlanningBtn');
  const kitBtn = document.getElementById('ocKitBtn');

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    handleAtMention(input);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (isOpen()) {
        e.preventDefault();
        confirmSelection(input);
        return;
      }
      e.preventDefault();
      sendMessage();
      return;
    }
    if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      closePicker();
      return;
    }
    if (e.key === 'ArrowDown' && isOpen()) {
      e.preventDefault();
      selectNext();
      return;
    }
    if (e.key === 'ArrowUp' && isOpen()) {
      e.preventDefault();
      selectPrev();
      return;
    }
    if (e.key === 'Tab' && isOpen()) {
      e.preventDefault();
      confirmSelection(input);
      return;
    }
  });

  modeBtn.addEventListener('click', toggleMode);

  sendBtn.addEventListener('click', sendMessage);

  attachBtn.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI.opencode.selectFile?.();
      if (result && result.filePaths && result.filePaths[0]) {
        const filePath = result.filePaths[0];
        const name = filePath.split(/[/\\]/).pop();
        state.pendingFiles.push({ name, path: filePath, type: 'file' });
        renderPendingFiles();
      }
    } catch {}
  });

  promptBtn.addEventListener('click', () => openPromptPicker());
  ticketBtn.addEventListener('click', () => openTicketPanel());
  stoneBtn.addEventListener('click', () => openStonePanel());
  planningBtn.addEventListener('click', openPlanningPanel);
  kitBtn.addEventListener('click', openBuildKitPanel);
}

function renderPendingFiles() {
  const container = document.getElementById('ocPendingFiles');
  if (!container) return;
  container.innerHTML = '';
  for (const f of state.pendingFiles) {
    const chip = document.createElement('span');
    chip.className = 'oc-file-chip oc-file-chip-pending';
    chip.innerHTML = `${f.name} <span class="oc-file-chip-remove" data-path="${f.path}">\u2715</span>`;
    chip.querySelector('.oc-file-chip-remove').addEventListener('click', () => {
      state.pendingFiles = state.pendingFiles.filter(p => p.path !== f.path);
      renderPendingFiles();
    });
    container.appendChild(chip);
  }
}

function toggleMode() {
  const repoPath = state.activeTab;
  if (!repoPath) return;
  writeToSlot(state.activeSlotIndex, '\t');
  state.cliMode = state.cliMode === 'plan' ? 'code' : 'plan';
  const btn = document.getElementById('ocModeBtn');
  if (btn) {
    btn.textContent = state.cliMode === 'plan' ? 'Plan' : 'Code';
    btn.className = `oc-btn oc-btn-mode ${state.cliMode}`;
  }
}

async function sendMessage() {
  try {
    const input = document.getElementById('ocInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const repoPath = state.activeTab;
    if (!repoPath) return;

    if (state.streaming) {
      console.warn('[CS] sendMessage: stale streaming=true, forcing reset');
      state.streaming = false;
    }

    state.lastSentMessage = text;

    const sendBtn = document.getElementById('ocSendBtn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    }

    await awaitPrewarm(repoPath);

    let slotIndex = slotForSend(repoPath);
    if (!hasTerminalSession(repoPath)) {
      await openTerminalForRepo(repoPath, slotIndex);
    } else if (!state.parallelMode) {
      slotIndex = getSlotForRepo(repoPath);
    }
    if (!state.parallelMode) {
      state.activeSlotIndex = slotIndex;
      revealTerminalForRepo(repoPath);
    } else {
      state.activeSlotIndex = slotIndex;
    }

    await waitForTerminalBoot(repoPath, slotIndex);

    if (isShellPrompt(repoPath, slotIndex)) {
      await restartOpencode(repoPath, slotIndex);
    }

    await waitForTerminalOpencode(repoPath, slotIndex);

    const pasted = `\x1b[200~${text}\x1b[201~`;
    await writeToSlot(slotIndex, pasted);

    await acceptPasteWarning(repoPath, slotIndex);

    await new Promise(r => setTimeout(r, 800));

    await writeToSlot(slotIndex, '\r');

    input.value = '';
    input.style.height = 'auto';
    state.pendingFiles = [];
    renderPendingFiles();

    const activeConv = state.activeConvId[repoPath];
    if (activeConv) {
      const convs = convStore.getConversations(repoPath);
      const conv = convs.find(c => c.id === activeConv);
      if (conv && conv.title === 'New Chat' && !conv.customTitle) {
        const title = text.length > 40 ? text.slice(0, 40) + '\u2026' : text;
        convStore.addConversation(repoPath, {
          id: activeConv,
          title,
          date: new Date().toISOString(),
          provider: state.selectedProvider,
        });
        state.conversations[repoPath] = convStore.getConversations(repoPath);
        renderConvList();
      }
    }

    setTimeout(() => refreshSidebar(), 1500);
  } catch (err) {
    console.error('[CS] sendMessage: unhandled error', err);
    const input = document.getElementById('ocInput');
    if (input) {
      input.placeholder = `Error: ${err.message}. Type again to retry.`;
      setTimeout(() => {
        if (input) input.placeholder = 'Type a message...';
      }, 4000);
    }
  } finally {
    const sendBtn = document.getElementById('ocSendBtn');
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }
  }
}

let _primeBusy = false;

function primeFromTyping(el) {
  const repoPath = state.activeTab;
  const welcome = document.getElementById('ocWelcome');
  if (!repoPath || !welcome || welcome.style.display === 'none') return;
  if (!el || !String(el.value || '').trim()) return;
  if (_primeBusy) return;
  _primeBusy = true;
  (async () => {
    try {
      await awaitPrewarm(repoPath);
      if (revealTerminalForRepo(repoPath)) return;
      const slot = pickSlotForRepo(repoPath);
      state.activeSlotIndex = slot;
      await openTerminalForRepo(repoPath, slot);
    } catch (err) {
      console.warn('[CS] could not open the terminal on typing:', err && err.message ? err.message : err);
    } finally {
      _primeBusy = false;
    }
  })();
}

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'ocInput') primeFromTyping(e.target);
}, true);