const PRESET_VERSION = 5;

const ALL = [].concat(
    require('./designSystem.js'),
    require('./components.js'),
    require('./pages.js'),
    require('./system.js'),
    require('./frontendArch.js'),
    require('./extras.js'),
    require('./unified.js')
);

const byKey = new Map();
for (const preset of ALL) {
    byKey.set(preset.key, preset);
}

const PRESETS = Array.from(byKey.values());

module.exports = { PRESETS, PRESET_VERSION };