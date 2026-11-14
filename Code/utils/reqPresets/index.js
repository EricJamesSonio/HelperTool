const { applyAppTypes } = require('./appTypes.js');
const { buildBundles } = require('./bundles.js');
const REFINEMENTS = require('./refinements.js');

const PRESET_VERSION = 18;

const ALL = [].concat(
    require('./designSystem.js'),
    require('./components.js'),
    require('./pages.js'),
    require('./system.js'),
    require('./frontendArch.js'),
    require('./extras.js'),
    require('./unified.js'),
    require('./globalsConfig.js'),
    require('./logging.js'),
    require('./imageStorage.js'),
    require('./appShellText.js'),
    require('./codeStyle.js'),
    require('./frontendErrors.js'),
    require('./pageStructure.js'),
    require('./authPage.js'),
    require('./securityChecklist.js')
);

const byKey = new Map();
for (const preset of ALL) {
    byKey.set(preset.key, preset);
}

for (const bundle of buildBundles((key) => byKey.get(key))) {
    byKey.set(bundle.key, bundle);
}

const RENAME = {
    'backend-error-logging': 'Error Handling: Backend',
};

const PAGE_KEYS = new Set([
    'login-page',
    'login-signup-page',
    'profile-page',
    'landing-page',
    'dashboard-page',
    'sales-report',
]);

function refine(preset) {
    const edit = REFINEMENTS[preset.key];
    if (!edit) return preset;
    const replace = edit.replace || {};
    const rows = preset.requirements.map((row) => (
        replace[row.title] ? Object.assign({}, row, replace[row.title]) : row
    ));
    return Object.assign({}, preset, { requirements: rows.concat(edit.add || []) });
}

function adjust(preset) {
    const next = Object.assign({}, refine(preset));
    if (RENAME[preset.key]) next.name = RENAME[preset.key];
    if (PAGE_KEYS.has(preset.key)) {
        next.category = 'Pages';
        next.subcategory = 'Screens';
    }
    return next;
}

const PRESETS = applyAppTypes(Array.from(byKey.values()).map(adjust));

module.exports = { PRESETS, PRESET_VERSION };