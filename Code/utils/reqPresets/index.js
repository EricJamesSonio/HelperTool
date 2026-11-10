const PRESET_VERSION = 2;

const PRESETS = [].concat(
    require('./designSystem.js'),
    require('./components.js'),
    require('./pages.js'),
    require('./system.js')
);

module.exports = { PRESETS, PRESET_VERSION };