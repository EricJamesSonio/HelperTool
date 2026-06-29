import { state } from './state.js';
import { writeToTerminal, writeToSlot, hasTerminalSession, activateSlot, getActiveSlots } from './terminalManager.js';
import { openTerminalForRepo } from './chat.js';
import { refreshSidebar } from './sidebar.js';
import { renderConvList } from './repoTabs.js';
import { getLoadingController } from './loading.js';
import { openPromptPicker } from './promptPicker.js';
import { open, close as closePicker, isOpen, selectNext, selectPrev, confirmSelection, ensureTreeLoaded, getCachedFiles } from './filePicker.js';

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
  const atIdx = val.lastIndexOf('@');
  if (atIdx === -1 || atIdx < val.lastIndexOf(' ')) {
    if (isOpen()) closePicker();
    return;
  }
  const query = val.slice(atIdx + 1);
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
      <button class="oc-btn oc-btn-attach" id="ocAttachBtn" title="Attach file">📎</button>
      <button class="oc-btn oc-btn-prompt" id="ocPromptBtn" title="Load prompt">📋</button>
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

  promptBtn.addEventListener('click', openPromptPicker);
}

function renderPendingFiles() {
  const container = document.getElementById('ocPendingFiles');
  if (!container) return;
  container.innerHTML = '';
  for (const f of state.pendingFiles) {
    const chip = document.createElement('span');
    chip.className = 'oc-file-chip oc-file-chip-pending';
    chip.innerHTML = `${f.name} <span class="oc-file-chip-remove" data-path="${f.path}">✕</span>`;
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
  if (state.parallelMode) {
    const inst = Object.values(getActiveSlots()).find(s => s && s.slotIndex === state.activeSlotIndex);
    if (!inst) return;
    writeToSlot(state.activeSlotIndex, '\t');
  } else {
    if (!hasTerminalSession(repoPath)) return;
    writeToTerminal(repoPath, '\t');
  }
  state.cliMode = state.cliMode === 'plan' ? 'code' : 'plan';
  const btn = document.getElementById('ocModeBtn');
  if (btn) {
    btn.textContent = state.cliMode === 'plan' ? 'Plan' : 'Code';
    btn.className = `oc-btn oc-btn-mode ${state.cliMode}`;
  }
}

async function sendMessage() {
  const input = document.getElementById('ocInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const repoPath = state.activeTab;
  if (!repoPath) return;

  const slotIndex = state.parallelMode ? state.activeSlotIndex : 0;
  const hasSession = state.parallelMode ? !!getActiveSlots()[slotIndex] : hasTerminalSession(repoPath);
  const isNewChat = !hasSession;

  if (!hasSession) {
    const lc = getLoadingController();
    lc.start('Starting terminal...');
    try {
      await openTerminalForRepo(repoPath, slotIndex);
    } catch (e) {
      lc.hide();
      return;
    }
  }

  let msg = text;
  const files = state.pendingFiles.map(f => f.path);
  const matchedPaths = extractFilePathsFromText(text);
  for (const p of matchedPaths) {
    if (!files.includes(p)) files.push(p);
  }
  if (files.length > 0) {
    msg += ' --file ' + files.join(' --file ');
  }

  const prevCount = (state.conversations[repoPath] || []).length;

  if (state.parallelMode) {
    writeToSlot(slotIndex, msg + '\r');
  } else {
    writeToTerminal(repoPath, msg + '\r');
  }

  if (isNewChat) {
    pollForNewSession(repoPath, prevCount);
  } else {
    setTimeout(() => refreshSidebar(), 1500);
  }

  input.value = '';
  input.style.height = 'auto';
  state.pendingFiles = [];
  renderPendingFiles();
}

async function pollForNewSession(repoPath, prevCount, maxAttempts = 6, interval = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, interval));
    await refreshSidebar();
    const convs = state.conversations[repoPath] || [];
    if (convs.length > prevCount && convs[0] && !state.activeConvId[repoPath]) {
      state.activeConvId[repoPath] = convs[0].id;
      renderConvList();
      return;
    }
  }
}
