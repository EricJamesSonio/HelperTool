# Version 20.0.5 — GitHub Account Tools, Smarter Clone & Create, IDE Mode Quick Actions & Documentation

**Release Date:** November 2–10, 2026

## Overview

Version 20.0.5 improves how Helper Tool handles GitHub accounts, repository cloning and creation, and file management inside IDE Mode. It also adds Helper Tool documentation.

This release introduces three major improvements:

- **GitHub Account Tools** — Each saved account can now be opened on GitHub directly, and the account list behaves more consistently.
- **Redesigned Clone & Create Repository** — Larger two-panel windows with repositories that load progressively and an account selector built into each action.
- **IDE Mode Quick Actions** — Folders in the IDE explorer now have hover buttons for adding files and folders directly inside them.

The goal of Version 20.0.5 is to remove small repeated steps. Developers can check an account on GitHub, pick the right account for a clone or a new repository, and add files or folders where they belong, without leaving the screen they are on.

## New Features & Improvements

### GitHub Accounts (20.0.5)

The GitHub accounts panel is now easier to use when several accounts are saved.

Improvements include:

- **Open on GitHub** — Every saved account has a button that opens its GitHub profile in the default browser.
- **Stable Hover Layout** — The remove button now keeps its space in the row, so the open button no longer moves when you hover an account.
- **Consistent Controls** — Account actions stay in the same position, which makes them safer to click.

### Clone Repository (20.0.5)

The Clone window has been rebuilt as a larger two-panel layout.

The left panel shows the repository details and clone settings. The right panel shows the searchable list of repositories.

Clone supports:

- **Progressive Loading** — Repositories appear as each batch arrives, so the list is usable before everything has loaded.
- **Live Repository Count** — Shows how many repositories have loaded while the rest are still loading.
- **Repository Details Panel** — Shows visibility, language, default branch, last push date and stars for the selected repository, with a shortcut to open it on GitHub.
- **Per-Clone Account Selection** — Choose which GitHub account is used for the clone, and switch it inside the window. The repository list reloads for the selected account.
- **Active Account Stays Unchanged** — The account chosen here applies only to this clone and does not change the account used for commits and pushes.
- **Folder Preview** — Shows the final destination path before cloning.

### Create Repository (20.0.5)

The Create window uses the same two-panel layout.

Create supports:

- **Per-Create Account Selection** — Choose which account owns the new repository and switch it inside the window, without changing the active account.
- **Existing Repository List** — Shows the chosen account's repositories on the right, loaded progressively.
- **Duplicate Name Warning** — Warns while typing if the chosen account already has a repository with that name.
- **Create and Clone** — Optionally clones the new repository right after creating it, using the same selected account.

### Account Selector (20.0.5)

The account selector inside Clone and Create is a floating dropdown.

It opens over the window instead of pushing the form down, scrolls on its own when many accounts are saved, and closes when you click outside it. The layout stays stable no matter how many accounts exist.

### IDE Mode (20.0.5)

IDE Mode now has quick actions on folders in the explorer.

IDE Mode supports:

- **Folder Hover Actions** — Hovering a folder shows New File and New Folder buttons on that row.
- **Nested Creation** — Files and folders are created inside the exact folder you hover, at any depth.
- **Automatic Refresh** — The folder expands and refreshes after creation, so the new item appears immediately.
- **Same Familiar Windows** — Uses the existing create windows, including adding files from the file explorer.
- **No Layout Shift** — The buttons float over the row, so folder names and indentation do not move.

### Documentation (20.0.5)

Helper Tool documentation has been added to this release. It covers the tools and workflows in the app, including the Global Base Seeder, FlowTool and Git integration introduced in 18.0.5.

## Workflow Improvements

Version 20.0.5 reduces steps in everyday repository and file tasks.

Key improvements include:

- **Faster Account Checks** — Open any saved account on GitHub with one click.
- **Safer Multi-Account Work** — Pick the right account per clone or create action without touching the active account.
- **Faster Repository Selection** — Start choosing a repository before the whole list has loaded.
- **Direct File Placement** — Add files and folders straight into nested folders from the explorer.

## Performance & Reliability Notes

- Repositories are fetched in pages of 50, so large accounts no longer have to finish loading before the list is usable.
- Switching accounts inside Clone or Create cancels the previous load and starts a new one, so results from different accounts never mix.
- Clone and Create use the account chosen in their window for the whole operation, including the clone that follows a create.
- Folder hover buttons are positioned over the row, so rendering the explorer tree does not change its layout.

## Compatibility

Version 20.0.5 maintains compatibility with existing Helper Tool functionality, including:

- Existing GitHub account sign-in and token handling.
- The active account used for commits and pushes.
- Global Base Seeder and FlowTool.
- Enhanced Git integration.
- Symbol Indexing, Graphify, ErrorCopy, Project Inspector and HelperChat.
- Existing project structures and supported programming languages.

The new account handling in Clone and Create extends the current account system without changing how accounts are saved. Fully restart the app after updating so the new background handlers load.

## Summary

Version 20.0.5 makes Helper Tool smoother for everyday GitHub and file tasks. Account tools are easier to use, Clone and Create are larger and load progressively with their own account selection, IDE Mode adds quick file and folder creation inside any folder, and the documentation is now part of the release.
