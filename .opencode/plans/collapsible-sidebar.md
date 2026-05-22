# Plan: Collapsible Sidebar for Tools

## Goal
Replace the floating Tools panel overlay with a persistent sidebar that auto-expands on hover and can be pinned open.

## Layout Change

```
┌────────────────────────────────────────┐
│            Navbar (74px)               │
├──────┬─────────────────────────────────┤
│Side  │  Root jumper                     │
│bar   │  Status bar + slide panels      │
│4→220 │  Tree view / content            │
│px    │                                 │
├──────┴─────────────────────────────────┤
</code></pre>

## Files to Modify

### 1. `index.html`

**Navbar changes** — remove 4 buttons:
- `#toolsPanelBtn` (Tools 🛠️ button)
- `#settingsBtn` (🎨)
- `#secretHolderBtn` (🔐)
- `#workspaceTool` (👥 Workspace)

**Structural change** — wrap existing content + new sidebar in `.app-body` flex row:

```html
<div id="app">
  <!-- ══ Navbar ══ -->
  <div class="navbar-row navbar-row--primary">…</div>

  <!-- ══ App body: sidebar + main content ══ -->
  <div class="app-body">

    <!-- Sidebar -->
    <div id="toolsSidebar" class="tools-sidebar collapsed">
      <div class="tools-sidebar-header">
        <span class="tools-sidebar-title">🧰 Tools</span>
        <button class="tools-sidebar-pin" id="sidebarPinBtn" title="Pin sidebar open">📌</button>
      </div>
      <div class="tools-sidebar-body" id="toolsSidebarBody"></div>
    </div>

    <!-- Main content (wraps all existing content below navbar) -->
    <div class="app-main">

      <div id="rootJumper" class="root-jumper" style="display:none"></div>
      <div class="status-filter-bar">…</div>

      <!-- slide panels -->
      <div id="filterPanel" …>…</div>
      <div id="ignorePanel" …>…</div>
      <div id="folderPanel" …>…</div>

      <!-- tree view -->
      <div class="tree-view-container">
        <div id="treeContainer">Select a repo to view files</div>
      </div>

    </div>
  </div>

  <!-- modals (shortcut, etc.) — unchanged, stay outside .app-body -->
  …
</div>
```

### 2. `styles/base.css`

**Remove** the old floating tools panel CSS block (currently lines ~728-781):
- `.tools-panel-overlay`
- `.tools-panel`
- `.tools-panel-header`
- `.tools-panel-close`
- `.tools-panel-body`
- `.tools-panel-item`
- `.tools-panel-item-icon`
- `.tools-panel-item-info`
- `.tools-panel-item-name`
- `.tools-panel-item-desc`

**Remove** `.tools-btn` class (lines ~363-384).

**Add** new sidebar styles:

```css
/* ── App body layout ──────────────────── */
.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.app-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

/* ── Tools sidebar ────────────────────── */
.tools-sidebar {
  width: 4px;
  flex-shrink: 0;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  transition: width 0.2s ease;
  overflow: hidden;
  white-space: nowrap;
  display: flex;
  flex-direction: column;
  cursor: pointer;
}

.tools-sidebar.expanded,
.tools-sidebar.pinned {
  width: 220px;
  overflow-y: auto;
  cursor: default;
}

.tools-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tools-sidebar.expanded .tools-sidebar-header,
.tools-sidebar.pinned .tools-sidebar-header {
  opacity: 1;
}

.tools-sidebar-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.tools-sidebar-pin {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-faint);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
}

.tools-sidebar-pin:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tools-sidebar.pinned .tools-sidebar-pin {
  color: var(--accent);
}

.tools-sidebar-body {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tools-sidebar.expanded .tools-sidebar-body,
.tools-sidebar.pinned .tools-sidebar-body {
  opacity: 1;
}

.tools-sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 10px;
  text-align: left;
  font-family: inherit;
  font-size: 14px;
  transition: background 0.15s;
  flex-shrink: 0;
}

.tools-sidebar-item:hover {
  background: var(--blue-dim);
}

.tools-sidebar-item-icon {
  font-size: 18px;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.tools-sidebar-item-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tools-sidebar-item-name {
  font-weight: 700;
  font-size: 13px;
}

.tools-sidebar-item-desc {
  font-size: 11px;
  color: var(--text-muted);
}
```

### 3. `toolsManager.js`

Replace the floating tools panel with sidebar population logic:

**Remove:**
- `createToolsPanel()` function
- `renderToolsPanelEntries()` function
- `openToolsPanel()` function
- `closeToolsPanel()` function
- `_toolsPanel` variable
- `toolsPanelBtn` click handler wiring

**Add:**
- `populateSidebar()` — finds `#toolsSidebarBody` and renders the same tool entry buttons into it (same entries as before: API, Prompt, Git)
- `initSidebarBehavior()` — wires hover (mouseenter/mouseleave) and pin button click:
  - `mouseenter` → add `expanded` class (unless `.pinned` present)
  - `mouseleave` → remove `expanded` class (unless `.pinned` present)
  - Pin click → toggle `pinned` class, remove `expanded` if unpinning
- Call both from `initTools()`

The sidebar entries are the same buttons as the current `renderToolsPanelEntries()` — API Tool, Prompt Tool, Git Tool. The click handlers stay identical.

### 4. `app.js`

Update `applyFeatureVisibility()` — remove hiding of `secretHolderBtn` and `workspaceTool` since those buttons no longer exist in the navbar (tools are in the sidebar now). Keep only:

```js
function applyFeatureVisibility(feats) {
    if (!feats.folderFilters) {
        const el = document.getElementById('folderToggleBtn');
        if (el) el.style.display = 'none';
        const panel = document.getElementById('folderPanel');
        if (panel) panel.style.display = 'none';
    }
}
```

Also remove the `settingsBtn` wiring in `app.js` if we're moving Settings to the sidebar. Wait — Settings is still needed. The `settingsBtn` click handler is in `app.js` lines 161-165. But we're removing the `#settingsBtn` button from the navbar. So we need to decide:

- Option A: Remove `settingsBtn` wiring from `app.js` and add a sidebar entry for Settings that calls `settingsManager.openSettings()`.
- Option B: Keep `#settingsBtn` in the navbar.

The user said "Sidebar only" for all tool buttons, so Option A.

So the sidebar entries should include:
1. API Tool (from `_apiTool`)
2. Prompt Tool (lazy import)
3. Git Tool (from `_gitPanel`)
4. **Settings** (calls `settingsManager.openSettings()`)
5. **Secret Holder** (calls `_secretHolder.openSecretHolder()`)
6. **Workspace** (calls `_workspaceTool.openWorkspacePanel()`)

This means `toolsManager.js` needs access to settingsManager and the other tool instances. Currently it already has `_secretHolder`, `_workspaceTool`. For Settings, we need to either:
- Pass settingsManager to `initTools()` 
- Or have the settings entry import it

The simplest: add a settings entry in the sidebar that does the same thing as the original `settingsBtn` click handler. Since `settingsManager` is already loaded and available as a module handle in `app.js`, we can pass it to `initTools()`.

### 5. `settings.css`

- Remove `.compact-mode .tools-btn` override
- Add `.compact-mode .tools-sidebar` overrides:

```css
.compact-mode .tools-sidebar { width: 3px; }
.compact-mode .tools-sidebar.expanded,
.compact-mode .tools-sidebar.pinned { width: 180px; }
.compact-mode .tools-sidebar-header { padding: 10px 12px 8px; }
.compact-mode .tools-sidebar-item { padding: 8px 10px; font-size: 13px; }
.compact-mode .tools-sidebar-item-icon { font-size: 15px; width: 20px; }
.compact-mode .tools-sidebar-item-name { font-size: 12px; }
.compact-mode .tools-sidebar-item-desc { font-size: 10px; }
```

## Execution Order
1. `index.html` — restructure layout, add sidebar, remove tool buttons
2. `base.css` — add sidebar styles, remove old tools panel + tools-btn CSS
3. `toolsManager.js` — rewrite floating panel → sidebar logic, add entries for Settings/Secret/Workspace
4. `app.js` — update feature visibility, pass settingsManager to initTools
5. `settings.css` — compact mode overrides

## Open Question

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="question">
<｜｜DSML｜｜parameter name="questions" string="false">[{"question":"Settings, Secret Holder, and Workspace — should the sidebar entries call them from toolsManager.js (current architecture) or should the sidebar entries live in the HTML and be wired from app.js?","options":[{"description":"All tool entries generated in toolsManager.js (same pattern as current floating panel). Cleanest separation.","label":"toolsManager.js handles all entries (Recommended)"},{"description":"Sidebar entries are part of HTML, each wired in its respective module's init.","label":"HTML entries + individual wiring"}],"header":"Architecture choice"}]