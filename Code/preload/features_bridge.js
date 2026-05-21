const { ipcRenderer } = require('electron');

module.exports = {
    featuresGet: ()  => ipcRenderer.invoke('features-get'),
    featuresSet: (f) => ipcRenderer.invoke('features-set', f),
};