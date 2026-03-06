
---

# Version 3

**Start Date:** March 6, 2026

---

# Overview

Version 3 focuses on **security, smarter folder handling, and improved user interface usability**.

This update introduces the new **Secret Holder** feature for securely storing sensitive information such as API keys and credentials. It also improves **folder filtering behavior** by automatically including subfolders when using focus or ignore modes.

In addition, the interface has been redesigned to improve readability and interaction through **larger buttons, better colors, and clearer selection feedback**.

---

# New Features

### Secret Holder

A new secure storage feature that allows users to store sensitive information.

Examples of stored items:

* API Keys
* Tokens
* Passwords
* Private credentials
* Other secret values

Security features:

* Each access requires a **password authentication**
* Secrets remain protected and cannot be viewed without unlocking

This feature allows users to keep important development secrets **securely inside the tool instead of plain files**.

---

# Improvements

### Alphabetical Folder Sorting

Folders are now automatically sorted **alphabetically**, making them easier to browse and locate.

---

### Scoped Folder Mode

Folder filtering now automatically applies to **subfolders**.

When a folder is selected in **Focus Mode** or **Ignore Mode**, all of its subfolders are also included in the rule.

Example:

**Selected Folder**

```
Server
```

**Mode**

```
Focus
```

**Result**

```
Server/
 ├── api/
 ├── config/
 ├── controllers/
 └── utils/
```

All subfolders inside **Server** will automatically be included in the focus scope.

The same behavior applies to **Ignore Mode**.

This improvement makes folder filtering **more intuitive and predictable** when working with large directory structures.

---

### Improved Light / Dark Mode UI

The theme system has been improved for better visual consistency and readability.

Enhancements include:

* Better contrast
* Cleaner component styling
* Improved visibility for selected elements

---

### UI Design Improvements

Several UI improvements were introduced to improve usability:

* **Larger buttons** for easier interaction
* **Improved color palette**
* **Clearer folder selection highlights**
* **More readable layout**

These changes make the application easier to navigate and more comfortable to use during long sessions.

---

# Notes

Version 3 continues improving the tool by focusing on:

* **Security**
* **User experience**
* **Smarter project navigation**

These changes make the tool more practical for developers working with **large codebases and sensitive project data**.

---
