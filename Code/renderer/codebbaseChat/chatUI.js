import { renderMessage, renderWelcome } from './chatRenderer.js';

const ICON_SEND = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v14"/><path d="m4 9 6-6 6 6"/></svg>';

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
    this.container = null;
    this._pickerOpen = false;
    this._pickerFilter = '';
  }

  render(container) {
    this.container = container;
    container.innerHTML = this._getTemplate();
    this._bindEvents();
    this._renderWelcome();
    this._updateLayout();
  }

  _getTemplate() {
    return `
      <div class="cc-panel-inner">
        <div class="cc-messages" id="ccMessages"></div>
        <div class="cc-input-area">
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
    `;
  }

  _updateLayout() {
    const inner = this.container.querySelector('.cc-panel-inner');
    if (!inner) return;
    const hasMsgs = this.state.conversationHistory.length > 0;
    inner.classList.toggle('cc-has-messages', hasMsgs);
  }

  _bindEvents() {
    const input = this.container.querySelector('#ccInput');
    const askBtn = this.container.querySelector('#ccAskBtn');
    const picker = this.container.querySelector('#ccFilePicker');
    const pickerFilter = this.container.querySelector('#ccPickerFilter');
    const pickerList = this.container.querySelector('#ccPickerList');
    const messages = this.container.querySelector('#ccMessages');

    input.addEventListener('input', () => this._handleInput());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this._pickerOpen) {
          this._selectActivePickerItem();
        } else {
          this._handleAsk();
        }
      }
      if (e.key === 'Escape' && this._pickerOpen) {
        this._closePicker();
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
      const btn = e.target.closest('.cc-action-btn');
      if (btn) {
        const idx = Array.from(messages.children).indexOf(btn.closest('.cc-msg'));
        if (idx >= 0) btn.click();
      }
    });
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
    this._updatePickerList();
    const filter = this.container.querySelector('#ccPickerFilter');
    filter.value = this._pickerFilter;
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

    this.state.addMessage('user', '', queryType, filePath);
    this.state.addMessage('bot', '', queryType, filePath);
    this.state.isLoading = true;

    this._renderAllMessages();
    this._updateLayout();

    const answer = await this.queryEngine.executeQuery(queryType, this.state.activeRepoPath, filePath);
    const promptText = this.queryEngine.formatAsPrompt(filePath, queryType, answer);

    this.state.replaceLastBot(answer);
    this.state.conversationHistory[this.state.getLastBotIndex()]._promptText = promptText;
    this.state.isLoading = false;

    this._renderAllMessages();
    this._updateLayout();

    input.value = '';
    this.state.selectedFile = null;
    this._scrollToBottom();
  }

  _renderAllMessages() {
    const messages = this.container.querySelector('#ccMessages');
    messages.innerHTML = '';

    for (const msg of this.state.conversationHistory) {
      messages.appendChild(renderMessage(msg));
    }
  }

  _renderWelcome() {
    if (this.state.conversationHistory.length === 0) {
      const messages = this.container.querySelector('#ccMessages');
      messages.appendChild(renderWelcome());
    }
  }

  _scrollToBottom() {
    const messages = this.container.querySelector('#ccMessages');
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
    });
  }

  refresh() {
    this._renderAllMessages();
    if (this.state.conversationHistory.length === 0) this._renderWelcome();
    this._updateLayout();
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

export default ChatUI;
