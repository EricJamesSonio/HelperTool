const { contextBridge } = require('electron');

const repoBridge      = require('./preload/repo_bridge.js');
const generateBridge  = require('./preload/generate_bridge.js');
const featuresBridge  = require('./preload/features_bridge.js');
const secretsBridge   = require('./preload/secrets_bridge.js');
const apitoolBridge   = require('./preload/apitool_bridge.js');
const workspaceBridge = require('./preload/workspace_bridge.js');
const gitBridge       = require('./preload/git_bridge.js');

contextBridge.exposeInMainWorld('electronAPI', {
    ...repoBridge,
    ...generateBridge,
    ...featuresBridge,
    ...secretsBridge,
    ...apitoolBridge,
    ...workspaceBridge,
    ...gitBridge,
});