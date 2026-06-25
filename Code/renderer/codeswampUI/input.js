import { state } from './state.js';
import { writeToTerminal, hasTerminalSession } from './terminalManager.js';
import { openTerminalForRepo } from './chat.js';
import { refreshSidebar } from './sidebar.js';
import { renderConvList } from './repoTabs.js';
import { getLoadingController } from './loading.js';

export function renderInput() {
  const area = document.getElementById('ocInputArea');
  if (!area) return;

  area.innerHTML = `
    <div class="oc-pending-files" id="ocPendingFiles"></div>
    <div class="oc-input-row">
      <textarea class="oc-input" id="ocInput" placeholder="Type a message..." rows="1"></textarea>
      <button class="oc-btn oc-btn-attach" id="ocAttachBtn" title="Attach file">📎</button>
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

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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
  if (!repoPath || !hasTerminalSession(repoPath)) return;
  writeToTerminal(repoPath, '\t');
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

  const isNewChat = !hasTerminalSession(repoPath);

  if (!hasTerminalSession(repoPath)) {
    const lc = getLoadingController();
    lc.start('Starting terminal...');
    try {
      await openTerminalForRepo(repoPath);
    } catch (e) {
      lc.hide();
      return;
    }
  }

  let msg = text;
  const files = state.pendingFiles.map(f => f.path);
  if (files.length > 0) {
    msg += ' --file ' + files.join(' --file ');
  }

  const prevCount = (state.conversations[repoPath] || []).length;

  writeToTerminal(repoPath, msg + '\r');

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
