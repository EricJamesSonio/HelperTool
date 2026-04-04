# Version 6

**Start Date:** March 13, 2026  
**End Date:** March 30, 2026

## Overview

Version 6 introduces **Feature Flag Management**, allowing users to choose which features are loaded at startup. This improves performance by skipping unused modules entirely — nothing is parsed, initialised, or injected if it is disabled.

This version also adds a **Minified Code Generation** option to the existing code output workflow, and **drag-to-scroll** navigation in the tree view.

---

## New Features

### Feature Flag System

On **first launch**, users are presented with a setup wizard listing all optional features. Each can be individually enabled or disabled before the app fully loads. Choices are saved to `helper-config.json` and persist across sessions. Features can be managed at any time via **Settings → Features**.

### Manage Features Panel

A **Features** section has been added to the Settings modal. Each feature shows its icon, name, short description, and a **heavy** badge for modules with significant load cost. Saving triggers an automatic reload.

### Optional Features

| Feature | Default | Description |
|---|---|---|
| API Tool | On | Built-in HTTP request tester |
| Secret Holder | On | Password-protected key and notes vault |
| Full Theme Engine | On | 20 themes and accent colour pickers |
| Folder Filters | On | Ignore and Focus folder panels |
| Swagger Import | On | OpenAPI spec endpoint importer |

### Minified Code Generation

The **Generate** button now supports a **Minified** output mode. When active, empty lines and comments are stripped and output is compacted — useful for sharing or pasting into external tools. Toggle it via the split-button dropdown next to Generate.

### Drag-to-Scroll Tree Navigation

Hold the left mouse button on any empty area of the tree and move the cursor to pan in any direction. Releasing the button ends the drag.

A small movement threshold prevents accidental drags from interfering with normal node clicks, folder expands, and file selections. Interactive elements such as buttons and inputs are excluded from drag initiation so all existing click behaviour is fully preserved.

The cursor changes to a grab hand while hovering over the tree, and to a grabbing hand while actively dragging.

---

## Performance Notes

Disabled features are never imported. No CSS is injected, no DOM is built, and no IPC calls are made for features that are turned off.

---

## Compatibility

Feature flags are stored in `helper-config.json` inside the Electron `userData` directory. If the flags key is missing, the first-launch wizard runs automatically and sets all features to their defaults.