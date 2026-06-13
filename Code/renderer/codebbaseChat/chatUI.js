import { renderUserMessage, renderBotMessage, renderThinkingBubble, renderWelcome, renderConvGroup, getGroupLabel } from './chatRenderer.js';

const ICON_SEND = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v14"/><path d="m4 9 6-6 6 6"/></svg>';
const ICON_SIDEBAR = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><line x1="9" y1="3" x2="9" y2="17"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3v10"/><path d="M3 8h10"/></svg>';
const QUERY_CHIPS = [
  { key: 'dependencies', label: 'Find Dependencies' },
  { key: 'dependents', label: 'Find Dependents' },
  { key: 'symbols', label: 'Find Symbols' },
  { key: 'importChain', label: 'Trace Import Chain' },
  { key: 'circularDeps', label: 'Find Circular Deps' },
];

class ChatUI {
  constructor(state, queryEngine, ipc) {
    this.state = state;
    this.queryEngine = queryEngine;
    this.ipc = ipc;
    this._panel = null;
    this.container = null;
    this._pickerOpen = false;
    this._pickerFilter = '';
    this._deleteConfirmId = null;
  }

  async render(container) {
    this.container = container;
    this._panel = container.closest('.cc-panel');
    container.innerHTML = this._getTemplate();

    await this.state.loadConversations(this.ipc);
    if (this.state.conversations.length === 0) {
      await this.state.createConversation(this.ipc);
    } else if (!this.state.activeConversationId) {
      await this.state.selectConversation(this.ipc, this.state.conversations[0].id);
    }

    this._renderSidebar();
    this._bindEvents();
    this._renderAllMessages();
    this._updateLayout();
    this._updateIndexedState();
    this._scrollToBottom();
  }

  _getTemplate() {
    return `
      <div class="cc-layout">
        <div class="cc-sidebar" id="ccSidebar">
          <div class="cc-sidebar-header">
            <button class="cc-new-chat-btn" id="ccNewChatBtn">${ICON_PLUS} New Chat</button>
          </div>
          <div class="cc-sidebar-list" id="ccSidebarList"></div>
        </div>
        <div class="cc-main" id="ccMain">
          <button class="cc-sidebar-toggle" id="ccSidebarToggle" title="Toggle sidebar">${ICON_SIDEBAR}</button>
          <div class="cc-messages" id="ccMessages"></div>
          <div class="cc-input-area" id="ccInputArea">
            <div class="cc-not-indexed-banner" id="ccNotIndexedBanner" style="display:none">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="7" x2="10" y2="12"/><circle cx="10" cy="14" r="0.5" fill="currentColor"/></svg>
              <span>Symbol index required — run Symbol Index first to enable Codebase Chat</span>
            </div>
            <div class="cc-input-wrapper">
              <div class="cc-file-picker" id="ccFilePicker" style="display:none">
                <input type="text" class="cc-picker-filter" id="ccPickerFilter" placeholder="Filter files..." autocomplete="off">
                <div class="cc-picker-list" id="ccPickerList"></div>
              </div>
              <input type="text" class="cc-input" id="ccInput" placeholder='Type @ to mention a file...' autocomplete="off">
              <button class="cc-ask-btn" id="ccAskBtn" title="Ask">${ICON_SEND}</button>
            </div>
            <div class="cc-query-chips" id="ccQueryChips">
              ${QUERY_CHIPS.map(chip =>
                `<button class="cc-chip" data-query="${chip.key}">${chip.label}</button>`
              ).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderSidebar() {
    const list = this.container.querySelector('#ccSidebarList');
    if (!list) return;
    list.innerHTML = '';

    const groups = { 'Today': [], 'Yesterday': [], 'Previous 7 days': [], 'Older': [] };
    for (const conv of this.state.conversations) {
      const label = getGroupLabel(conv.updated_at || conv.created_at);
      if (groups[label]) groups[label].push(conv);
    }

    let hasAny = false;
    for (const [label, items] of Object.entries(groups)) {
      const frag = renderConvGroup(label, items, this.state.activeConversationId,
        (id) => this._selectConv(id), (id) => this._deleteConv(id), this._deleteConfirmId);
      if (frag) { list.appendChild(frag); hasAny = true; }
    }
    if (!hasAny) {
      const el = document.createElement('div');
      el.className = 'cc-conv-empty';
      el.textContent = 'No conversations yet';
      list.appendChild(el);
    }
  }

  _updateLayout() {
    const main = this.container.querySelector('.cc-main');
    const hasMsgs = this.state.conversationHistory.length > 0;
    if (!main) return;
    main.classList.toggle('cc-main--active', hasMsgs);
  }

  _updateIndexedState() {
    const inputArea = this.container.querySelector('#ccInputArea');
    const input = this.container.querySelector('#ccInput');
    const askBtn = this.container.querySelector('#ccAskBtn');
    const chips = this.container.querySelectorAll('.cc-chip');
    const banner = this.container.querySelector('#ccNotIndexedBanner');

    if (!inputArea) return;

    const disabled = !this.state.isIndexed;
    inputArea.classList.toggle('cc-disabled', disabled);
    input.disabled = disabled;
    input.placeholder = disabled ? 'Symbol index required' : 'Type @ to mention a file...';
    askBtn.disabled = disabled;
    for (const chip of chips) chip.disabled = disabled;
    banner.style.display = disabled ? '' : 'none';
  }

  _bindEvents() {
    const input = this.container.querySelector('#ccInput');
    const askBtn = this.container.querySelector('#ccAskBtn');
    const pickerFilter = this.container.querySelector('#ccPickerFilter');
    const pickerList = this.container.querySelector('#ccPickerList');
    const picker = this.container.querySelector('#ccFilePicker');
    const messages = this.container.querySelector('#ccMessages');
    const sidebarToggle = this.container.querySelector('#ccSidebarToggle');
    const newChatBtn = this.container.querySelector('#ccNewChatBtn');

    input.addEventListener('input', () => this._handleInput());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this._pickerOpen) {
          this._closePicker();
          e.preventDefault();
        } else {
          const closeBtn = this._panel?.querySelector('.cc-panel-close-btn');
          closeBtn?.click();
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this._pickerOpen) {
          this._selectActivePickerItem();
        } else {
          this._handleAsk();
        }
      }
      if (e.key === 'ArrowDown' && this._pickerOpen) {
        e.preventDefault();
        this._movePickerSelection(1);
      }
      if (e.key === 'ArrowUp' && this._pickerOpen) {
        e.preventDefault();
        this._movePickerSelection(-1);
      }
    });

    askBtn.addEventListener('click', () => this._handleAsk());
    pickerFilter.addEventListener('input', () => this._updatePickerList());
    sidebarToggle.addEventListener('click', () => this._toggleSidebar());
    newChatBtn.addEventListener('click', () => this._handleNewChat());

    this.container.querySelector('#ccQueryChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.cc-chip');
      if (!chip) return;
      this.container.querySelectorAll('.cc-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      this.state.selectedQuery = chip.dataset.query;
    });

    pickerList.addEventListener('click', (e) => {
      const item = e.target.closest('.cc-picker-item');
      if (item) this._selectFile(item.dataset.path);
    });

    messages.addEventListener('click', (e) => {
      const btn = e.target.closest('.cc-msg-action-btn');
      if (btn) btn.click();
    });
  }

  _toggleSidebar() {
    const layout = this.container.querySelector('.cc-layout');
    if (!layout) return;
    const closed = layout.classList.toggle('cc-sidebar-closed');
  }

  async _handleNewChat() {
    await this.state.createConversation(this.ipc);
    this._renderSidebar();
    this._renderAllMessages();
    this._updateLayout();
    this._scrollToBottom();
    this.container.querySelector('.cc-layout').classList.remove('cc-sidebar-closed');
  }

  async _selectConv(convId) {
    if (convId === this.state.activeConversationId) return;
    await this.state.selectConversation(this.ipc, convId);
    this._renderSidebar();
    this._renderAllMessages();
    this._updateLayout();
    this._scrollToBottom();
  }

  _deleteConfirmTimer = null;

  _deleteConv(convId) {
    if (this._deleteConfirmId === convId) {
      clearTimeout(this._deleteConfirmTimer);
      this._deleteConfirmId = null;
      this.state.deleteConversation(this.ipc, convId).then(() => {
        this._renderSidebar();
        this._renderAllMessages();
        this._updateLayout();
      });
      return;
    }
    this._deleteConfirmId = convId;
    this._renderSidebar();
    this._deleteConfirmTimer = setTimeout(() => {
      this._deleteConfirmId = null;
      this._renderSidebar();
    }, 2000);
  }

  _handleInput() {
    const input = this.container.querySelector('#ccInput');
    const val = input.value;
    const atIdx = val.lastIndexOf('@');

    if (atIdx >= 0) {
      this._pickerFilter = val.slice(atIdx + 1);
      this._openPicker();
    } else {
      this._closePicker();
    }
  }

  _openPicker() {
    const picker = this.container.querySelector('#ccFilePicker');
    if (!this.state.allFiles.length) return;
    picker.style.display = 'block';
    this._pickerOpen = true;
    const filter = this.container.querySelector('#ccPickerFilter');
    filter.value = this._pickerFilter;
    this._updatePickerList();
    filter.focus();
  }

  _closePicker() {
    const picker = this.container.querySelector('#ccFilePicker');
    picker.style.display = 'none';
    this._pickerOpen = false;
  }

  _updatePickerList() {
    const filter = this.container.querySelector('#ccPickerFilter');
    const list = this.container.querySelector('#ccPickerList');
    const q = (filter.value || '').toLowerCase();
    const matched = this.state.allFiles
      .filter(f => f.path.toLowerCase().includes(q))
      .slice(0, 30);

    list.innerHTML = matched.map((f, i) =>
      `<div class="cc-picker-item ${i === 0 ? 'cc-picker-item--active' : ''}" data-path="${f.path}">
        <span class="cc-picker-ext">${f.language || ''}</span>
        <span class="cc-picker-name">${f.path}</span>
      </div>`
    ).join('');
  }

  _movePickerSelection(dir) {
    const list = this.container.querySelector('#ccPickerList');
    const items = list.querySelectorAll('.cc-picker-item');
    const active = list.querySelector('.cc-picker-item--active');
    let idx = -1;
    if (active) { idx = Array.from(items).indexOf(active); items[idx].classList.remove('cc-picker-item--active'); }
    idx = Math.max(0, Math.min(items.length - 1, idx + dir));
    items[idx]?.classList.add('cc-picker-item--active');
    items[idx]?.scrollIntoView({ block: 'nearest' });
  }

  _selectActivePickerItem() {
    const active = this.container.querySelector('#ccPickerList .cc-picker-item--active');
    if (active) this._selectFile(active.dataset.path);
  }

  _selectFile(path) {
    this.state.selectedFile = path;
    const input = this.container.querySelector('#ccInput');
    const atIdx = input.value.lastIndexOf('@');
    input.value = input.value.slice(0, atIdx) + path;
    this._closePicker();
    input.focus();
  }

  async _handleAsk() {
    const input = this.container.querySelector('#ccInput');
    const filePath = this.state.selectedFile || input.value.trim();
    const queryType = this.state.selectedQuery;

    if (!filePath || !queryType) return;
    if (!this.state.activeRepoPath) return;
    if (!this.state.isIndexed) return;

    this.state.addMessage('user', '', queryType, filePath);
    this.state.addMessage('bot', '', queryType, filePath);
    this.state.isLoading = true;

    this._renderAllMessages();
    this._updateLayout();
    this._scrollToBottom();

    const answer = await this.queryEngine.executeQuery(queryType, this.state.activeRepoPath, filePath);
    const promptText = this.queryEngine.formatAsPrompt(filePath, queryType, answer);

    this.state.replaceLastBot(answer);
    this.state.conversationHistory[this.state.getLastBotIndex()]._promptText = promptText;
    this.state.isLoading = false;

    this._renderAllMessages();
    this._updateLayout();
    this._scrollToBottom();

    input.value = '';
    this.state.selectedFile = null;

    this._renderSidebar();

    await this.state.saveMessagePair(this.ipc, queryType, filePath, answer, promptText);
  }

  _renderAllMessages() {
    const messages = this.container.querySelector('#ccMessages');
    if (!messages) return;
    messages.innerHTML = '';

    if (this.state.conversationHistory.length === 0) {
      messages.appendChild(renderWelcome());
      return;
    }

    for (const msg of this.state.conversationHistory) {
      if (msg.role === 'user') {
        messages.appendChild(renderUserMessage(msg));
      } else {
        messages.appendChild(renderBotMessage(msg));
      }
    }

    if (this.state.isLoading) {
      messages.appendChild(renderThinkingBubble());
    }
  }

  _scrollToBottom() {
    const messages = this.container.querySelector('#ccMessages');
    if (!messages) return;
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
    });
  }

  async refresh() {
    await this.state.loadConversations(this.ipc);
    if (this.state.conversations.length === 0) {
      await this.state.createConversation(this.ipc);
    }
    this._renderSidebar();
    this._renderAllMessages();
    this._updateLayout();
    this._updateIndexedState();
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

export default ChatUI;
