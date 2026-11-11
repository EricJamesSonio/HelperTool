const BUNDLE_AREA = 'Globals';
const BUNDLE_GROUP = 'Bundles';

function bundleRequirements(find, introTitle, introText, members) {
    const out = [
        {
            group: 'Architecture Requirements',
            level: 'must-have',
            title: introTitle,
            description: introText,
        },
    ];
    for (const member of members) {
        const preset = find(member[0]);
        if (!preset) continue;
        for (const r of preset.requirements) {
            out.push({
                group: r.group,
                level: r.level,
                title: member[1] + ': ' + r.title,
                description: r.description,
            });
        }
    }
    return out;
}

function buildBundles(find) {
    const styleMembers = [
        ['design-tokens', 'Design Tokens'],
        ['theme-system', 'Theme System'],
        ['typography-fonts', 'Typography'],
        ['label-themes', 'Label Themes'],
    ];
    const errorMembers = [
        ['backend-error-logging', 'Backend'],
        ['frontend-error-handling', 'Frontend'],
    ];

    const styles = {
        key: 'bundle-global-styles',
        name: 'Bundle: Global Styles (Tokens, Theme, Typography, Labels)',
        description: 'The whole global styling foundation in one preset: design tokens, theme system, typography and fonts, and label themes.',
        category: BUNDLE_AREA,
        subcategory: BUNDLE_GROUP,
        tags: ['bundle', 'styles', 'tokens', 'theme', 'typography', 'labels'],
        related: ['design-tokens', 'theme-system', 'typography-fonts', 'label-themes'],
        requirements: bundleRequirements(
            find,
            'Bundle: build order',
            'This bundle delivers the whole global styling foundation in one pass, in this order: Design Tokens, Theme System, Typography, Label Themes. Later parts use the tokens of earlier ones. Inspect the project first and build only what is missing. If a part already exists, extend it instead of replacing it.',
            styleMembers
        ),
    };

    const errors = {
        key: 'bundle-error-handling',
        name: 'Bundle: Error Handling (Backend + Frontend)',
        description: 'Backend and frontend error handling in one preset, built on one shared error format and stable error codes.',
        category: BUNDLE_AREA,
        subcategory: BUNDLE_GROUP,
        tags: ['bundle', 'errors', 'backend', 'frontend'],
        related: ['backend-error-logging', 'frontend-error-handling'],
        requirements: bundleRequirements(
            find,
            'Bundle: one error contract',
            'Deliver backend and frontend error handling together as one contract: the backend defines one error format with stable codes, and the frontend normalizes and displays them. Agree the error format first and reuse it on both sides. Inspect what already exists and build only what is missing.',
            errorMembers
        ),
    };

    return [styles, errors].filter((b) => b.requirements.length > 1);
}

module.exports = { buildBundles };