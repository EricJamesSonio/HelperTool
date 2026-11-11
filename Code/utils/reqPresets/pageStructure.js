const { def } = require('./helpers.js');

const pageStructure = def('page-structure', 'Page Structure (Reuse Layout & Globals)', 'The rules every page follows: reuse the main layout, the page header, the global styles and fonts, and the shared states, with no page building its own shell.', 'Pages', 'Structure', ['page', 'layout', 'structure', 'reuse'], [], ['page-header', 'nextjs-main-layout', 'design-tokens', 'typography-fonts', 'frontend-error-handling', 'states-feedback', 'frontend-folder-structure'], [
    ['a', 'm', 'Follow what exists', 'Inspect the project for its main layout, page header, global styles, fonts and shared states, and reuse them. Do not rebuild or restyle what already exists.'],
    ['a', 'm', 'Reuse the main layout', 'Every page renders inside the shared main layout, or inside the specified layout for its audience (public, auth, customer, admin). A page never builds its own shell, navbar or sidebar.'],
    ['a', 'm', 'Reuse the page header', 'If the project has a page header, the page uses it for the title, breadcrumbs and actions. A page never builds its own title bar.'],
    ['a', 'm', 'Reuse global styles and fonts', 'All colors, spacing, radius, typography and fonts come from the global design tokens and global styles. No hardcoded values, no page-level resets and no extra font loading inside a page.'],
    ['a', 'm', 'Thin pages', 'A page only composes feature components and hooks. Business logic, data access and validation live in features, services and the backend, never in the page file.'],
    ['u', 'm', 'Shared states', 'Use the shared loading, empty and error components for every async part of the page. Loading shows before empty, and errors never look like empty results.'],
    ['e', 's', 'Frontend error handling', 'Use the route-level error boundary and the shared error messages. A failing page shows a safe message with retry and never a blank screen.'],
    ['a', 's', 'Route registration', 'Register the page in the one route configuration with its layout, its guard and its title. Do not hand-write routes or guards inside the page.'],
    ['s', 's', 'Access before content', 'Check the session and permission before protected content is requested or shown, and enforce the same rule on the server.'],
    ['p', 's', 'Load on demand', 'Split page code per route and show the shared page loader while it loads.'],
    ['x', 's', 'Page semantics', 'One page-level heading, labelled landmarks, a document title that matches the page, and a logical focus order.'],
    ['u', 'd', 'Responsive', 'The page works on phone, tablet and desktop through the global responsive rules, with no horizontal overflow.'],
    ['t', 'd', 'Tests', 'Test that the page renders inside the layout, shows loading, empty and error states, and redirects when access is missing.'],
    ['c', 'm', 'Verified', 'The page uses the shared layout, header, styles and fonts, contains no business logic, and handles loading, empty and error states.'],
]);

module.exports = [pageStructure];