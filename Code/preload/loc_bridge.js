// Add this to preload.js

// 1. Add the locBridge object:
const locBridge = {
    loc: {
        scan: (options) => ipcRenderer.invoke('loc:scan', options),
    },
};

// 2. Spread it into the existing contextBridge.exposeInMainWorld('electronAPI', { ... }) call:
//    Add  ...locBridge  alongside the other spreads at the bottom of preload.js