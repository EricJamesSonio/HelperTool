import toolRegistry from './toolRegistry.js';

const MCP_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M10 4v12"/><path d="M4 10h12"/></svg>';

const PLAY_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l12 7-12 7V3z"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="5" width="10" height="10" rx="1.5"/></svg>';
const EXT_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h7l3 3v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M11 4v3h3"/></svg>';
const BOOK_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2z"/><path d="M10 8v4"/><path d="M8 10h4"/></svg>';

export default class McpUI {
  constructor() {
    this._wrapper = null;
    this._body = null;
    this._grid = null;
    this._open = false;
    this._pollTimer = null;
    this._statusCache = {};
    this._pendingOps = {};
  }

  init(container) {
    if (this._wrapper) return;

    const wrapper = container.parentElement;
    if (!wrapper) return;

    container.innerHTML = `
      <div class="mcp-panel">
        <div class="mcp-header">
          <div class="mcp-header-left">
            <span class="mcp-header-icon">${MCP_ICON}</span>
            <span class="mcp-title">MCP</span>
            <span class="mcp-subtitle">Tool Provider</span>
          </div>
          <button class="mcp-close-btn" title="Close"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="18" height="18"><path d="M5 5l10 10"/><path d="M15 5L5 15"/></svg></button>
        </div>
        <div class="mcp-body"></div>
      </div>
    `;

    this._wrapper = wrapper;
    this._body = container.querySelector('.mcp-body');

    container.querySelector('.mcp-close-btn').addEventListener('click', () => this.close());
    wrapper.addEventListener('click', (e) => {
      if (e.target === wrapper) this.close();
    });

    const escHandler = (e) => {
      if (e.key === 'Escape' && this._open) this.close();
    };
    document.addEventListener('keydown', escHandler);
    this._escCleanup = () => document.removeEventListener('keydown', escHandler);

    this._render();
  }

  isOpen() {
    return this._open;
  }

  open() {
    if (!this._wrapper || this._open) return;
    this._open = true;
    this._wrapper.classList.add('open');
    this._pollStatus();
    this._startPolling();
  }

  close() {
    if (!this._wrapper || !this._open) return;
    this._open = false;
    this._wrapper.classList.remove('open');
    this._stopPolling();
  }

  destroy() {
    this.close();
    if (this._escCleanup) this._escCleanup();
    if (this._body && this._body.parentNode) {
      this._body.parentNode.removeChild(this._body);
    }
    this._wrapper = null;
    this._body = null;
    this._grid = null;
  }

  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(() => this._pollStatus(), 3000);
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async _pollStatus() {
    const statuses = await toolRegistry.statusAll();
    let changed = false;
    for (const [id, status] of Object.entries(statuses)) {
      if (this._statusCache[id] !== status) {
        this._statusCache[id] = status;
        changed = true;
      }
    }
    if (changed) this._renderCards();
  }

  _render() {
    if (!this._body) return;
    this._body.innerHTML = '';
    this._body.appendChild(this._buildTopBar());
    this._grid = document.createElement('div');
    this._grid.className = 'mcp-tools-grid';
    this._body.appendChild(this._grid);
    this._renderCards();
  }

  _buildTopBar() {
    const bar = document.createElement('div');
    bar.className = 'mcp-top-bar';
    bar.innerHTML = `
      <button class="mcp-top-btn mcp-top-btn-primary" data-mcp-action="startAll">
        ${PLAY_ICON} Start All
      </button>
      <button class="mcp-top-btn mcp-top-btn-danger" data-mcp-action="stopAll">
        ${STOP_ICON} Stop All
      </button>
      <div class="mcp-top-divider"></div>
      <button class="mcp-top-btn" data-mcp-action="generateCs">
        ${BOOK_ICON} Generate MCP Cheatsheet
      </button>
    `;

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mcp-action]');
      if (!btn) return;
      const action = btn.dataset.mcpAction;
      if (action === 'startAll') this._handleStartAll();
      else if (action === 'stopAll') this._handleStopAll();
      else if (action === 'generateCs') this._handleGenerateCheatsheet();
    });

    return bar;
  }

  _renderCards() {
    if (!this._grid) return;
    const tools = toolRegistry.getAll();

    if (tools.length === 0) {
      this._grid.innerHTML = `
        <div class="mcp-empty">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M6 6l8 8"/><path d="M6 10h8"/><path d="M10 6v8"/></svg>
          <div>No tools registered yet.</div>
        </div>
      `;
      return;
    }

    this._grid.innerHTML = '';
    const frag = document.createDocumentFragment();

    for (const tool of tools) {
      const status = this._statusCache[tool.id] || 'stopped';
      const isPending = this._pendingOps[tool.id];
      const statusLabel = status === 'starting' ? 'Starting...' : status === 'running' ? 'Running' : status === 'error' ? 'Error' : 'Stopped';

      const card = document.createElement('div');
      card.className = 'mcp-tool-card';
      card.dataset.toolId = tool.id;
      card.innerHTML = `
        <div class="mcp-tool-card-header">
          <div class="mcp-tool-card-icon" style="background:${tool.color}22; color:${tool.color}">
            ${tool.icon || ''}
          </div>
          <span class="mcp-tool-card-name" style="color:${tool.color}">${tool.name}</span>
          <div class="mcp-tool-card-status">
            <span class="mcp-tool-status-dot ${status}"></span>
            <span style="color:${status === 'running' ? '#23d18b' : status === 'starting' ? '#eab308' : status === 'error' ? '#ef4444' : '#6d5050'}">${statusLabel}</span>
          </div>
        </div>
        <div class="mcp-tool-card-desc">${tool.description || ''}</div>
        <div class="mcp-tool-card-actions">
          <button class="mcp-tool-card-btn mcp-btn-start" data-action="start" ${status === 'running' || isPending ? 'disabled' : ''}>
            ${PLAY_ICON} Start
          </button>
          <button class="mcp-tool-card-btn mcp-btn-stop" data-action="stop" ${status !== 'running' || isPending ? 'disabled' : ''}>
            ${STOP_ICON} Stop
          </button>
          <button class="mcp-tool-card-btn mcp-btn-open" data-action="open">
            ${EXT_ICON} Open
          </button>
          ${tool.cheatsheetPath ? `<button class="mcp-tool-card-btn mcp-btn-cheatsheet" data-action="cheatsheet">${BOOK_ICON} Cheatsheet</button>` : ''}
        </div>
      `;

      card.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'start') this._handleStartTool(tool.id);
        else if (action === 'stop') this._handleStopTool(tool.id);
        else if (action === 'open') this._handleOpenTool(tool);
        else if (action === 'cheatsheet') this._handleCheatsheet(tool);
      });

      frag.appendChild(card);
    }

    this._grid.appendChild(frag);
  }

  async _handleStartTool(id) {
    const tool = toolRegistry.get(id);
    if (!tool || this._pendingOps[id]) return;

    this._pendingOps[id] = true;
    this._statusCache[id] = 'starting';
    this._renderCards();

    try {
      const repoPath = window.__activeRepoPath || null;
      await tool.startFn(repoPath);
      this._statusCache[id] = 'running';
    } catch {
      this._statusCache[id] = 'error';
    }

    delete this._pendingOps[id];
    this._renderCards();
  }

  async _handleStopTool(id) {
    const tool = toolRegistry.get(id);
    if (!tool || this._pendingOps[id]) return;

    this._pendingOps[id] = true;
    this._renderCards();

    try {
      await tool.stopFn();
      this._statusCache[id] = 'stopped';
    } catch {
      this._statusCache[id] = 'stopped';
    }

    delete this._pendingOps[id];
    this._renderCards();
  }

  _handleOpenTool(tool) {
    this.close();
    if (typeof tool.openPanelFn === 'function') {
      tool.openPanelFn();
    }
  }

  async _handleCheatsheet(tool) {
    const repoPath = window.__activeRepoPath;
    if (!repoPath || !tool.cheatsheetPath) return;

    const fullPath = (repoPath + '/' + tool.cheatsheetPath).replace(/\\/g, '/');
    try {
      const result = await window.electronAPI.readFile(fullPath);
      if (result && result.success && result.content) {
        this._showPromptViewer(result.content);
      } else {
        console.warn(`[MCP] Cheatsheet not found at: ${fullPath}`);
      }
    } catch (e) {
      console.error('[MCP] Failed to read cheatsheet:', e);
    }
  }

  async _handleStartAll() {
    this._pendingOps = {};
    for (const tool of toolRegistry.getAll()) {
      this._pendingOps[tool.id] = true;
      this._statusCache[tool.id] = 'starting';
    }
    this._renderCards();

    for (const tool of toolRegistry.getAll()) {
      try {
        const repoPath = window.__activeRepoPath || null;
        await tool.startFn(repoPath);
        this._statusCache[tool.id] = 'running';
      } catch {
        this._statusCache[tool.id] = 'error';
      }
      delete this._pendingOps[tool.id];
    }
    this._renderCards();
  }

  async _handleStopAll() {
    for (const tool of toolRegistry.getAll()) {
      try {
        await tool.stopFn();
        this._statusCache[tool.id] = 'stopped';
      } catch {
        this._statusCache[tool.id] = 'stopped';
      }
    }
    this._renderCards();
  }

  _handleGenerateCheatsheet() {
    const tools = toolRegistry.getAll();
    const repoPath = window.__activeRepoPath || '';

    const lines = [];
    lines.push('# MCP — Tool Provider Cheatsheet');
    lines.push('');
    lines.push('This document describes all tools available through the MCP (Mini Controller Provider) system.');
    lines.push('Each tool exposes a server API and has its own detailed cheatsheet with endpoints and usage.');
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const tool of tools) {
      lines.push(`## ${tool.name}`);
      lines.push('');
      lines.push(`**ID:** \`${tool.id}\``);
      lines.push('');
      lines.push(`**Description:** ${tool.description || 'No description.'}`);
      lines.push('');
      if (tool.cheatsheetPath) {
        const fullCsPath = repoPath ? `${repoPath}/${tool.cheatsheetPath}` : tool.cheatsheetPath;
        lines.push(`**Cheatsheet Location:** \`${fullCsPath}\``);
        lines.push('');
        lines.push('**How to use for AI agents:**');
        lines.push(`1. Read the cheatsheet at \`${fullCsPath}\` to understand the API endpoints and usage.`);
        lines.push(`2. The cheatsheet contains all available endpoints, request/response formats, and examples.`);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }

    lines.push('## How AI Agents Should Use MCP');
    lines.push('');
    lines.push('1. Start by reading this MCP cheatsheet to discover available tools.');
    lines.push('2. For each tool you want to use, read its individual cheatsheet for detailed API docs.');
    lines.push('3. Tools expose HTTP REST APIs on localhost. Use the endpoints documented in each cheatsheet.');
    lines.push('4. Ensure the tool\'s server is running before making API calls.');

    this._showPromptViewer(lines.join('\n'));
  }

  _showPromptViewer(promptText) {
    const existing = document.querySelector('.ecp-prompt-viewer');
    if (existing) {
      const contentEl = existing.querySelector('#ecpPvContent');
      if (contentEl) contentEl.textContent = promptText;
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'ecp-prompt-viewer';
    overlay.innerHTML = `
      <div class="ecp-pv-header">
        <span class="ecp-pv-title">MCP Cheatsheet</span>
        <div class="ecp-pv-actions">
          <button class="ecp-pv-copy-btn" id="mcpPvCopy">Copy</button>
          <button class="ecp-pv-close" id="mcpPvClose">&times;</button>
        </div>
      </div>
      <pre class="ecp-pv-content" id="mcpPvContent">${this._escapeHtml(promptText)}</pre>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#mcpPvClose').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.addEventListener('keydown', function pvEscape(e) {
      if (e.key === 'Escape' && document.querySelector('.ecp-prompt-viewer')) {
        overlay.remove();
        document.removeEventListener('keydown', pvEscape);
      }
    });

    overlay.querySelector('#mcpPvCopy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(promptText);
        const btn = overlay.querySelector('#mcpPvCopy');
        btn.textContent = 'Copied';
        btn.classList.add('ecp-pv-copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('ecp-pv-copied');
        }, 2000);
      } catch {}
    });
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
}
