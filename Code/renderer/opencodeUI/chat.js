import { state } from './state.js';
import { getConversation } from './history.js';
import { extractSegments, escapeHtml, formatTime } from './utils.js';

export function showWelcome() {
  const welcome = document.getElementById('ocWelcome');
  const chat = document.getElementById('ocChat');
  if (welcome) welcome.style.display = '';
  if (chat) chat.style.display = 'none';
}

export function clearChat() {
  const container = document.getElementById('ocMessages');
  if (container) container.innerHTML = '';
}

export async function loadConvMessages(convId) {
  const data = await getConversation(convId);
  if (!data || !data.messages) return [];
  return data.messages;
}

export function renderMessages(messages) {
  const container = document.getElementById('ocMessages');
  const welcome = document.getElementById('ocWelcome');
  const chat = document.getElementById('ocChat');
  if (!container) return;

  if (welcome) welcome.style.display = 'none';
  if (chat) chat.style.display = '';

  container.innerHTML = '';

  for (const msg of messages) {
    const bubble = createMessageBubble(msg);
    container.appendChild(bubble);
  }

  scrollToBottom();
}

export function appendMessage(msg) {
  const container = document.getElementById('ocMessages');
  if (!container) return;
  const bubble = createMessageBubble(msg);
  container.appendChild(bubble);
  scrollToBottom();
}

export function appendStreamChunk(content, isComplete = false) {
  const container = document.getElementById('ocMessages');
  if (!container) return;

  let lastBubble = container.lastElementChild;
  if (!lastBubble || !lastBubble.classList.contains('oc-bubble-ai')) {
    lastBubble = createMessageBubble({ role: 'assistant', content: '', timestamp: new Date().toISOString() });
    lastBubble.classList.add('oc-bubble-streaming');
    container.appendChild(lastBubble);
  }

  const contentEl = lastBubble.querySelector('.oc-bubble-content');
  if (contentEl) {
    if (isComplete) {
      contentEl.innerHTML = renderContent(content);
      lastBubble.classList.remove('oc-bubble-streaming');
    } else {
      state.streamBuffer += content;
      contentEl.innerHTML = renderContent(state.streamBuffer) + '<span class="oc-cursor">▋</span>';
    }
  }

  scrollToBottom();
}

export function finalizeStream(fullContent) {
  const container = document.getElementById('ocMessages');
  if (!container) return;

  const lastBubble = container.lastElementChild;
  if (lastBubble && lastBubble.classList.contains('oc-bubble-streaming')) {
    const contentEl = lastBubble.querySelector('.oc-bubble-content');
    if (contentEl) {
      contentEl.innerHTML = renderContent(fullContent);
    }
    lastBubble.classList.remove('oc-bubble-streaming');
    lastBubble.classList.add('oc-bubble-ai');
  }

  state.streamBuffer = '';
  state.streaming = false;
  scrollToBottom();
}

function createMessageBubble(msg) {
  const div = document.createElement('div');
  const isUser = msg.role === 'user' || msg.role === 'human';
  div.className = `oc-bubble ${isUser ? 'oc-bubble-user' : 'oc-bubble-ai'}`;

  const header = document.createElement('div');
  header.className = 'oc-bubble-header';
  header.innerHTML = `
    <span class="oc-bubble-author">${isUser ? 'You' : 'Code Swamp'}</span>
    <span class="oc-bubble-time">${msg.timestamp ? formatTime(msg.timestamp) : ''}</span>
  `;
  div.appendChild(header);

  const content = document.createElement('div');
  content.className = 'oc-bubble-content';
  content.innerHTML = renderContent(msg.content);
  div.appendChild(content);

  if (msg.files && msg.files.length) {
    const files = document.createElement('div');
    files.className = 'oc-bubble-files';
    for (const f of msg.files) {
      const chip = document.createElement('span');
      chip.className = 'oc-file-chip';
      chip.textContent = f.name || f;
      files.appendChild(chip);
    }
    div.appendChild(files);
  }

  return div;
}

function renderContent(text) {
  if (!text) return '';
  const segments = extractSegments(text);
  return segments.map(seg => {
    if (seg.type === 'code') {
      const lang = seg.lang ? escapeHtml(seg.lang) : '';
      return `<div class="oc-code-block">
        ${lang ? `<div class="oc-code-lang">${lang}</div>` : ''}
        <button class="oc-code-copy" onclick="
          (async()=>{try{await navigator.clipboard.writeText(this.parentNode.querySelector('code').textContent);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)}catch(e){}})()
        ">Copy</button>
        <pre><code class="oc-code">${escapeHtml(seg.content)}</code></pre>
      </div>`;
    }
    if (seg.type === 'edit') {
      return `<div class="oc-edit-notification">${escapeHtml(seg.content)}</div>`;
    }
    return `<p class="oc-text">${escapeHtml(seg.content)}</p>`;
  }).join('');
}

export function scrollToBottom() {
  requestAnimationFrame(() => {
    const container = document.getElementById('ocMessages');
    if (container) container.scrollTop = container.scrollHeight;
  });
}

export function updateChatHeader(convTitle) {
  const header = document.getElementById('ocChatHeader');
  if (!header) return;
  header.innerHTML = `<span class="oc-chat-title">${escapeHtml(convTitle || 'Chat')}</span>`;
}
