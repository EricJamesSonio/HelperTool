const ICON_USER = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,14 10,10 14,14"/><line x1="10" y1="4" x2="10" y2="12"/></svg>';
const ICON_BOT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h12"/><path d="M4 10h12"/><path d="M4 6h8"/></svg>';
const ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"/><circle cx="12" cy="10" r="1.5"/><circle cx="8" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="10" height="11" rx="1.5"/><path d="M7 6V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-2"/></svg>';
const ICON_PROMPT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 9l2 2-2 2"/><path d="M12 11h2"/></svg>';
const ICON_COPIED = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10 4 4 8-8"/></svg>';

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function formatMarkdown(text) {
  const lines = text.split('\n');
  let html = '';
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      html += inCodeBlock ? '</code></pre>' : '<pre><code>';
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      html += escapeHtml(line) + '\n';
      continue;
    }
    if (line.startsWith('### ')) {
      html += '<h4 class="cc-md-h4">' + escapeHtml(line.slice(4)) + '</h4>';
    } else if (line.startsWith('## ')) {
      html += '<h3 class="cc-md-h3">' + escapeHtml(line.slice(3)) + '</h3>';
    } else if (line.startsWith('**') && line.endsWith('**')) {
      html += '<p class="cc-md-bold">' + escapeHtml(line.slice(2, -2)) + '</p>';
    } else if (line.startsWith('• ') || line.startsWith('- ')) {
      html += '<div class="cc-md-item"><span class="cc-md-bullet">•</span> ' + escapeHtml(line.slice(2)) + '</div>';
    } else if (line.trim() === '') {
      html += '<div class="cc-md-spacer"></div>';
    } else if (line.startsWith('✅') || line.startsWith('⚠️')) {
      html += '<p class="cc-md-status">' + escapeHtml(line) + '</p>';
    } else {
      html += '<p class="cc-md-line">' + escapeHtml(line) + '</p>';
    }
  }
  return html;
}

function renderMessage(msg) {
  const div = document.createElement('div');
  div.className = 'cc-msg cc-msg--' + msg.role;

  const avatar = document.createElement('div');
  avatar.className = 'cc-msg-avatar';
  avatar.innerHTML = msg.role === 'user' ? ICON_USER : ICON_BOT;
  div.appendChild(avatar);

  const content = document.createElement('div');
  content.className = 'cc-msg-content';

  if (msg.role === 'user') {
    const fileTag = document.createElement('div');
    fileTag.className = 'cc-msg-file-tag';
    fileTag.textContent = msg.file || '';
    content.appendChild(fileTag);

    const queryTag = document.createElement('span');
    queryTag.className = 'cc-msg-query-tag';
    queryTag.textContent = msg.queryType || '';
    content.appendChild(queryTag);
  }

  const body = document.createElement('div');
  body.className = 'cc-msg-body';
  body.innerHTML = msg.isLoading
    ? '<span class="cc-thinking"><span class="cc-dot-pulse"></span> Thinking...</span>'
    : formatMarkdown(msg.content || '');
  content.appendChild(body);

  if (msg.role === 'bot' && !msg.isLoading && msg.content) {
    const actions = document.createElement('div');
    actions.className = 'cc-msg-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'cc-action-btn';
    copyBtn.innerHTML = ICON_COPY + ' Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(msg.content);
      copyBtn.innerHTML = ICON_COPIED + ' Copied!';
      setTimeout(() => { copyBtn.innerHTML = ICON_COPY + ' Copy'; }, 2000);
    });
    actions.appendChild(copyBtn);

    const promptBtn = document.createElement('button');
    promptBtn.className = 'cc-action-btn';
    promptBtn.innerHTML = ICON_PROMPT + ' Copy as Prompt';
    promptBtn.addEventListener('click', () => {
      const promptText = msg._promptText || msg.content;
      navigator.clipboard.writeText(promptText);
      promptBtn.innerHTML = ICON_COPIED + ' Copied!';
      setTimeout(() => { promptBtn.innerHTML = ICON_PROMPT + ' Copy as Prompt'; }, 2000);
    });
    actions.appendChild(promptBtn);

    content.appendChild(actions);
  }

  div.appendChild(content);
  return div;
}

function renderWelcome() {
  const div = document.createElement('div');
  div.className = 'cc-welcome';
  div.innerHTML = `
    <div class="cc-welcome-icon">${ICON_CHAT}</div>
    <h2 class="cc-welcome-title">Codebase Chat</h2>
    <p class="cc-welcome-text">
      Ask questions about your indexed codebase.
      Type <strong>@</strong> to mention a file, then choose a query type.
    </p>
  `;
  return div;
}

export { renderMessage, renderWelcome };
