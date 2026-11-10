const { def, UI, WEB } = require('./helpers.js');

module.exports = [
    def('design-tokens', 'Global Styles & Design Tokens', 'A single reusable styling foundation: tokens, base styles, scales and rules that every component builds on.', 'Design System', 'Foundation', ['styles', 'tokens', 'global', 'reusable'], UI, ['theme-system', 'typography-fonts', 'button'], [
        ['a', 'm', 'Single source of truth', 'Define every visual value (colors, spacing, radii, shadows, z-index, breakpoints, motion durations) as a named design token in one place. Components reference tokens only.'],
        ['a', 'm', 'No hardcoded values', 'Do not hardcode colors, font sizes, spacing, or z-index values inside components or pages. Add a token first, then use it.'],
        ['a', 'm', 'Semantic naming', 'Name tokens by role (surface, text-muted, border-subtle, accent, danger), not by value. Keep a raw palette layer underneath that semantic tokens map to.'],
        ['f', 's', 'Consistent scales', 'Provide scales for spacing (4px base), type sizes, radii, elevation, border widths, opacity, and named z-index layers (dropdown, modal, toast).'],
        ['f', 's', 'Global base styles', 'Provide one reset layer plus base typography, link, focus, and form-control defaults applied once globally.'],
        ['a', 's', 'Layering and scope', 'Order styles as tokens, base, layout, components, utilities. Component styles must not depend on page selectors or leak outside their scope.'],
        ['u', 's', 'Responsive breakpoints', 'Define breakpoints once as tokens and write mobile-first rules.'],
        ['x', 's', 'Accessible defaults', 'Token pairs meet WCAG AA contrast, a visible focus ring token exists, and animations honor the reduced-motion preference.'],
        ['p', 'd', 'Lean output', 'Avoid unused or duplicated styles, keep specificity low, and load only the styles a page needs.'],
        ['a', 'd', 'Living documentation', 'Document each token group and keep a reference page that renders every token and component state.'],
        ['t', 'x', 'Consistency checks', 'Add automated checks that fail on hardcoded colors, magic spacing numbers, and defined-but-unused tokens.'],
        ['c', 'm', 'Verified', 'Changing one token value updates every component that uses it, and no component contains a hardcoded color or spacing value.'],
    ]),

    def('theme-system', 'Theme System (Light, Dark, Custom)', 'Reusable theming built on semantic tokens, with user selection, persistence and custom brand themes.', 'Design System', 'Theming', ['theme', 'dark-mode', 'light-mode', 'branding'], UI, ['design-tokens', 'typography-fonts'], [
        ['f', 'm', 'Theme definitions', 'Provide at least a light and a dark theme implemented only by overriding semantic tokens. Components contain no theme-specific branches.'],
        ['f', 'm', 'Theme selection', 'Offer Light, Dark, and System. System follows the OS preference and updates live when it changes.'],
        ['d', 'm', 'Persistence', 'Persist the choice locally (and in the user profile when signed in) and restore it on next launch.'],
        ['u', 's', 'No flash on load', 'Apply the saved theme before first paint so the wrong theme never flashes.', ['web', 'hybrid']],
        ['x', 's', 'Contrast per theme', 'Verify text, icon, border, and focus contrast against WCAG AA in every theme, including hover and disabled states.'],
        ['f', 's', 'Custom brand themes', 'Support extra themes (brand or per-tenant) by adding a token set only. Validate for missing tokens and fall back to the default theme.'],
        ['u', 'd', 'Media and charts', 'Make images, shadows, charts, and code blocks theme-aware, using token-based chart colors.'],
        ['u', 'd', 'Smooth switching', 'Switch themes without layout shift. Transitions are optional and respect reduced-motion.'],
        ['t', 'd', 'Theme tests', 'Test every component state in every theme, with a contrast or screenshot check where available.'],
        ['c', 'm', 'Verified', 'Switching theme restyles the whole app consistently, survives restart, and follows the OS setting in System mode.'],
    ]),

    def('typography-fonts', 'Typography & Fonts', 'A reusable type system: font roles, type scale, font loading and accessible text sizing.', 'Design System', 'Typography', ['fonts', 'typography', 'text'], UI, ['design-tokens', 'theme-system'], [
        ['f', 'm', 'Font roles', 'Define font families by role (body, heading, monospace) as tokens, each with a complete fallback stack ending in a system font.'],
        ['f', 'm', 'Type scale', 'Define named sizes, line heights, letter spacing, and weights, and use them instead of raw values.'],
        ['p', 's', 'Font loading', 'Bundle or self-host WOFF2 fonts, limit weights and subsets to those used, preload critical fonts, and avoid invisible text during loading.', WEB],
        ['p', 's', 'Avoid layout shift', 'Match fallback font metrics so swapping fonts does not shift the layout.', WEB],
        ['u', 's', 'Readable text', 'Keep body text readable in size, line height, and line length (about 45 to 75 characters).'],
        ['x', 's', 'Scalable sizing', 'Use relative units so browser or OS text scaling works and layouts hold at 200 percent zoom.'],
        ['s', 'd', 'Licensing', 'Use only fonts whose license allows the intended use and record the license in the repository.'],
        ['f', 'd', 'Internationalization', 'Provide fallbacks for the supported scripts and verify numerals, currency, and date rendering.'],
        ['c', 'm', 'Verified', 'Headings, body, and code text use the defined roles and scale, and first render shows no invisible text.'],
    ]),
];