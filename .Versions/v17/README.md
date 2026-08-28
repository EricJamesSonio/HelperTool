# Version 17.0.0 — Global Seeder, Graphify, ErrorCopy, Project Inspector & CodeSwamp

**Release Date:** August 28, 2026

## Overview

Version 17 is a major workflow release, introducing five new tools aimed at speeding up code generation, debugging, dependency visualization, and multi-terminal development.

Version 17 focuses on:

- Strict-format code seeding
- Visual dependency graphing
- One-click error capture
- Deep project structure inspection
- Parallel terminals with an embedded AI agent

The goal of Version 17 is to reduce the friction between writing code, understanding a codebase, and fixing what breaks — all without leaving the app.

---

# New Features

## Global Seeder (17.0.0)

**Global Seeder** is a strict, parser-friendly output format for generating and applying code changes directly into a project.

Instead of pasting code manually, Global Seeder reads a structured block — file path, then fenced code — and writes it straight to disk.

Global Seeder supports:

- **Content Mode** — full file creation or overwrite from a path + fenced code block
- **Structure Mode** — box-drawing folder/file trees for scaffolding empty projects
- **Surgical Updates** — `(Update: <target>)` annotations patch a single function, CSS selector, or JSON key without touching the rest of the file

Paths are resolved by smart-anchoring to the nearest matching folder in the repo (skipping `node_modules`, `.git`, `.next`, `dist`, `build`), so generated code lands in the right place automatically.

If a target file or node isn't found, Global Seeder falls back to a full create/overwrite with a warning — changes are never silently dropped.

---

## Graphify (17.0.1)

**Graphify** turns your project's Symbol Index into an interactive dependency graph.

Users can visualize:

- Module-to-module import relationships
- Component trees
- Circular dependency warnings
- Impact radius for a given file (what breaks if I change this?)
- Cross-package references in monorepos

Graphify renders directly from indexed data, so graphs stay fast and accurate even on large repositories, and update live as files change.

---

## ErrorCopy (17.0.2)

**ErrorCopy** captures runtime and build errors in one click and formats them for instant use.

When an error is thrown, ErrorCopy automatically bundles:

- The full stack trace
- The relevant source snippet
- File and line context
- Recent related changes from version history

The bundled output is copied in a clean, agent-ready format — ideal for pasting straight into HelperChat or any AI coding assistant for a fast root-cause fix, no manual trimming required.

---

## Project Inspector (17.0.3)

**Project Inspector** gives a deep, structural view of the entire codebase.

Project Inspector surfaces:

- Unused files and dead exports
- Oversized or overly complex modules
- Inconsistent naming conventions
- Missing type coverage
- Outdated or duplicate dependencies

Results are organized into an actionable checklist, letting teams clean up technical debt without manually auditing every folder.

---

## CodeSwamp (17.0.4)

**CodeSwamp** brings multiple parallel terminals into a single screen, each with its own embedded AI agent — similar in spirit to Claude Code Desktop, but built natively into Helper Tool.

CodeSwamp allows users to:

- Run several agent-driven terminal sessions side by side
- Assign a different task or repo branch to each pane
- Watch live agent output and diffs per session
- Merge or discard changes from any pane independently
- Switch a pane between manual shell control and agent-driven mode

Each terminal is isolated but shares the same Symbol Index, so agents across panes stay aware of the same project context without stepping on each other's changes.

---

# User Experience Improvements

Version 17 includes several workflow enhancements:

- Faster error-to-fix turnaround with ErrorCopy
- Clearer architectural visibility with Graphify
- Safer, format-strict code application with Global Seeder
- Reduced technical debt visibility gaps via Project Inspector
- True multi-agent parallelism with CodeSwamp

These improvements are designed to keep developers in a single workspace from writing code to debugging to reviewing architecture.

---

# Performance Notes

Graphify and Project Inspector both operate on locally indexed repository data, keeping graph rendering and audits fast even on large codebases.

CodeSwamp sessions run isolated per pane, so one agent's workload does not block or slow down another.

Global Seeder's smart-anchoring and surgical patching minimize file I/O by touching only the nodes that actually change.

---

# Compatibility

Version 17 remains fully compatible with existing repositories, Symbol Indexing, HelperChat, dependency discovery, theme customization, analytics tools, repository management functionality, and workflow integrations.

All new tools integrate seamlessly with existing Helper Tool capabilities while maintaining stability and consistency throughout the platform.