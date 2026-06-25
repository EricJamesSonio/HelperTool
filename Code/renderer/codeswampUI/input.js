import { state } from './state.js';
import { writeToTerminal, hasTerminalSession } from './terminalManager.js';
import { openTerminalForRepo } from './chat.js';
import { refreshSidebar } from './sidebar.js';

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

  if (!hasTerminalSession(repoPath)) {
    await openTerminalForRepo(repoPath);
    await new Promise(r => setTimeout(r, 300));
  }

  let msg = text;
  const files = state.pendingFiles.map(f => f.path);
  if (files.length > 0) {
    msg += ' --file ' + files.join(' --file ');
  }

  writeToTerminal(repoPath, msg + '\n');

  setTimeout(() => refreshSidebar(), 1500);

  input.value = '';
  input.style.height = 'auto';
  state.pendingFiles = [];
  renderPendingFiles();
}

export class ChatInput {
  constructor(chatPanel) {
    this._chatPanel = chatPanel;
    this._pendingAttachments = [];
    this._init();
  }

  _init() {
    const area = document.getElementById('ocInputArea');
    if (!area) return;

    area.innerHTML = `
      <div class="oc-chat-pending-attachments" id="ocChatPendingAttachments"></div>
      <div class="oc-chat-input-row">
        <button class="oc-btn oc-btn-attach" id="ocChatAttachBtn" title="Attach file">📎</button>
        <textarea class="oc-chat-textarea" id="ocChatTextarea" placeholder="Ask anything..." rows="1"></textarea>
        <button class="oc-btn oc-btn-send" id="ocChatSendBtn">Send</button>
      </div>
    `;

    const textarea = document.getElementById('ocChatTextarea');
    const sendBtn = document.getElementById('ocChatSendBtn');
    const attachBtn = document.getElementById('ocChatAttachBtn');

    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      const max = parseFloat(getComputedStyle(textarea).lineHeight) * 5;
      textarea.style.height = Math.min(textarea.scrollHeight, max) + 'px';
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._onSend();
      }
    });

    sendBtn.addEventListener('click', () => this._onSend());
    attachBtn.addEventListener('click', () => this._onAttach());
  }

  async _onAttach() {
    let filePaths;
    try {
      filePaths = await window.chatAPI.pickFiles();
    } catch (err) {
      console.error('[ChatInput] pickFiles error:', err);
      return;
    }
    if (!filePaths || filePaths.length === 0) return;

    for (const fp of filePaths) {
      try {
        const result = await window.chatAPI.readFileBase64(fp);
        if (!result || !result.success) continue;
        const name = fp.replace(/^.*[/\\]/, '');
        this._pendingAttachments.push({
          name,
          path: fp,
          base64: result.base64,
          type: result.mime,
        });
      } catch (err) {
        console.error('[ChatInput] readFileBase64 error:', err);
      }
    }

    this._renderAttachments();
  }

  _renderAttachments() {
    const container = document.getElementById('ocChatPendingAttachments');
    if (!container) return;
    container.innerHTML = '';

    for (const att of this._pendingAttachments) {
      const el = document.createElement('div');
      el.className = 'oc-chat-attach-preview';

      if (att.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.className = 'oc-chat-attach-thumb';
        img.src = 'data:' + att.type + ';base64,' + att.base64;
        img.alt = att.name;
        el.appendChild(img);
      } else {
        const chip = document.createElement('span');
        chip.className = 'oc-file-chip';
        chip.textContent = '\uD83D\uDCCE ' + att.name;
        el.appendChild(chip);
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'oc-chat-attach-remove';
      removeBtn.textContent = '\u00D7';
      removeBtn.addEventListener('click', () => {
        this._pendingAttachments = this._pendingAttachments.filter(a => a.path !== att.path);
        this._renderAttachments();
      });
      el.appendChild(removeBtn);

      container.appendChild(el);
    }
  }

  _onSend() {
    const textarea = document.getElementById('ocChatTextarea');
    const content = textarea.value.trim();
    if (!content) return;

    const sessionId = this._chatPanel.currentSessionId;
    if (!sessionId) return;

    const repoPath = state.activeTab;
    if (!repoPath) return;

    const attachments = this._pendingAttachments.slice();

    this._chatPanel._renderMessage({
      role: 'user',
      content,
      attachments: attachments.map(a => ({
        name: a.name,
        base64: a.type.startsWith('image/') ? a.base64 : null,
        type: a.type,
        path: a.path,
      })),
    });

    textarea.value = '';
    textarea.style.height = 'auto';
    this._pendingAttachments = [];
    this._renderAttachments();

    const sessionIdForListener = sessionId;
    const onChunk = (data) => {
      if (data.sessionId === sessionIdForListener) {
        if (data.isError) {
          this._chatPanel.appendStreamChunk('[Error] ' + data.chunk);
        } else {
          this._chatPanel.appendStreamChunk(data.chunk);
        }
      }
    };

    const onDone = (data) => {
      if (data.sessionId === sessionIdForListener) {
        this._chatPanel.finalizeStream();
        window.chatAPI.removeStreamListeners();
      }
    };

    window.chatAPI.onStreamChunk(onChunk);
    window.chatAPI.onStreamDone(onDone);

    window.chatAPI.sendMessage(sessionId, content, attachments, repoPath).catch((err) => {
      console.error('[ChatInput] sendMessage error:', err);
      this._chatPanel.finalizeStream();
      window.chatAPI.removeStreamListeners();
    });
  }
}
