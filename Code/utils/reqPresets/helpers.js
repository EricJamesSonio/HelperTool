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

const UI = ['web', 'offline', 'desktop', 'mobile', 'hybrid'];
const APP = ['web', 'desktop', 'mobile', 'hybrid'];
const WEB = ['web', 'hybrid'];
const API = ['backend', 'hybrid'];

function toRequirement(row) {
    return {
        group: GROUP[row[0]],
        level: LEVEL[row[1]],
        title: row[2],
        description: row[3],
        appTypes: row[4] || [],
    };
}

function def(key, name, description, category, subcategory, tags, appTypes, related, rows) {
    return {
        key,
        name,
        description,
        category,
        subcategory,
        tags,
        appTypes,
        related,
        requirements: rows.map(toRequirement),
    };
}

module.exports = { def, UI, APP, WEB, API };