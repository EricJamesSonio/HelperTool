import { state } from './state.js';
import { getConversation } from './history.js';
import {
  createTerminalSession,
  showTerminalSession,
  killTerminalSession,
  hasTerminalSession,
} from './terminalManager.js';

export function clearTerminal() {
  // No-op: terminal is managed by xterm
}

export async function loadConvMessages(convIdOrMessages) {
  let messages = convIdOrMessages;
  if (typeof convIdOrMessages === 'string') {
    const data = await getConversation(convIdOrMessages);
    messages = data?.messages || [];
  }
  return messages;
}

export async function openTerminalForRepo(repoPath) {
  console.log('[CS] openTerminalForRepo called, repoPath:', repoPath);
  const welcome = document.getElementById('ocWelcome');
  const terminal = document.getElementById('ocTerminal');
  console.log('[CS] welcome el:', !!welcome, 'terminal el:', !!terminal);

  if (welcome) welcome.style.display = 'none';
  if (terminal) terminal.style.display = '';

  const existing = hasTerminalSession(repoPath);
  console.log('[CS] existing session:', existing);
  if (existing) {
    showTerminalSession(repoPath);
    return;
  }

  console.log('[CS] calling createTerminalSession');
  await createTerminalSession(repoPath);
  console.log('[CS] createTerminalSession done');
}

export function showWelcome() {
  const welcome = document.getElementById('ocWelcome');
  const terminal = document.getElementById('ocTerminal');
  if (welcome) welcome.style.display = '';
  if (terminal) terminal.style.display = 'none';
}

export function closeTerminalSession(repoPath) {
  killTerminalSession(repoPath);
}

export class ChatPanel {
  constructor() {
    this._messagesEl = null;
    this._streamingContentEl = null;
    this._streamingRawText = '';
    this.currentSessionId = null;
    this._init();
  }

  _init() {
    const main = document.getElementById('ocMain');
    if (!main) return;

    const container = document.createElement('div');
    container.className = 'oc-chat-container';
    container.id = 'ocChatContainer';
    container.style.display = 'none';

    const empty = document.createElement('div');
    empty.className = 'oc-chat-empty-state';
    empty.id = 'ocChatEmptyState';
    empty.innerHTML = '<p>Select a chat or start a new one</p>';
    container.appendChild(empty);

    const messages = document.createElement('div');
    messages.className = 'oc-chat-messages';
    messages.id = 'ocChatMessages';
    container.appendChild(messages);
    this._messagesEl = messages;

    const inputArea = document.getElementById('ocInputArea');
    if (inputArea) {
      main.insertBefore(container, inputArea);
    } else {
      main.appendChild(container);
    }
  }

  showEmptyState() {
    const container = document.getElementById('ocChatContainer');
    const chatMessages = document.getElementById('ocChatMessages');
    const empty = document.getElementById('ocChatEmptyState');
    if (container) container.style.display = 'flex';
    if (chatMessages) chatMessages.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    this.currentSessionId = null;
  }

  async loadSession(sessionId) {
    window.chatAPI.removeStreamListeners();

    this.currentSessionId = sessionId;
    this._streamingContentEl = null;
    this._streamingRawText = '';

    const empty = document.getElementById('ocChatEmptyState');
    if (empty) empty.style.display = 'none';
    const chatMessages = document.getElementById('ocChatMessages');
    if (chatMessages) chatMessages.style.display = 'flex';
    this._messagesEl.innerHTML = '';

    const welcome = document.getElementById('ocWelcome');
    const terminal = document.getElementById('ocTerminal');
    if (welcome) welcome.style.display = 'none';
    if (terminal) terminal.style.display = 'none';
    this._show();

    let msgs;
    try {
      msgs = await window.chatAPI.getMessages(sessionId);
    } catch (err) {
      console.error('[ChatPanel] getMessages error:', err);
      return;
    }

    for (const msg of msgs) {
      this._renderMessage(msg);
    }
    this._scrollToBottom();
  }

  _renderMessage(msg) {
    const el = document.createElement('div');
    el.className = 'oc-chat-msg oc-chat-msg-' + (msg.role === 'user' ? 'user' : 'assistant');

    const bubble = document.createElement('div');
    bubble.className = 'oc-chat-bubble';

    if (msg.role === 'user') {
      bubble.textContent = msg.content;
    } else {
      bubble.innerHTML = this._renderMarkdown(msg.content);
    }

    el.appendChild(bubble);

    if (msg.attachments && msg.attachments.length > 0) {
      const attachRow = document.createElement('div');
      attachRow.className = 'oc-chat-attachments';
      for (const att of msg.attachments) {
        if (att.base64 && att.type && att.type.startsWith('image/')) {
          const img = document.createElement('img');
          img.className = 'oc-chat-attach-thumb';
          img.src = `data:${att.type};base64,${att.base64}`;
          img.alt = att.name || 'attachment';
          attachRow.appendChild(img);
        } else {
          const chip = document.createElement('span');
          chip.className = 'oc-file-chip';
          chip.textContent = '\uD83D\uDCCE ' + (att.name || 'file');
          attachRow.appendChild(chip);
        }
      }
      el.appendChild(attachRow);
    }

    this._messagesEl.appendChild(el);
  }

  appendStreamChunk(chunk) {
    if (!this._streamingContentEl) {
      const el = document.createElement('div');
      el.className = 'oc-chat-msg oc-chat-msg-assistant oc-chat-msg-streaming';
      const bubble = document.createElement('div');
      bubble.className = 'oc-chat-bubble';
      el.appendChild(bubble);
      this._messagesEl.appendChild(el);
      this._streamingContentEl = bubble;
      this._streamingRawText = '';
    }

    this._streamingRawText += chunk;
    this._streamingContentEl.innerHTML = this._renderMarkdown(this._streamingRawText);

    const cursor = document.createElement('span');
    cursor.className = 'oc-chat-stream-cursor';
    cursor.textContent = '\u258C';
    this._streamingContentEl.appendChild(cursor);

    this._scrollToBottom();
  }

  finalizeStream() {
    if (this._streamingContentEl) {
      const parent = this._streamingContentEl.closest('.oc-chat-msg');
      if (parent) parent.classList.remove('oc-chat-msg-streaming');
      const cursor = this._streamingContentEl.querySelector('.oc-chat-stream-cursor');
      if (cursor) cursor.remove();
      this._streamingContentEl = null;
      this._streamingRawText = '';
    }
  }

  _renderMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = code
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<pre><code>' + escaped + '</code></pre>';
    });

    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  _scrollToBottom() {
    requestAnimationFrame(() => {
      this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
    });
  }

  _show() {
    const container = document.getElementById('ocChatContainer');
    if (container) container.style.display = 'flex';
  }

  hide() {
    const container = document.getElementById('ocChatContainer');
    if (container) container.style.display = 'none';
  }
}
