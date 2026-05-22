# Version 10.0.0 — Smart Context & Prompt System

**Start Date:** May 21, 2026
**End Date:** May 22, 2026

## Overview

Version 10.0.0 introduces two major workflow productivity features:

- **Shortcut Mode** — intelligent repository file detection from pasted text
- **Prompt Tool** — reusable prompt management and automated prompt injection

This update focuses on reducing repetitive manual work during file selection and AI-assisted generation workflows.

The system now allows users to quickly identify repository files from large text blocks while also streamlining reusable prompt workflows for generated outputs.

---

# New Features

## Shortcut Mode

A new **Shortcut Mode** system has been added.

Users can now paste large blocks of text containing filenames, references, logs, stack traces, or code snippets, and the system will automatically detect and match related repository files.

The feature uses:

- Fuzzy matching
- Pattern recognition
- Filename similarity detection
- Context-based matching algorithms

Detected files are automatically searched and selected inside the current repository workspace.

This significantly reduces manual file searching during large-context workflows.

---

# Intelligent File Matching

Shortcut Mode can now identify files even when pasted text is incomplete or inconsistent.

Supported matching behavior includes:

- Partial filename matching
- Typo-tolerant detection
- Path similarity matching
- Context-aware file resolution

Example:

Pasted text:

```txt
auth service
user controller
grade compute logic
```

The system may automatically match:

- `auth.service.ts`
- `user.controller.ts`
- `grade-computation.service.ts`

This improves workflow speed when working with large repositories.

---

# Automatic Multi-File Selection

Matched files are now automatically selected after detection.

This allows users to:

- Quickly build working context
- Reduce repetitive manual clicks
- Open related repository files faster
- Streamline AI generation workflows

The feature is optimized for repositories with large file counts.

---

# Prompt Tool System

Version 10.0.0 introduces a new **Prompt Tool** with reusable prompt management support.

Users can now:

- Create prompts
- Save prompts
- Reuse prompts
- Organize workflow instructions
- Apply prompts to selected files

This creates a centralized prompt workflow system for AI-assisted generation tasks.

---

# Automatic Prompt Injection

When generating output using selected files and a saved prompt, the system now automatically inserts the selected prompt at the top of the generated output file.

Workflow example:

- Select repository files
- Select saved prompt
- Generate output

The selected prompt is automatically attached to the generated result context.

This ensures prompt consistency across repeated workflows.

---

# Workflow Improvements

Version 10.0.0 reduces friction in repository navigation and prompt-based generation workflows.

Key improvements include:

- Faster file discovery
- Reduced manual file selection
- Reusable prompt workflows
- Automated context preparation
- Improved generation consistency

The update is designed for high-speed development and AI-assisted coding environments.

---

# Performance Notes

Shortcut Mode is optimized to efficiently process large pasted text inputs while minimizing unnecessary repository scans.

The matching system prioritizes relevant files using lightweight fuzzy matching and scoring algorithms for responsive performance.

Prompt Tool operations are cached locally for faster prompt retrieval and application.

---

# Compatibility

Version 10.0.0 remains compatible with existing workspace and generation systems.

Shortcut Mode and Prompt Tool integrate directly into the current workflow architecture without requiring repository migration or structural changes.
