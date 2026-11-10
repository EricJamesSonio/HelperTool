const PRESET_VERSION = 3;

const PRESETS = [].concat(
    require('./designSystem.js'),
    require('./components.js'),
    require('./pages.js'),
    require('./system.js'),
    require('./frontendArch.js')
);

module.exports = { PRESETS, PRESET_VERSION };