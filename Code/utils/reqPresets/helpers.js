const LEVEL = {
    m: 'must-have',
    s: 'standard',
    d: 'medium',
    x: 'strict',
};

const GROUP = {
    f: 'Functional Requirements',
    s: 'Security Requirements',
    p: 'Performance Requirements',
    a: 'Architecture Requirements',
    d: 'Data Management Requirements',
    e: 'Error Handling Requirements',
    u: 'User Experience Requirements',
    x: 'Accessibility Requirements',
    t: 'Testing Requirements',
    i: 'Integration Requirements',
    c: 'Acceptance Criteria',
};

// Kept so older preset files keep loading. Application types no longer exist.
const UI = [];
const APP = [];
const WEB = [];
const API = [];

// Area and group for the presets defined in the older files.
const PLACE = {
    'design-tokens': ['Frontend', 'Globals'],
    'theme-system': ['Frontend', 'Globals'],
    'typography-fonts': ['Frontend', 'Globals'],
    'search-bar': ['Frontend', 'Components'],
    'button': ['Frontend', 'Components'],
    'card': ['Frontend', 'Components'],
    'data-table': ['Frontend', 'Components'],
    'filter-dropdown': ['Frontend', 'Components'],
    'period-calendar': ['Frontend', 'Components'],
    'form-validation': ['Frontend', 'Components'],
    'modal-dialog': ['Frontend', 'Components'],
    'pagination': ['Frontend', 'Components'],
    'analytics-charts': ['Frontend', 'Components'],
    'page-header': ['Frontend', 'Layout'],
    'navbar': ['Frontend', 'Layout'],
    'sidebar': ['Frontend', 'Layout'],
    'states-feedback': ['Frontend', 'Shared'],
    'login-page': ['Frontend', 'Pages'],
    'profile-page': ['Frontend', 'Pages'],
    'landing-page': ['Frontend', 'Pages'],
    'dashboard-page': ['Frontend', 'Pages'],
    'sales-report': ['Frontend', 'Pages'],
    'portal-framework': ['Frontend', 'Modules'],
    'authentication': ['Backend', 'Security'],
    'rbac': ['Backend', 'Security'],
    'rest-endpoint': ['Backend', 'Endpoints'],
    'list-endpoint': ['Backend', 'Endpoints'],
    'report-endpoint': ['Backend', 'Endpoints'],
};

// Requirements that only made sense for one kind of application.
const DROP_TITLES = new Set([
    'Local searching',
    'Connectivity changes',
    'Title sync',
    'No flash on load',
    'Font loading',
    'Avoid layout shift',
    'URL state sync',
]);

function toRequirement(row) {
    return {
        group: GROUP[row[0]],
        level: LEVEL[row[1]],
        title: row[2],
        description: row[3],
    };
}

function def(key, name, description, category, subcategory, tags, appTypes, related, rows) {
    const place = PLACE[key];
    return {
        key,
        name,
        description,
        category: place ? place[0] : category,
        subcategory: place ? place[1] : subcategory,
        tags,
        related,
        requirements: rows.filter((r) => !DROP_TITLES.has(r[2])).map(toRequirement),
    };
}

module.exports = { def, UI, APP, WEB, API };