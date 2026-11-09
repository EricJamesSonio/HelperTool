# Version 19.0.8 — IDE Mode, GitHub Account Management, WakaTime & Cline Support

## Overview

Version 19.0.8 turns Helper Tool into a full coding environment. It adds a built-in IDE Mode, GitHub account management, WakaTime time tracking, language extensions for the IDE, and support for a second AI agent in the chat tool.

This release introduces five major improvements:

- **IDE Mode** — A VS Code style explorer and editor built into Helper Tool.
- **GitHub Account Management** — Sign in with GitHub, manage several accounts, and switch between them per repository.
- **WakaTime Integration** — Coding activity tracked from inside the IDE.
- **IDE Extensions** — Per-language extensions that check your code and help you edit it.
- **Cline Support** — The Code Swamp chat tool now runs OpenCode or Cline, and you choose which one.

The main goal of Version 19.0.8 is to let developers read, edit, check, commit and chat with an AI agent in one window, without switching to a separate editor.

---

# New Features & Improvements

## IDE Mode (19.0.8)

**IDE Mode** adds a complete editing workspace to Helper Tool. It opens from the IDE Mode button in the top bar and restores your open files when you come back to a repository.

IDE Mode supports:

- **File Explorer** — Browse the repository as a folder tree. Create files and folders, rename them, refresh and collapse all.
- **File Express** — A list of open files at the top of the explorer, with unsaved markers and a one-click review of unsaved changes.
- **Tabbed Editor** — Multiple tabs, a breadcrumb path, syntax highlighting, line numbers, and a minimap.
- **Find and Replace** — Find in file, replace, replace all, and match case.
- **Codebase Search** — Search words across the whole codebase from the top bar or with F2.
- **Editing Shortcuts** — Auto-closing brackets and quotes, smart indentation, comment toggling, move and duplicate lines, delete line, undo and redo.
- **Media Viewer** — Images, video, audio and PDF files open directly in the editor.
- **Docked Terminal** — A terminal at the bottom of the IDE that follows the active repository.
- **Run and Debug Buttons** — Run the current file in the terminal, or run a strict check on it.
- **Ctrl+Click on Imports** — Hold Ctrl and click the path inside `require`, `import` or `export ... from` to open that file.

### Git Awareness in the IDE

IDE Mode shows what changed in your repository without leaving the editor.

- **Status Marks in the Explorer** — Modified, new, deleted, renamed and conflicted files are colored and labeled, and folders show when they contain changes.
- **Changes Panel** — A summary of modified, new and deleted files. Click a count to open a list.
- **Jump to the Change** — Click a file in the changes list to open it and go straight to its first changed line.
- **Changed Line Highlighting** — Lines that changed since the last commit are highlighted across the whole line. Green marks new lines, yellow marks modified lines, and a red edge marks where lines were removed.
- **Unsaved Line Highlighting** — Lines you edited since the last save get their own color, which takes priority over the git colors.
- **Diff View** — Inspect a commit's changes in side-by-side or inline layout, with folding and next and previous change buttons.

---

## GitHub Account Management (19.0.8)

Helper Tool can now manage your GitHub accounts directly.

- **GitHub Login** — Sign in to GitHub from the app.
- **Multiple Accounts** — Keep several accounts saved side by side.
- **Per-Repository Switching** — Choose which account a repository uses.
- **Repository Tools** — List your repositories, create new ones, and clone them from within the app.
- **Push Error Help** — When a push fails because of the wrong account or missing access, Helper Tool explains the problem and offers to switch accounts and retry.

---

## WakaTime Integration (19.0.8)

IDE Mode connects to WakaTime so your coding time is tracked automatically.

- **Install and Setup** — Install the WakaTime component and save your API key from within the app.
- **Heartbeats from the Editor** — Editing activity is reported while you work.
- **Today's Summary** — See how much time you coded today.

---

## IDE Extensions (19.0.8)

Extensions add language-specific help to the editor. Each one can be turned on or off from the Extensions panel, and only the extensions for the file you have open are active.

- **Diagnostics per Language** — Problems are underlined in the code and listed in a Problems panel with errors, warnings and info.
- **Inline Messages and Hover Details** — See the problem at the end of the line, or hover over it for the full message.
- **Problem Navigation** — F8 jumps to the next problem and Shift+F8 to the previous.
- **Problem Counts** — Error and warning counts appear in the status bar and in a list inside the editor.
- **Prettier Formatting** — Format the current file or all open files, and optionally format on save.
- **Debug Button** — Run a stricter check on the current file with the active extensions.
- **Run Support** — Run supported files in the terminal with the correct command for their language.

---

## Cline Support for the Chat Tool (19.0.8)

The Code Swamp chat tool is now available in IDE Mode with support for two AI agents: **OpenCode** and **Cline**.

- **Agent Picker** — Click the chat icon in the top bar and choose OpenCode or Cline.
- **Same Terminal Experience** — Each agent runs in a terminal inside the repository, just like before.
- **Saved Choice** — Your selected agent is remembered between sessions.
- **Separate Sessions** — Conversation lists are kept per agent, so one agent's chats don't show up under the other.
- **Docked Layout** — Chat opens as a dock next to the editor, with a resizable width and a modal view when parallel mode is used.
- **Parallel Mode** — Run several agent terminals side by side.
- **Shared Tools** — Prompts, Tickets, Stones, Plans and Kits work with both agents.

Cline requires Node.js 22 or newer and is installed with `npm i -g cline`.

---

# Workflow Improvements

Version 19.0.8 brings editing, version control and AI assistance into the same window.

Key improvements include:

- **One Window for Everything** — Browse, edit, run, commit and chat without leaving Helper Tool.
- **Faster Review of Changes** — Changed lines are highlighted and one click takes you to the first change in a file.
- **Safer Editing** — Unsaved work is clearly marked and can be reviewed in one place.
- **Choice of AI Agent** — Switch between OpenCode and Cline depending on the task.
- **Better Accounts Handling** — Work with several GitHub identities without reconfiguring Git.
- **Built-in Time Tracking** — Coding time is recorded automatically through WakaTime.

---

# Performance & Reliability Notes

The editor draws only the visible lines and uses a lightweight minimap, so large files stay responsive. Git status and line changes refresh in the background and only update the screen when something actually changes.

Extensions and diagnostics run after you stop typing instead of on every keystroke.

Terminals created for the chat tool stay alive when the dock is hidden, so a running agent session continues in the background.

---

# Compatibility

Version 19.0.8 maintains compatibility with existing Helper Tool functionality, including:

- Global Base Seeder and FlowTool.
- Existing project and repository management.
- Symbol Indexing.
- Graphify.
- ErrorCop.
- Project Inspector.
- HelperChat.
- Existing Git functionality.
- OpenCode conversations and sessions.
- Theme customization and application settings.

IDE Mode is optional. Turning it off returns Helper Tool to the standard layout without changing your projects.

---

# Summary

Version 19.0.8 makes Helper Tool a complete place to write code. With IDE Mode as the editor, GitHub account management for source control, WakaTime for tracking time, language extensions for catching mistakes, and Cline alongside OpenCode in the chat tool, developers can do more of their work in one window.
