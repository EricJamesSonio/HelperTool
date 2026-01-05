const { app, BrowserWindow, Tray, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const config = require('./config/config.js');

let mainWindow;
let tray;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    mainWindow.on('close', (e) => {
        e.preventDefault();
        mainWindow.hide();
    });
}

app.whenReady().then(() => {
    createTray();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

function createTray() {
    tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Open Helper', click: () => mainWindow.show() },
        { label: 'Open Storage Folder', click: () => openStorage() },
        { label: 'Exit', click: () => app.quit() }
    ]);
    tray.setToolTip('Helper Tool');
    tray.setContextMenu(contextMenu);
}

function openStorage() {
    const activeProject = config.getActiveProject();
    if (activeProject) {
        const storagePath = activeProject.storagePath;
        if (fs.existsSync(storagePath)) {
            shell.openPath(storagePath);
        }
    }
}
