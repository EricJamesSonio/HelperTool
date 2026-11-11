const BUNDLE_AREA = 'Globals';
const BUNDLE_GROUP = 'Bundles';

function existingKeys(find, keys) {
    return keys.filter((key) => !!find(key));
}

function buildBundles(find) {
    const styleKeys = existingKeys(find, [
        'design-tokens',
        'theme-system',
        'typography-fonts',
        'label-themes',
    ]);
    const errorKeys = existingKeys(find, [
        'backend-error-logging',
        'frontend-error-handling',
    ]);

    const styles = {
        key: 'bundle-global-styles',
        name: 'Bundle: Global Styles (Tokens, Theme, Typography, Labels)',
        description: 'The whole global styling foundation in one preset: design tokens, theme system, typography and fonts, and label themes. All parts are included automatically when you copy it.',
        category: BUNDLE_AREA,
        subcategory: BUNDLE_GROUP,
        tags: ['bundle', 'styles', 'tokens', 'theme', 'typography', 'labels'],
        related: styleKeys,
        requirements: [
            {
                group: 'Architecture Requirements',
                level: 'must-have',
                title: 'Bundle: build order',
                description: 'Deliver the whole global styling foundation in one pass, in this order: Design Tokens, Theme System, Typography, Label Themes. Later parts use the tokens of earlier ones. The dependencies between these parts are covered by this bundle, so do not stop to ask about them. Inspect the project first and build only what is missing. If a part already exists, extend it instead of replacing it.',
            },
        ],
    };

    const errors = {
        key: 'bundle-error-handling',
        name: 'Bundle: Error Handling (Backend + Frontend)',
        description: 'Backend and frontend error handling in one preset, built on one shared error format and stable error codes. All parts are included automatically when you copy it.',
        category: BUNDLE_AREA,
        subcategory: BUNDLE_GROUP,
        tags: ['bundle', 'errors', 'backend', 'frontend'],
        related: errorKeys,
        requirements: [
            {
                group: 'Architecture Requirements',
                level: 'must-have',
                title: 'Bundle: one error contract',
                description: 'Deliver backend and frontend error handling together as one contract: the backend defines one error format with stable codes, and the frontend normalizes and displays them. Agree the error format first and reuse it on both sides. The dependencies between these two parts are covered by this bundle, so do not stop to ask about them. Anything this bundle does not contain is listed in the dependencies row below: check it and ask the user if it is missing. Inspect what already exists and build only what is missing.',
            },
        ],
    };

    return [styles, errors].filter((b) => b.related.length > 0);
}

module.exports = { buildBundles };