const { def } = require('./helpers.js');
const components = require('./components.js');

const find = (key) => components.find((p) => p.key === key);

const NEW_PRESETS = [
    def('loading-first-load', 'Loading: First Load (Wake the Server)', 'The first loading state of the app. It wakes the server and keeps the UI hidden until the server confirms it is ready.', 'Components', 'Loading', ['loading', 'first-load', 'server-wake', 'health'], [], ['loading-page', 'loading-server-wait', 'states-feedback'], [
        ['f', 'm', 'Frontend: first-load gate', 'Show a full-screen first-load state before any app UI renders. It stays until the server confirms it is ready, then hands over to the app.'],
        ['f', 'm', 'Backend: readiness endpoint', 'Expose a lightweight readiness endpoint that answers ready only after the database, cache and required services are connected. It needs no login.'],
        ['f', 'm', 'Wake the server early', 'For hosting that sleeps when idle, send the wake request as early as possible and poll readiness with growing delays until it answers.'],
        ['e', 'm', 'Error and timeout handling', 'Handle failure inside this state: show a clear message, a retry button and the elapsed time after a long wait. Never leave an endless spinner.'],
        ['u', 's', 'Helpful waiting text', 'Say what is happening (for example starting the server) and explain that the first start can take longer when the wait gets long.'],
        ['s', 's', 'Security: safe readiness response', 'The readiness endpoint returns only a status. No versions, stack names, hosts or error details. Rate-limit it.'],
        ['a', 's', 'One reusable gate', 'Implement the gate once at app bootstrap, around the providers. Features never build their own first-load screen.'],
        ['a', 'd', 'Skip when already ready', 'Remember a recent ready result for the session so normal navigation never shows this state again.'],
        ['x', 's', 'Accessible waiting', 'Announce the status through a live region and respect the reduced-motion preference.'],
        ['t', 'd', 'Tests', 'Cover a slow start, a server that never becomes ready, retry, and an instantly ready server.'],
        ['c', 'm', 'Verified', 'The app UI appears only after the server is ready, failures show a retry, and the readiness endpoint leaks nothing.'],
    ]),

    def('loading-page', 'Loading: Page Load & Reload', 'The generic loading state when a page opens or reloads and the client needs time to provide the full page.', 'Components', 'Loading', ['loading', 'page-load', 'reload', 'skeleton'], [], ['loading-first-load', 'loading-server-wait', 'states-feedback'], [
        ['f', 'm', 'Frontend: page-level loading', 'Show a page loading state while the route code and its required data are being prepared. The app shell stays visible when possible.'],
        ['f', 'm', 'Route boundaries', 'Provide loading and error boundaries at route level so one failing page never blanks the whole app.'],
        ['u', 'm', 'Skeleton over spinner', 'Use skeletons that match the final layout for page content and keep the layout stable when content arrives.'],
        ['e', 'm', 'Error handling', 'Catch failures while loading the page, show a clear message with retry, and never show a raw error or stack trace.'],
        ['p', 's', 'Lazy pages', 'Split code per page, load it on demand and prefetch likely next pages on hover or idle.'],
        ['u', 's', 'No flicker', 'Show the loader only after a short delay and keep it visible for a minimum time, so quick loads never flash.'],
        ['a', 's', 'One shared component', 'Use one shared page-loading component. Pages never create their own.'],
        ['s', 's', 'Security: check access first', 'Check the session and permission before protected content is sent or shown. A loading state must never reveal protected data.'],
        ['x', 's', 'Accessible status', 'Announce loading and completion and move focus to the page heading when ready.'],
        ['t', 'd', 'Tests', 'Cover first open, hard reload, slow network, failed load and retry.'],
        ['c', 'm', 'Verified', 'Opening or reloading any page shows the shared loading state, then the page or a clear error, with no flicker and no protected data shown early.'],
    ]),

    def('loading-server-wait', 'Loading: Waiting for Server Data', 'The loading state for a page whose data is not provided yet. It appears before the empty state, which shows only when the server confirms there is no data.', 'Components', 'Loading', ['loading', 'empty-state', 'data-fetching', 'skeleton'], [], ['loading-page', 'states-feedback', 'data-table', 'list-endpoint', 'server-state-cache'], [
        ['f', 'm', 'Loading before empty', 'Show the loading state until the server answers. The empty state appears only after the server confirms that there is truly no data.'],
        ['f', 'm', 'Distinct states', 'Loading, empty, error and success are separate states of one small state machine. They are never shown together.'],
        ['e', 'm', 'Error handling', 'Handle timeouts and failures with a clear message and a retry. Keep any data already shown.'],
        ['a', 's', 'Backend: honest responses', 'Return a successful empty list when there is no data and a real error status for failures, in one consistent envelope, so the client can tell them apart.'],
        ['u', 's', 'Per-section loading', 'Each data area has its own loading state so one slow request does not block the whole page.'],
        ['p', 's', 'Cancel stale requests', 'Cancel in-flight requests when the user moves on and ignore responses that arrive late.'],
        ['s', 's', 'Security: distinct access errors', 'Treat not signed in and not allowed as their own states with the right redirect or message. Never show them as empty.'],
        ['p', 'd', 'Show cached data first', 'Show cached data immediately and refresh in the background with a subtle indicator.'],
        ['t', 'd', 'Tests', 'Cover loading to data, loading to empty, loading to error, retry and late responses.'],
        ['c', 'm', 'Verified', 'No page shows an empty state before the server has answered, and errors never look like empty results.'],
    ]),

    def('dropdown-selector', 'Dropdown Selector (Generic)', 'One generic, reusable dropdown that can be used anywhere, backed by a safe options endpoint when options are loaded from the server.', 'Components', 'Inputs', ['dropdown', 'select', 'generic', 'reusable'], [], ['filter-dropdown', 'form-validation', 'frontend-sanitizer'], [
        ['f', 'm', 'Generic and reusable', 'One Dropdown component for single and multi select with options defined as label, value and disabled, and a controlled value with a change event.'],
        ['f', 'm', 'Placeholder, clear and empty', 'Show a placeholder, a clear control and a clear message when there are no options.'],
        ['f', 's', 'Search and async options', 'Support type-to-filter and server-loaded options with loading, empty and error states.'],
        ['a', 's', 'Backend: options endpoint', 'Provide a paginated, searchable options endpoint with whitelisted fields, a maximum page size and the shared list envelope.'],
        ['s', 's', 'Security: validate the value', 'The server checks that a submitted value is one of the allowed options for that user. It never trusts the label or the client list.'],
        ['u', 's', 'Overlay behavior', 'Stay inside the viewport, close on outside click and Escape, and return focus to the trigger.'],
        ['x', 's', 'Accessibility', 'Follow the listbox or combobox pattern with keyboard navigation, type-ahead and announced selection.'],
        ['p', 'd', 'Large lists', 'Virtualize long lists and debounce the search inside the dropdown.'],
        ['t', 'd', 'Tests', 'Cover single and multi select, clear, async loading, keyboard use and server rejection of an invalid value.'],
        ['c', 'm', 'Verified', 'The same component works everywhere, invalid values are rejected by the server, and it is fully keyboard operable.'],
    ]),

    def('date-filter-generic', 'Date Filter: Generic (Daily, Weekly, Monthly, Yearly)', 'A simple period filter with only Daily, Weekly, Monthly and Yearly. No custom date selection, so no calendar.', 'Components', 'Inputs', ['filter', 'date', 'period', 'generic'], [], ['period-calendar', 'report-endpoint', 'dashboard-page'], [
        ['f', 'm', 'Four options only', 'Provide a segmented control with Daily, Weekly, Monthly and Yearly. There is no custom date picker and no calendar.'],
        ['f', 'm', 'Resolved range', 'Each option resolves to the current day, week, month or year and emits one object { period, start, end } with documented inclusive or exclusive end.'],
        ['d', 'm', 'One time zone', 'Resolve all boundaries in one explicit time zone and a documented first day of the week.'],
        ['i', 's', 'Controlled and single reload', 'Use a controlled value and change event. A change triggers exactly one data reload and resets pagination to page one.'],
        ['a', 's', 'Backend: period parameter', 'Accept the period type and compute the boundaries on the server so every client gets identical ranges.'],
        ['s', 's', 'Security: whitelist the period', 'Validate the period as one of the four allowed values, reject anything else and cap the range size.'],
        ['x', 's', 'Accessibility', 'Use a radio group or tabs pattern with keyboard arrows, labels and an announced selection.'],
        ['u', 's', 'Remember the choice', 'Remember the last choice and validate the restored value before applying it.'],
        ['t', 'd', 'Boundary tests', 'Test month ends, leap years, year boundaries and different first days of the week.'],
        ['c', 'm', 'Verified', 'Each option returns the correct range, the server computes the same range, and invalid periods are rejected.'],
    ]),

    def('search-bar', 'Search Bar', 'A reusable search input with debounce and a fixed size, together with its backend search endpoint and security checks.', 'Components', 'Inputs', ['search', 'input', 'debounce', 'filtering'], [], ['filter-dropdown', 'data-table', 'list-endpoint', 'frontend-sanitizer'], [
        ['f', 'm', 'Search input handling', 'Accept free text, trim whitespace and treat an empty value as a cleared search that restores the unfiltered state.'],
        ['f', 'm', 'Fixed size', 'Use fixed width and height from design tokens. The bar never grows with its content, long text is truncated, and one responsive rule is defined once.'],
        ['f', 'm', 'Debounced input', 'Debounce search-as-you-type (200 to 400 ms) with the shared useDebounce hook.'],
        ['f', 'm', 'Clear and empty state', 'Provide a clear control that resets results and refocuses the input, and show a no-results message distinct from loading and error.'],
        ['a', 'm', 'Backend: search endpoint', 'Provide an endpoint that accepts q, page and size, searches whitelisted fields only, enforces a maximum page size and returns the shared list envelope.'],
        ['s', 'm', 'Security: safe handling of text', 'Treat the text as untrusted. Use parameterized queries and encode any text rendered back, including highlighted matches.'],
        ['s', 'm', 'Security: input limits', 'Clean the text with the shared sanitizer, enforce a maximum length on both sides and rate-limit the endpoint.'],
        ['e', 'm', 'Failure handling', 'Catch failures, show a clear error, keep the input intact and allow retry.'],
        ['p', 's', 'Cancel and ignore stale', 'Cancel in-flight requests when a newer search starts. A slower older response never overwrites newer results.'],
        ['x', 's', 'Keyboard and labels', 'Label the input, support Escape to clear and announce result counts.'],
        ['p', 'd', 'Backend: indexing', 'Index the searched columns and bound the number of results returned.'],
        ['t', 'd', 'Tests', 'Cover debounce timing, clear, empty, error, stale responses and injection attempts.'],
        ['c', 'm', 'Verified', 'A term shows matches, clearing restores the full list, the bar keeps its fixed size, and hostile input is neutralised on both sides.'],
    ]),

    def('label-themes', 'Label Themes (Status Labels)', 'Global themes and colors for status labels such as good, bad and warning, used for states like completed, pending and deleted.', 'Globals', 'Labels', ['label', 'status', 'badge', 'theme'], [], ['design-tokens', 'theme-system', 'data-table'], [
        ['a', 'm', 'Global label themes', 'Define label themes (success, danger, warning, info, neutral, pending) as tokens in one place, each with background, text and border for every theme mode.'],
        ['f', 'm', 'One Label component', 'Provide one Label component with a theme prop. Pages never color status text themselves.'],
        ['a', 'm', 'Central status map', 'Keep one map from system statuses (completed, pending, deleted, failed, active) to a label theme. Add entries as the system needs them.'],
        ['a', 's', 'Backend: stable status codes', 'Define the same status values as constants in the backend and send stable codes. The frontend maps codes to labels, and free-text statuses are not allowed.'],
        ['x', 's', 'Not color alone', 'Every label carries text or an icon besides its color and meets contrast in every theme.'],
        ['u', 's', 'Consistency', 'The same status looks the same everywhere: tables, cards, details and exports.'],
        ['s', 's', 'Security: safe label text', 'Encode label text from data and never render status text as HTML.'],
        ['u', 'd', 'Unknown status fallback', 'Show a neutral label for an unknown status instead of failing.'],
        ['t', 'd', 'Tests', 'Test every mapped status in every theme and the unknown fallback.'],
        ['c', 'm', 'Verified', 'Changing a label theme token updates every label, and every backend status has a mapped label.'],
    ]),

    def('confirmation-modal', 'Confirmation Modal (Global)', 'One global confirmation for every delete and every other action that needs confirmation first, with the server still enforcing the rules.', 'Globals', 'Confirmation', ['confirm', 'modal', 'delete', 'safety'], [], ['modal-dialog', 'button', 'rbac'], [
        ['f', 'm', 'One global confirm service', 'Provide confirm({ title, message, confirmLabel, tone }) that returns a promise. Every delete and sensitive action uses it.'],
        ['f', 'm', 'Required for risky actions', 'Require confirmation for delete, bulk delete, irreversible changes, permission or access changes, and publishing.'],
        ['u', 'm', 'Clear wording', 'Name the item, use a danger tone for destructive actions and default focus to the safe option.'],
        ['x', 'm', 'Focus and keyboard', 'Trap focus, restore it on close and cancel on Escape.'],
        ['e', 's', 'Failure handling', 'Show a loading state, block double confirmation, and keep the modal open with an error when the action fails.'],
        ['s', 'm', 'Security: the server decides', 'A client confirmation is not protection. The server still authenticates, authorizes and validates every destructive request.'],
        ['s', 's', 'Security: high-risk actions', 'For critical actions require typing the item name or re-authentication, checked by the server.'],
        ['a', 's', 'Backend: safe deletes', 'Make deletes idempotent, use soft delete where records must be recoverable, and write an audit entry.'],
        ['t', 'd', 'Tests', 'Cover confirm, cancel, failure, double click and server rejection.'],
        ['c', 'm', 'Verified', 'No destructive action runs without confirmation, and the server rejects destructive requests that are not allowed.'],
    ]),

    def('sse-client', 'Server-Sent Events (Single Instance)', 'One global SSE connection managed in one place, with its backend hub, reconnect, typed events and per-user authorization.', 'Globals', 'Realtime', ['sse', 'realtime', 'singleton', 'events'], [], ['websocket-client', 'cache-invalidation-registry', 'server-state-cache'], [
        ['a', 'm', 'Single instance', 'Create one SseClient once and expose it through a provider or hook. No component creates its own EventSource.'],
        ['f', 'm', 'States and reconnect', 'Expose explicit connection states, reconnect with backoff and jitter, resume from the last event id and clean up on logout and unmount.'],
        ['f', 'm', 'Typed events', 'Define event types and validate every event against a schema. Drop and log unknown or malformed events.'],
        ['s', 'm', 'Security: authenticated stream', 'Authenticate with a cookie or a short-lived ticket, never a long-lived token in the address, and use secure transport.'],
        ['a', 's', 'Backend: one SSE hub', 'Use one hub that registers connections per user, sends heartbeat comments, cleans up on close and publishes through the shared event bus.'],
        ['f', 's', 'Subscriptions', 'Provide subscribe(topic, handler) that returns an unsubscribe function and resubscribe after reconnect.'],
        ['s', 's', 'Security: authorize per topic', 'The server sends only events the user is allowed to see.'],
        ['p', 's', 'Limits', 'Limit connections per user, drop dead connections and avoid sending large payloads.'],
        ['i', 's', 'Cache integration', 'On a change event invalidate or patch the matching cached data instead of storing data in the stream layer.'],
        ['t', 'd', 'Tests', 'Use a mock stream to cover reconnect, malformed events, authorization failure and cleanup.'],
        ['c', 'm', 'Verified', 'Exactly one stream exists per session, it reconnects after network loss, and nothing leaks after logout.'],
    ]),

    def('cache-invalidation-registry', 'Cache Invalidation & Validation Registry', 'Cache invalidation and validation kept in one place. The rules are declared in their own folder and injected into the global cache implementor.', 'Globals', 'Store', ['cache', 'invalidation', 'validation', 'modular'], [], ['server-state-cache', 'sse-client', 'websocket-client', 'global-store-redux'], [
        ['a', 'm', 'One cache implementor', 'One global cache module performs all invalidation and validation. Features never invalidate or validate the cache by themselves.'],
        ['a', 'm', 'Definitions in their own folder', 'Declare invalidation rules and validators as data in a separate folder, one file per feature, then inject them into the cache implementor at startup. A new feature adds a definition and changes nothing else.'],
        ['f', 'm', 'Rule shape', 'Each rule maps a named change (mutation or realtime event) to the keys to invalidate or patch, with a freshness time and a validation schema.'],
        ['d', 's', 'Validation in one place', 'Validate every response against its schema before it enters the cache so a changed backend fails loudly.'],
        ['f', 's', 'Triggers', 'Run rules after a successful mutation, on websocket or SSE events, and on logout or a change of user, tenant or branch.'],
        ['a', 's', 'Backend: named change events', 'The backend emits named change events through the event bus. The names come from shared constants that the definitions also use.'],
        ['s', 's', 'Security: scoped keys', 'Include the user or tenant in cache keys, clear everything on identity change and never persist sensitive data.'],
        ['t', 'd', 'Tests', 'Test each definition: the trigger invalidates exactly the expected keys and invalid data is rejected.'],
        ['c', 'm', 'Verified', 'After any change the affected data refreshes without a manual reload, and removing a definition file stops only its own rules.'],
    ]),

    def('security-layer', 'Security Layer (Frontend + Backend)', 'The security that belongs to every input and request: the shared protections on the client and the ordered security steps on the server.', 'Security', 'Layer', ['security', 'validation', 'sanitize', 'guards'], [], ['frontend-sanitizer', 'backend-request-pipeline', 'authentication', 'rbac', 'search-bar'], [
        ['a', 'm', 'One layer on each side', 'On the client keep one sanitizer and validator module. On the server keep the security steps in the pipeline folder: security headers, cors, rate limit, sanitize, validate, authenticate and authorize.'],
        ['s', 'm', 'Server is the authority', 'Validate every input on both sides. Client checks are for the user experience, the server decision is final.'],
        ['s', 'm', 'Sanitize on the server', 'Trim text, strip HTML and drop operator keys such as keys starting with a dollar sign before data reaches a service.'],
        ['s', 'm', 'Authenticate then authorize', 'Guards run per route, authentication first and authorization second, and the default is deny.'],
        ['s', 's', 'Rate limiting', 'Apply a global limit and stricter limits on sensitive routes, per user and per address.'],
        ['s', 's', 'Headers and origins', 'Set security headers and allow only the listed origins.'],
        ['e', 's', 'Safe errors', 'One error filter returns the shared error format and never exposes stack traces or internal details.'],
        ['s', 's', 'Configuration and secrets', 'Only the config module reads environment variables. Secrets never appear in code, logs or the client bundle.'],
        ['s', 'd', 'Idempotency', 'Protect changing requests against duplicates with idempotency keys.'],
        ['t', 'd', 'Tests', 'Test hostile input, missing authentication, missing permission, rate limiting and error shape.'],
        ['c', 'm', 'Verified', 'Hostile input is neutralised on both sides, unauthenticated or unauthorized requests never reach a service, and errors leak nothing.'],
    ]),

    def('backend-folder-structure', 'Backend Folder Structure (Modular)', 'The modular backend structure every new backend piece must follow, so each file has an obvious place.', 'Shared', 'Structure', ['backend', 'folders', 'modular', 'structure'], [], ['frontend-folder-structure', 'backend-request-pipeline', 'unified-component-standard', 'security-layer'], [
        ['a', 'm', 'Entry and bootstrap', 'src/main.ts only calls bootstrap(). The bootstrap folder holds the startup steps in order: connect infrastructure, create app, register pipeline, register routes, register error handling, register jobs, start server and graceful shutdown.'],
        ['a', 'm', 'Config is the only env reader', 'The config folder (env schema, app config, index) is the only place that reads process.env.'],
        ['a', 'm', 'Versioned routes', 'The routes folder mounts /api/v1 and /api/v2. A version folder mounts each module router, and v2 contains only modules whose contract changed.'],
        ['a', 'm', 'Pipeline folder', 'Cross-cutting steps live in pipeline: middlewares (request context, security headers, cors, body parser, logger, rate limit), guards, pipes (sanitize, validate), interceptors and filters.'],
        ['a', 'm', 'Self-contained modules', 'Each module owns its routes, controller, service, repository, dto (v1 and v2), mappers, strategies, constants, errors, types, utils, index.ts and its own __TEST__ folder.'],
        ['a', 's', 'Global infrastructure in lib', 'Stateful and external clients live in lib: the only database client, logger, cache client, realtime (SseHub, SocketGateway, EventBus), queue and mailer.'],
        ['a', 's', 'Global helpers', 'Pure helpers go in utils, base errors in errors, constants in constants and shared types in types. None of them has side effects.'],
        ['a', 's', 'Dependency direction', 'Routes call controllers, controllers call services, services call repositories. Modules import each other only through index.ts, jobs call services only and admin composes services.'],
        ['f', 's', 'Versioning only when needed', 'Add a v2 route and controller only when the contract differs, and use a deprecation header interceptor for sunset notices.'],
        ['t', 's', 'Tests', 'Tests live in __TEST__ folders and are excluded from the build. Shared setup, factories, mocks, helpers and cross-module end-to-end tests live in the root __TEST__ folder.'],
        ['c', 'm', 'Verified', 'Any new backend file has an obvious place by these rules, modules do not reach into each other internals, and only config reads the environment.'],
    ]),

    def('frontend-folder-structure', 'Frontend Folder Structure (Modular)', 'The modular, feature-first frontend structure with one-way dependencies, so every new file has an obvious place.', 'Shared', 'Structure', ['frontend', 'folders', 'modular', 'structure'], [], ['backend-folder-structure', 'component-build-standards', 'unified-component-standard', 'global-store-redux', 'server-state-cache'], [
        ['a', 'm', 'Follow what exists', 'Inspect the current structure and follow it. Propose a new structure only when the project has none.'],
        ['a', 'm', 'Orchestrator pages in app', 'The app folder holds thin pages grouped by audience (landing, auth, customer, admin, system). Pages only compose feature pieces and hold no business logic.'],
        ['a', 'm', 'Feature folders', 'Feature-specific code lives in feature/<name> with components, hooks, api, store, context, utils, types, assets and one public index.ts.'],
        ['a', 'm', 'Global layers', 'Cross-feature code lives in routes (with guards), layout, components (one folder per component with variants, types and index), hooks, lib (config, cache, realtime), utils, api, context, store, assets, types, constants and styles.'],
        ['a', 'm', 'One-way dependencies', 'Pages use features, features use global layers, and global layers never import from features. A feature never reaches into the internals of another feature.'],
        ['a', 's', 'Styles in one place', 'The styles folder is the single source of styles: index, base, themes, fonts and responsive.'],
        ['a', 's', 'Tests mirror src', 'All tests live in __TEST__ mirroring src, with setup, factories and mocks.'],
        ['f', 's', 'Naming', 'Use consistent file and folder naming, one component per file, and names that describe purpose.'],
        ['a', 's', 'No magic values', 'Routes, keys, event names and limits come from config or constants, never from literals inside components.'],
        ['a', 'x', 'Automated enforcement', 'Enforce import boundaries with lint rules and check for circular dependencies in CI.'],
        ['c', 'm', 'Verified', 'Any new file has an obvious place by these rules, no feature imports another feature internals, and no page contains business logic.'],
    ]),

    def('unified-component-standard', 'Unified Component Delivery (Frontend + Backend + Security)', 'The rule that a component is specified and built as one unit: its frontend, its backend counterpart and its security together.', 'Shared', 'Standards', ['standards', 'unified', 'modular', 'instructions'], [], ['backend-folder-structure', 'frontend-folder-structure', 'security-layer', 'search-bar', 'component-build-standards'], [
        ['a', 'm', 'No frontend and backend split', 'A spec covers the frontend, the backend counterpart and the security of a component together, and they are delivered as one unit.'],
        ['a', 'm', 'Four areas', 'Place work in one of four areas: components (reusable UI units), globals (themes, store, realtime, shared styling), security, and shared (layout, pages, structure and standards).'],
        ['f', 'm', 'Example: search bar', 'The search bar delivers the debounced input, the search endpoint and the input protection (limits, sanitizing, rate limit) in the same change.'],
        ['s', 'm', 'Security by default', 'Every input component includes validation, sanitizing and server-side checks without being asked.'],
        ['a', 'm', 'Modular placement', 'Follow the backend and frontend folder structures. No module reaches into the internals of another.'],
        ['a', 's', 'Reuse first', 'Search the project for an existing component, hook, helper or endpoint before writing a new one.'],
        ['t', 's', 'Tests per layer', 'Provide tests for the frontend part, the backend part and the security behavior in the matching __TEST__ folders.'],
        ['e', 'd', 'Ask before assuming', 'If a needed file, type or convention is missing, ask for it instead of inventing it.'],
        ['a', 'd', 'Delivery format', 'List the files created or changed per layer (frontend, backend, security) and state any new dependency or environment variable.'],
        ['c', 'm', 'Verified', 'The component works end to end, the backend rejects invalid input, and all files sit in their correct folders.'],
    ]),
];

const RENAMED = [];

const hybrid = find('period-calendar');
if (hybrid) {
    RENAMED.push(Object.assign({}, hybrid, {
        name: 'Date Filter: Hybrid (Period + Calendar)',
        description: 'A Daily, Weekly, Monthly, Yearly filter with a calendar icon. The calendar selection follows the chosen period: day, week, month or year.',
        tags: hybrid.tags.concat(['hybrid']),
    }));
}

const table = find('data-table');
if (table) {
    RENAMED.push(Object.assign({}, table, {
        name: 'Table List (Generic Table)',
        description: 'A reusable table with a colored header and a list of items, with pagination, sorting, filters, states and accessibility.',
    }));
}

module.exports = NEW_PRESETS.concat(RENAMED);