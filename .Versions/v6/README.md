# Version 6

**Start Date:** March 13, 2026  
**End Date:** March 30, 2026

## Overview

Version 6 introduces **Feature Flag Management**, allowing users to choose which features are loaded at startup. This improves performance by skipping unused modules entirely — nothing is parsed, initialised, or injected if it is disabled.

This version also adds a **Minified Code Generation** option to the existing code output workflow.

---

## New Features

### Feature Flag System

A new feature management system has been added to the application.

On **first launch**, users are presented with a setup wizard that lists all optional features. Each feature can be individually enabled or disabled before the app fully loads.

Choices are saved to `helper-config.json` and persist across sessions.

Features can be managed at any time via **Settings → Features**.

---

### Manage Features Panel

A **Features** section has been added to the Settings modal.

Each feature shows:

- Icon and name
- Short description
- A **heavy** badge for modules that have a significant load cost

Saving changes triggers an automatic reload so the updated flag set takes effect immediately.

---

### Optional Features

The following features can be individually toggled:

| Feature | Default | Description |
|---|---|---|
| API Tool | On | Built-in HTTP request tester |
| Secret Holder | On | Password-protected key and notes vault |
| Full Theme Engine | On | 20 themes and accent colour pickers |
| Folder Filters | On | Ignore and Focus folder panels |
| Swagger Import | On | OpenAPI spec endpoint importer |

---

### Minified Code Generation

The **Generate** button now supports a **Minified** output mode.

When minified mode is selected:

- Empty lines are removed
- Single-line comments are stripped (`//`, `#`, `/* */`)
- Lines are joined into a compact single-line output

This reduces output size for sharing or pasting into external tools.

The mode can be switched using the split-button dropdown next to the Generate button.

---

## Performance Notes

Disabling unused features reduces startup cost in the following ways:

- **API Tool** — skips loading `apiTool.js`, `apiToolUI.js`, `swaggerImport.js`, and `api-tool.css`
- **Secret Holder** — skips loading `secretHolder.js` and `secret-holder.css`
- **Full Theme Engine** — replaces the 20-theme engine with a minimal dark/light toggle, skipping all theme CSS variable computation on boot
- **Folder Filters** — skips rendering the folder ignore and focus panels

Disabled features are never imported. No CSS is injected, no DOM is built, and no IPC calls are made for features that are turned off.

---

## Compatibility

Feature flags are stored in `helper-config.json` inside the Electron `userData` directory.

If the flags key is missing (for example, on first install or after a reset), the first-launch wizard runs automatically and sets all features to their defaults before the main interface loads.