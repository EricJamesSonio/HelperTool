# Version 10.0.0 — Smart Context & Prompt System

**Start Date:** May 21, 2026
**End Date:** May 22, 2026

## Overview

Version 10.0.0 introduces major workflow and usability improvements focused on intelligent file selection, reusable prompt workflows, UI modernization, and configurable tool management.

This update adds:

- **Shortcut Mode** for automatic repository file detection
- **Prompt Tool** for reusable prompt workflows
- **CLI Tool Manager** for feature control and shortcut configuration
- **New Sidebar UI** for cleaner navigation
- **Improved Workspace Layout** for faster interaction

The goal of this version is to reduce repetitive actions, improve workspace organization, and create a faster AI-assisted development workflow.

---

# New Features

## Shortcut Mode

A new **Shortcut Mode** system has been added.

Users can now paste large blocks of text containing filenames, stack traces, logs, feature names, or code references, and the system will automatically detect related repository files.

The feature uses:

- Fuzzy matching
- Pattern recognition
- Filename similarity detection
- Context-aware matching algorithms

Matched files are automatically searched and selected inside the current repository workspace.

This greatly reduces manual searching during large-context workflows.

---

# Intelligent File Matching

Shortcut Mode supports advanced matching behavior for incomplete or inconsistent text.

Supported matching includes:

- Partial filename matching
- Typo-tolerant detection
- Path similarity matching
- Related keyword detection
- Context-aware resolution

Example:

```txt
auth service
user controller
grading logic
```

Automatically matched files may include:

- `auth.service.ts`
- `user.controller.ts`
- `grading.service.ts`

This improves speed when working with larger repositories.

---

# Automatic Multi-File Selection

Detected files are now automatically selected after matching.

Users can now:

- Build context faster
- Reduce repetitive clicking
- Quickly prepare AI workflows
- Open related repository files instantly

The system is optimized for repositories with large file counts.

---

# Prompt Tool System

Version 10.0.0 introduces a reusable **Prompt Tool Management System**.

Users can now:

- Create prompts
- Save prompts
- Reuse prompts
- Organize prompts by workflow
- Apply prompts to selected files

This creates a centralized AI workflow management system for generation tasks.

---

# Automatic Prompt Injection

Selected prompts are now automatically inserted at the top of generated output files.

Workflow example:

- Select files
- Select prompt
- Generate output

The selected prompt is automatically attached to the generated context.

This ensures consistent AI instructions across repeated workflows.

---

# CLI Tool Manager

A new **CLI Tool Manager** has been added.

The CLI Tool allows users to configure and control application tools directly through command-based interactions.

Supported capabilities include:

- Enable tools
- Disable tools
- Toggle features
- Configure workflow behavior
- Assign shortcut keys
- Manage tool visibility

This reduces the need for manual configuration inside the interface.

Example commands:

```bash
enable prompt-tool
disable git-tool
toggle shortcut-mode
set shortcut open-sidebar Ctrl+B
```

The system is designed for fast workflow customization.

---

# Shortcut Key Configuration

Users can now configure custom shortcut keys directly from the CLI Tool Manager.

Supported configuration examples include:

- Open sidebar
- Toggle tools
- Activate Shortcut Mode
- Trigger generation
- Open Prompt Tool
- Switch workflow panels

Shortcut customization improves workflow speed and accessibility.

---

# Sidebar UI Redesign

The application interface now includes a redesigned **Sidebar Navigation System**.

The sidebar provides centralized access to:

- Tools
- Prompt management
- Git features
- Workspace panels
- CLI configuration
- Workflow utilities

The new structure improves navigation clarity and workspace organization.

---

# Cleaned Workspace UI

Version 10.0.0 introduces a cleaner and more structured workspace layout.

UI improvements include:

- Reduced visual clutter
- Improved spacing
- Better panel organization
- Cleaner tool grouping
- Faster navigation flow
- Improved readability

The interface has been optimized for long development sessions and high-frequency workflows.

---

# Workflow Improvements

This update significantly reduces workflow friction across the application.

Key improvements include:

- Faster repository navigation
- Reduced manual file selection
- Centralized prompt workflows
- Configurable tool management
- Custom shortcut support
- Improved UI organization

The system is designed for high-speed AI-assisted development workflows.

---

# Performance Notes

Shortcut Mode has been optimized to process large pasted text inputs efficiently while minimizing unnecessary repository scans.

The fuzzy matching engine uses lightweight scoring algorithms for responsive performance even in larger repositories.

UI rendering performance has also been improved through cleaner panel management and optimized workspace updates.

---

# Compatibility

Version 10.0.0 remains compatible with previous workspace and generation systems.

The new Sidebar UI, CLI Tool Manager, Shortcut Mode, and Prompt Tool integrate directly into the existing architecture without requiring repository migration or structural changes.
