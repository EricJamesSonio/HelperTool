
---

# Helper Tool

Helper Tool is a simple desktop application built with Electron.

It helps you:

* Get folder structure
* Get codes inside folders
* Iterate through files to extract codes
* Generate structure or code outputs

This tool is designed to speed up file analysis and code extraction in projects.

---

# Features

* Folder structure fetching
* Code extraction from selected files
* File searching
* File extension filtering
* Ignore extension filtering
* Refresh folder content
* Improved search readability and accuracy
* Better directory-based searching (e.g., `Backend/src/models`)

For detailed feature breakdown per version, please check:

```
.Versions/
```

Each version has its own documentation file inside that folder.

---

# How To Run (Development)

```bash
npx electron main.js
```

---

# Build Windows Executable

```bash
npm run build:win
```

This will generate the `.exe` file using Electron Builder.

---

# Open DevTools (Electron)

```
Ctrl + Shift + I
```

---

# Requirements

Install Electron Builder:

```bash
npm install --save-dev electron-builder
```

Make sure Electron is installed:

```bash
npm install electron
```

---

# Notes

This project is a personal workflow helper tool designed to improve efficiency when working with repositories.

For version history and detailed feature evolution, see:

```
.Versions/
```

---

