import { state } from './state.js';
import { writeToTerminal, hasTerminalSession } from './terminalManager.js';
import { openTerminalForRepo } from './chat.js';

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
      <button class="oc-btn oc-btn-send" id="ocSendBtn">Send</button>
    </div>
  `;

  const input = document.getElementById('ocInput');
  const sendBtn = document.getElementById('ocSendBtn');
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

async function sendMessage() {
  const input = document.getElementById('ocInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const repoPath = state.activeTab;
  if (!repoPath) return;

  // Auto-create terminal if one doesn't exist yet
  if (!hasTerminalSession(repoPath)) {
    await openTerminalForRepo(repoPath);
    // Short delay to let terminal initialize before sending first message
    await new Promise(r => setTimeout(r, 300));
  }

  // Build the message with file attachments
  let msg = text;
  const files = state.pendingFiles.map(f => f.path);
  if (files.length > 0) {
    msg += ' --file ' + files.join(' --file ');
  }

  writeToTerminal(repoPath, msg + '\n');

  input.value = '';
  input.style.height = 'auto';
  state.pendingFiles = [];
  renderPendingFiles();
}
