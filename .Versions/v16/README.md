# Version 16.0.2 — HelperChat & Theme Customization

**Release Date:** June 15, 2026

## Overview

Version 16 introduces **HelperChat**, a lightweight local project assistant designed to work directly with Helper Tool's Symbol Indexing system.

This release also expands personalization options with the addition of modern color themes and a new high-contrast accessibility mode.

Version 16 focuses on:

- Local project-aware chat
- Symbol Index exploration
- Dependency discovery
- Faster code navigation
- Improved accessibility
- Modernized application themes

The goal of Version 16 is to make navigating large codebases easier while allowing users to customize the visual experience to better match their workflow.

---

# New Features

## HelperChat (16.0.0)

Version 16 introduces **HelperChat**.

HelperChat is a lightweight local chat interface built on top of Helper Tool's Symbol Indexing system.

Unlike AI-powered assistants, HelperChat uses simple project search and symbol analysis to help users explore repositories quickly and efficiently.

Users can ask questions such as:

- `@main.js`
- `Where is this function defined?`
- `What files depend on this module?`
- `Show references to this symbol`
- `Find usages of AppController`

HelperChat can automatically:

- Locate symbol definitions
- Display references
- Discover dependencies
- Show related files
- Navigate indexed project structures

The system is intentionally lightweight and deterministic, providing fast responses without requiring external AI services.

This makes HelperChat ideal for quickly exploring repositories and understanding project relationships using locally indexed data.

---

## Dependency Discovery (16.0.1)

HelperChat introduces improved dependency exploration capabilities.

Users can now select files or symbols and view:

- Direct dependencies
- Imported modules
- Referenced files
- Related symbols
- Cross-file relationships

This allows developers to better understand project architecture and identify connections between components without manually searching through source code.

Dependency results are generated directly from the Symbol Index, ensuring fast and predictable navigation throughout large repositories.

---

## Theme Customization (16.0.2)

Version 16 introduces new application themes.

Users can now choose from additional modern color presets designed to improve readability and visual consistency.

New themes include:

- Modern Blue
- Emerald Green
- Sunset Orange
- Violet Purple
- Slate Gray

In addition, Version 16 adds a new **High Contrast Mode**.

High Contrast Mode provides:

- Improved text visibility
- Stronger UI separation
- Better accessibility
- Enhanced readability in bright environments
- Improved support for long development sessions

Theme settings can be changed instantly without restarting the application.

---

# User Experience Improvements

Version 16 includes several workflow enhancements:

- Faster symbol navigation
- Simplified repository exploration
- Improved search responsiveness
- Better dependency visibility
- More consistent UI styling
- Enhanced readability across tools
- Improved accessibility support

These improvements help developers locate information more quickly while maintaining a streamlined workflow.

---

# Performance Notes

HelperChat operates entirely on locally indexed repository data and does not require external AI processing.

Dependency lookups and symbol searches are optimized for fast retrieval, allowing large repositories to remain responsive during navigation.

Theme switching is performed instantly with minimal impact on application performance.

---

# Compatibility

Version 16 remains fully compatible with existing repositories, Symbol Indexing features, analytics tools, repository management functionality, and workflow integrations.

All new functionality integrates seamlessly with existing Helper Tool capabilities while maintaining stability and consistency throughout the platform.
