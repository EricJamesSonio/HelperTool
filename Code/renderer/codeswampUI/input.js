import { state } from './state.js';
import { writeToSlot, hasTerminalSession, waitForTerminalOpencode, isShellPrompt, restartOpencode, acceptPasteWarning } from './terminalManager.js';
import { openTerminalForRepo } from './chat.js';
import { refreshSidebar } from './sidebar.js';
import { openPromptPicker } from './promptPicker.js';
import { openTicketPanel } from './ticketPanel.js';
import { openStonePanel } from './stonePanel.js';
import { openPlanningPanel } from './planningPanel.js';
import { openBuildKitPanel } from './buildKitPanel.js';
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

  promptBtn.addEventListener('click', openPromptPicker);
  ticketBtn.addEventListener('click', openTicketPanel);
  stoneBtn.addEventListener('click', openStonePanel);
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

    const slotIndex = state.activeSlotIndex;

    // Reset stale streaming flag — it gets stuck if a previous run crashed
    if (state.streaming) {
      console.warn('[CS] sendMessage: stale streaming=true, forcing reset');
      state.streaming = false;
    }

    state.lastSentMessage = text;

    // Disable send button while sending
    const sendBtn = document.getElementById('ocSendBtn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    }

    if (!hasTerminalSession(repoPath)) {
      await openTerminalForRepo(repoPath, slotIndex);
    }

    // If shell prompt is visible (opencode exited), restart it first
    if (isShellPrompt(repoPath, slotIndex)) {
      await restartOpencode(repoPath, slotIndex);
    }

    // Wait until opencode confirms it's reading stdin
    await waitForTerminalOpencode(repoPath, slotIndex);

    // Wrap in bracketed paste escape sequences so opencode recognizes
    // this as a paste (same as if the user pasted directly into xterm.js)
    const pasted = `\x1b[200~${text}\x1b[201~`;
    await writeToSlot(slotIndex, pasted);

    // Auto-accept opencode's paste warning dialog (Warning... Continue? y/N)
    await acceptPasteWarning(repoPath, slotIndex);

    // Wait for opencode to finalize the pasted input before submitting
    await new Promise(r => setTimeout(r, 800));

    // Submit
    await writeToSlot(slotIndex, '\r');

    input.value = '';
    input.style.height = 'auto';
    state.pendingFiles = [];
    renderPendingFiles();

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


