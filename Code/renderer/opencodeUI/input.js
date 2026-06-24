import { state } from './state.js';
import { appendUserMessage, appendStreamChunk, finalizeStream, scrollToBottom } from './chat.js';
import { refreshSidebar } from './sidebar.js';

let _lastUserText = '';
let _lastResponse = '';

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
      <button class="oc-btn oc-btn-stop" id="ocStopBtn" style="display:none">Stop</button>
    </div>
  `;

  const input = document.getElementById('ocInput');
  const sendBtn = document.getElementById('ocSendBtn');
  const stopBtn = document.getElementById('ocStopBtn');
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
  stopBtn.addEventListener('click', stopStream);

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

  if (!state.messages[repoPath]) state.messages[repoPath] = [];
  state.messages[repoPath].push({
    role: 'user',
    content: text,
    timestamp: new Date().toISOString(),
  });

  _lastUserText = text;
  _lastResponse = '';

  appendUserMessage(text);

  input.value = '';
  input.style.height = 'auto';

  const continueConv = !!state.activeConvId[repoPath] && state.activeConvId[repoPath] !== 'new';

  state.streaming = true;
  state.streamBuffer = '';
  state.activeConvIdForStream = state.activeConvId[repoPath];
  state.activeTabForStream = repoPath;

  document.getElementById('ocSendBtn').style.display = 'none';
  document.getElementById('ocStopBtn').style.display = '';

  const files = state.pendingFiles.map(f => f.path);
  state.pendingFiles = [];
  renderPendingFiles();

  try {
    await window.electronAPI.opencode.run(repoPath, text, files, continueConv);
  } catch (err) {
    appendStreamChunk(`\nError: ${err.message}`);
    _lastResponse = err.message;
    finalizeStream(state.streamBuffer);
  }
}

function stopStream() {
  window.electronAPI.opencode.stop();
  document.getElementById('ocStopBtn').style.display = 'none';
  document.getElementById('ocSendBtn').style.display = '';
  _lastResponse = state.streamBuffer;
  if (state.streamBuffer) {
    finalizeStream(state.streamBuffer);
  }
  state.streaming = false;
}

export function setupStreamListeners() {
  window.electronAPI.opencode.onStream(({ chunk, isError }) => {
    appendStreamChunk(chunk);
  });

  window.electronAPI.opencode.onDone(async ({ code }) => {
    document.getElementById('ocStopBtn').style.display = 'none';
    document.getElementById('ocSendBtn').style.display = '';

    const fullResponse = state.streamBuffer;
    _lastResponse = fullResponse;
    finalizeStream(fullResponse);

    const repoPath = state.activeTabForStream || state.activeTab;
    if (repoPath && fullResponse) {
      if (!state.messages[repoPath]) state.messages[repoPath] = [];
      state.messages[repoPath].push({
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString(),
      });

      if (state.activeConvId[repoPath] === 'new' || !state.activeConvId[repoPath]) {
        const convId = 'local_' + Date.now();
        const title = _lastUserText.slice(0, 60) || 'Chat';
        state.activeConvId[repoPath] = convId;
        if (!state.conversations[repoPath]) state.conversations[repoPath] = [];
        state.conversations[repoPath].unshift({
          id: convId,
          title,
          date: new Date().toISOString(),
          messageCount: state.messages[repoPath].length,
          repoPath,
        });
      }
    }

    if (repoPath) {
      await refreshSidebar();
    }

    state.streaming = false;
    state.streamBuffer = '';
    state.activeConvIdForStream = null;
    state.activeTabForStream = null;
  });
}
