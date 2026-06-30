export function getTemplate() {
  return `
<div id="ulhPanel" class="ulh-panel">
  <div class="ulh-header">
    <span class="ulh-title">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
        <rect x="2" y="2" width="16" height="16" rx="2"/>
        <line x1="2" y1="7" x2="18" y2="7"/>
        <line x1="8" y1="7" x2="8" y2="18"/>
        <line x1="2" y1="13" x2="18" y2="13"/>
        <line x1="14" y1="7" x2="14" y2="18"/>
      </svg>
      UI Layout Helper
    </span>
    <div class="ulh-header-actions">
      <span class="ulh-badge">Text → ASCII</span>
      <button id="ulhCloseBtn" class="ulh-btn ulh-btn-ghost ulh-btn-sm" type="button" title="Close">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="18" height="18">
          <path d="M5 5l10 10"/><path d="M15 5L5 15"/>
        </svg>
      </button>
    </div>
  </div>

  <div class="ulh-body">
    <div class="ulh-sidebar">
      <div class="ulh-sidebar-section">
        <div class="ulh-sidebar-title">Presets</div>
        <div id="ulhPresets" class="ulh-presets-list"></div>
      </div>
      <div class="ulh-sidebar-section">
        <div class="ulh-sidebar-title">Quick Start</div>
        <div class="ulh-help">
          <p>Define a layout using JSON:</p>
          <pre class="ulh-help-code">{
  type: "box",
  label: "My App",
  border: "rounded",
  children: [
    { type: "box", label: "Header" },
    { type: "hsplit", ratio: [1,3],
      children: [
        { type: "box", label: "Side" },
        { type: "box", label: "Main" }
      ]
    }
  ]
}</pre>
          <div class="ulh-help-types">
            <div><code>box</code> — bordered container</div>
            <div><code>hsplit</code> — horizontal split</div>
            <div><code>vsplit</code> — vertical stack</div>
            <div><code>spacer</code> — empty space</div>
            <div><code>label</code> — centered text</div>
          </div>
        </div>
      </div>
    </div>

    <div class="ulh-main">
      <div class="ulh-editor-pane">
        <div class="ulh-pane-header">
          <span>Layout Definition</span>
          <div class="ulh-pane-actions">
            <span id="ulhCharCount" class="ulh-char-count">0 chars</span>
            <button id="ulhRenderBtn" class="ulh-btn ulh-btn-primary ulh-btn-sm" type="button">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="14" height="14">
                <polygon points="5 3 17 10 5 17 5 3"/>
              </svg>
              Render
            </button>
          </div>
        </div>
        <textarea id="ulhInput" class="ulh-input" spellcheck="false"
          placeholder='Paste a layout JSON or type one...'></textarea>
      </div>

      <div class="ulh-preview-pane">
        <div class="ulh-pane-header">
          <span>Preview</span>
          <div class="ulh-pane-actions">
            <button id="ulhCopyBtn" class="ulh-btn ulh-btn-ghost ulh-btn-sm" type="button" title="Copy to clipboard">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <rect x="7" y="7" width="11" height="11" rx="1.5"/><path d="M4 11V4h7"/>
              </svg>
              Copy
            </button>
          </div>
        </div>
        <div id="ulhError" class="ulh-error" style="display:none"></div>
        <pre id="ulhPreview" class="ulh-preview">Render a layout to see it here...</pre>
      </div>
    </div>
  </div>
</div>`;
}
