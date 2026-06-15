const ICON_COPY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="10" height="11" rx="1.5"/><path d="M7 6V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-2"/></svg>';
const ICON_PROMPT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 9l2 2-2 2"/><path d="M12 11h2"/></svg>';
const ICON_COPIED = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10 4 4 8-8"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M6 7v5"/><path d="M10 7v5"/></svg>';
const ICON_RENAME = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-9 9H2v-3z"/></svg>';

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function renderInline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code class="cc-md-inline-code">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s;
}

function formatContent(text) {
  const lines = text.split('\n');
  let html = '';
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      html += inCode ? '</code></pre>' : '<pre><code>';
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html += escapeHtml(line) + '\n';
      continue;
    }
    if (line.startsWith('### ')) {
      html += '<div class="cc-md-h3">' + renderInline(line.slice(4)) + '</div>';
    } else if (line.startsWith('## ')) {
      html += '<div class="cc-md-h2">' + renderInline(line.slice(3)) + '</div>';
    } else if (line.startsWith('**') && line.endsWith('**')) {
      html += '<div class="cc-md-bold">' + escapeHtml(line.slice(2, -2)) + '</div>';
    } else if (line.startsWith('• ') || line.startsWith('- ')) {
      html += '<div class="cc-md-item"><span class="cc-md-bullet">•</span> ' + renderInline(line.slice(2)) + '</div>';
    } else if (line.trim() === '') {
      html += '<div class="cc-md-spacer"></div>';
    } else {
      html += '<div class="cc-md-line">' + renderInline(line) + '</div>';
    }
  }
  return html;
}

function renderUserMessage(msg) {
  const div = document.createElement('div');
  div.className = 'cc-msg cc-msg--user';

  const bubble = document.createElement('div');
  bubble.className = 'cc-msg-bubble';
  let label;
  if (msg.content && msg.content.trim()) {
    label = msg.content.trim();
  } else {
    label = (msg.file ? '@' + msg.file.split(/[/\\]/).pop() : '') + (msg.queryType ? ' → ' + msg.queryType : '');
  }
  bubble.textContent = label || 'Ask';
  div.appendChild(bubble);

  return div;
}

function renderBotMessage(msg) {
  const div = document.createElement('div');
  div.className = 'cc-msg cc-msg--bot';

  const bubble = document.createElement('div');
  bubble.className = 'cc-msg-bubble';

  const header = document.createElement('div');
  header.className = 'cc-msg-header';
  header.textContent = 'HelperChat';
  bubble.appendChild(header);

  const content = document.createElement('div');
  content.className = 'cc-msg-content';
  content.innerHTML = formatContent(msg.content || '');
  bubble.appendChild(content);

  if (msg.content) {
    const actions = document.createElement('div');
    actions.className = 'cc-msg-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'cc-msg-action-btn';
    copyBtn.innerHTML = ICON_COPY + ' Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(msg.content);
      copyBtn.innerHTML = ICON_COPIED + ' Copied!';
      setTimeout(() => { copyBtn.innerHTML = ICON_COPY + ' Copy'; }, 2000);
    });
    actions.appendChild(copyBtn);

    const promptBtn = document.createElement('button');
    promptBtn.className = 'cc-msg-action-btn';
    promptBtn.innerHTML = ICON_PROMPT + ' Prompt';
    promptBtn.addEventListener('click', () => {
      const text = msg._promptText || msg.content;
      navigator.clipboard.writeText(text);
      promptBtn.innerHTML = ICON_COPIED + ' Copied!';
      setTimeout(() => { promptBtn.innerHTML = ICON_PROMPT + ' Prompt'; }, 2000);
    });
    actions.appendChild(promptBtn);

    bubble.appendChild(actions);
  }

  div.appendChild(bubble);
  return div;
}

function renderThinkingBubble() {
  const div = document.createElement('div');
  div.className = 'cc-msg cc-msg--bot cc-msg--thinking';
  div.innerHTML = '<div class="cc-msg-bubble"><div class="cc-thinking-dots"><span></span><span></span><span></span></div></div>';
  return div;
}

function renderWelcome() {
  const div = document.createElement('div');
  div.className = 'cc-empty-state';
  div.innerHTML = `
    <div class="cc-welcome-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"/><circle cx="12" cy="10" r="1.5"/><circle cx="8" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>
    </div>
    <div class="cc-welcome-title">HelperChat</div>
    <div class="cc-welcome-sub">Ask about your indexed codebase. Type <strong>@</strong> to mention a file, then choose a query.<br><span class="cc-welcome-shortcut">Press <kbd>Ctrl+K</kbd> then assign a shortcut in <strong>CLI Tool</strong></span></div>
  `;
  return div;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd';
  return Math.floor(days / 7) + 'w';
}

function getGroupLabel(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  if (d > weekAgo) return 'Previous 7 days';
  return 'Older';
}

function renderConvItem(conv, isActive, onSelect, onDelete, onRename, confirmDeleteId) {
  const div = document.createElement('div');
  div.className = 'cc-conv-item' + (isActive ? ' cc-conv-item--active' : '');
  div.dataset.id = conv.id;

  const title = document.createElement('span');
  title.className = 'cc-conv-item-title';
  title.textContent = conv.title || 'New Chat';
  div.appendChild(title);

  const time = document.createElement('span');
  time.className = 'cc-conv-item-time';
  time.textContent = timeAgo(conv.updated_at || conv.created_at);
  div.appendChild(time);

  const rename = document.createElement('button');
  rename.className = 'cc-conv-item-rename';
  rename.innerHTML = ICON_RENAME;
  rename.title = 'Rename';
  rename.addEventListener('click', (e) => { e.stopPropagation(); onRename?.(conv.id, conv.title); });
  div.appendChild(rename);

  if (confirmDeleteId === conv.id) {
    const sure = document.createElement('button');
    sure.className = 'cc-conv-item-del cc-conv-item-del--sure';
    sure.textContent = 'Sure?';
    sure.addEventListener('click', (e) => { e.stopPropagation(); onDelete(conv.id); });
    div.appendChild(sure);
  } else {
    const del = document.createElement('button');
    del.className = 'cc-conv-item-del';
    del.innerHTML = ICON_TRASH;
    del.addEventListener('click', (e) => { e.stopPropagation(); onDelete(conv.id); });
    div.appendChild(del);
  }

  div.addEventListener('click', () => onSelect(conv.id));
  return div;
}

function renderConvGroup(label, items, activeId, onSelect, onDelete, onRename, confirmDeleteId) {
  if (!items.length) return null;
  const group = document.createElement('div');
  group.className = 'cc-conv-group';

  const header = document.createElement('div');
  header.className = 'cc-conv-group-label';
  header.textContent = label;
  group.appendChild(header);

  for (const item of items) {
    group.appendChild(renderConvItem(item, item.id === activeId, onSelect, onDelete, onRename, confirmDeleteId));
  }
  return group;
}

export {
  renderUserMessage,
  renderBotMessage,
  renderThinkingBubble,
  renderWelcome,
  renderConvGroup,
  getGroupLabel,
};
