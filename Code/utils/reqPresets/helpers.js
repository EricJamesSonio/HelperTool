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

// Area and group for every preset. Areas: Components, Globals, Security, Shared.
const PLACE = {
    'search-bar': ['Components', 'Inputs'],
    'filter-dropdown': ['Components', 'Inputs'],
    'period-calendar': ['Components', 'Inputs'],
    'form-validation': ['Components', 'Inputs'],
    'button': ['Components', 'Actions'],
    'card': ['Components', 'Display'],
    'data-table': ['Components', 'Display'],
    'pagination': ['Components', 'Display'],
    'analytics-charts': ['Components', 'Charts'],
    'modal-dialog': ['Components', 'Overlays'],
    'states-feedback': ['Components', 'Loading'],

    'design-tokens': ['Globals', 'Styles'],
    'theme-system': ['Globals', 'Styles'],
    'typography-fonts': ['Globals', 'Styles'],
    'global-store-redux': ['Globals', 'Store'],
    'server-state-cache': ['Globals', 'Store'],
    'websocket-client': ['Globals', 'Realtime'],
    'frontend-middleware-pipeline': ['Globals', 'Pipelines'],
    'backend-request-pipeline': ['Globals', 'Pipelines'],
    'backend-error-logging': ['Globals', 'Errors'],
    'env-switcher': ['Globals', 'Config'],

    'authentication': ['Security', 'Auth'],
    'rbac': ['Security', 'Authorization'],
    'frontend-sanitizer': ['Security', 'Input protection'],
    'db-security': ['Security', 'Database'],
    'devops-security': ['Security', 'Pipeline'],

    'page-header': ['Shared', 'Layout'],
    'navbar': ['Shared', 'Layout'],
    'sidebar': ['Shared', 'Layout'],
    'nextjs-main-layout': ['Shared', 'Layout'],
    'portal-framework': ['Shared', 'Portals'],
    'login-page': ['Shared', 'Pages'],
    'profile-page': ['Shared', 'Pages'],
    'landing-page': ['Shared', 'Pages'],
    'dashboard-page': ['Shared', 'Pages'],
    'sales-report': ['Shared', 'Pages'],
    'rest-endpoint': ['Shared', 'Endpoints'],
    'list-endpoint': ['Shared', 'Endpoints'],
    'report-endpoint': ['Shared', 'Endpoints'],
    'db-schema-migrations': ['Shared', 'Database'],
    'db-queries': ['Shared', 'Database'],
    'ci-pipeline': ['Shared', 'DevOps'],
    'utility-helpers': ['Shared', 'Utils'],
    'component-build-standards': ['Shared', 'Standards'],
    'frontend-folder-structure': ['Shared', 'Structure'],
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