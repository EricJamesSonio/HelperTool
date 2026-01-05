Code/           <-- Root folder
 ├─ package.json       <-- Node/Electron config
 ├─ main.js            <-- Electron main process (tray + app lifecycle)
 ├─ preload.js         <-- Preload script for secure renderer access
 ├─ renderer/          <-- Frontend UI
 │    ├─ index.html
 │    ├─ style.css
 │    └─ app.js
 ├─ assets/            <-- Tray icon, logos, etc.
 │    └─ tray-icon.png
 ├─ utils/             <-- Helper functions
 │    ├─ fileOps.js       <-- Read/write files, scan folders
 │    ├─ codeOps.js       <-- Extract code from files
 │    ├─ treeView.js      <-- Convert folder structure to tree
 │    └─ docignore.js     <-- Parse .docignore
 ├─ config/            <-- Config management
 │    ├─ helper-config.json  <-- Stores baseStoragePath, repos, activeProject
 │    └─ config.js           <-- Functions to read/write/update config
 ├─ logs/              <-- Optional: log errors or generation info
 └─ node_modules/      <-- NPM dependencies
