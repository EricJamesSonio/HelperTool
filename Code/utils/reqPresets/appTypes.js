const GROUP = {
    integration: 'Integration Requirements',
    security: 'Security Requirements',
    functional: 'Functional Requirements',
    ux: 'User Experience Requirements',
    arch: 'Architecture Requirements',
    testing: 'Testing Requirements',
};

const APP_TYPES = [
    { id: 'general', label: 'General (no specific type)', short: 'General' },
    { id: 'web', label: 'Web app (browser)', short: 'Web app' },
    { id: 'desktop', label: 'Desktop app (Electron)', short: 'Desktop app' },
    { id: 'mobile', label: 'Mobile app (iOS and Android)', short: 'Mobile app' },
];

const APP_TYPE_IDS = APP_TYPES.map((t) => t.id);
const SPECIFIC_TYPES = ['web', 'desktop', 'mobile'];

const KIND_OF = {
    'search-bar': 'input',
    'dropdown-selector': 'input',
    'filter-dropdown': 'input',
    'date-filter-generic': 'input',
    'period-calendar': 'input',
    'form-validation': 'input',
    'data-table': 'data',
    'pagination': 'data',
    'loading-server-wait': 'data',
    'server-state-cache': 'data',
    'cache-invalidation-registry': 'data',
    'loading-first-load': 'loading',
    'loading-page': 'loading',
    'confirmation-modal': 'action',
    'sse-client': 'realtime',
    'websocket-client': 'realtime',
    'env-switcher': 'config',
};

function req(group, level, title, description, types) {
    return { group, level, title, description, types: types || [] };
}

const INTEGRATION_FOLLOWS = 'Inspect how the project already talks to its data and use exactly that path: an API client, an IPC bridge, a local database or a direct service call. Online or offline does not matter. The component depends on one small data function, and the transport behind it is whatever the project already uses.';
const THEME_STYLES = 'All colors, sizes, spacing, radius, typography and states come from the global design tokens and global styles. No hardcoded values, and the component follows every theme (light, dark, custom) automatically.';

const COMMON = {
    input: [
        req(GROUP.arch, 'must-have', 'Integration follows the project', INTEGRATION_FOLLOWS),
        req(GROUP.functional, 'must-have', 'Global theme and styles', THEME_STYLES),
        req(GROUP.ux, 'must-have', 'Responsive on all devices', 'Works on phone, tablet, laptop and large desktop. One responsive rule is defined once in the global responsive styles. Touch targets are at least 44px on touch devices, nothing overflows horizontally, the on-screen keyboard never hides the field, zoom up to 200 percent works, and mouse, touch and keyboard input are all supported.'),
        req(GROUP.functional, 'must-have', 'Debounce algorithm', 'Use the shared useDebounce hook: a trailing timer that restarts on every change and runs only with the latest value. Skip values below the minimum length, flush immediately on Enter, wait for IME composition to end, and clear the timer on unmount. Pair it with a request counter or an abort signal so only the latest request may update the UI.'),
        req(GROUP.security, 'must-have', 'Injection protection', 'Pass every input through the shared sanitizer before use and validate it again on the receiving side: trim, normalize Unicode, strip control and zero-width characters, enforce a maximum length and a character policy, then validate against a schema. Never build queries, commands, file paths or HTML from the text. Use parameterized queries, escape wildcard characters in LIKE patterns, drop operator keys such as keys starting with a dollar sign and __proto__, and never use user-controlled regular expressions.'),
        req(GROUP.security, 'standard', 'Safe output', 'Encode text whenever it is shown back, including highlighted matches. Never render it as HTML.'),
        req(GROUP.testing, 'medium', 'Cross-device and hostile input tests', 'Test at phone, tablet and desktop widths with touch and keyboard, and test hostile input: script payloads, SQL fragments, operator keys, very long text, emoji and control characters.'),
    ],
    data: [
        req(GROUP.arch, 'must-have', 'Integration follows the project', INTEGRATION_FOLLOWS),
        req(GROUP.functional, 'must-have', 'Global theme and responsiveness', THEME_STYLES + ' The layout adapts to phone, tablet and desktop through the global responsive rules, with wide content scrolling inside its own container.'),
        req(GROUP.security, 'must-have', 'Validated and scoped requests', 'Validate every request parameter on the data side, scope results to the current user or tenant, allow only whitelisted fields for sorting and filtering, and cap page size.'),
    ],
    loading: [
        req(GROUP.arch, 'must-have', 'Integration follows the project', INTEGRATION_FOLLOWS),
        req(GROUP.functional, 'must-have', 'Global theme and responsiveness', THEME_STYLES + ' It looks correct on every screen size and respects the reduced-motion preference.'),
    ],
    action: [
        req(GROUP.arch, 'must-have', 'Integration follows the project', INTEGRATION_FOLLOWS),
        req(GROUP.functional, 'must-have', 'Global theme and responsiveness', THEME_STYLES + ' It fits small screens (full width sheet) and large screens (centered dialog).'),
    ],
    realtime: [
        req(GROUP.arch, 'must-have', 'Integration follows the project', 'Use the realtime path the project already has (socket, server-sent events, IPC events or push) behind one module with one subscription interface. The components only subscribe to typed events and never know the transport.'),
    ],
    config: [],
};

const TEXT = {
    web: {
        integration: {
            input: 'Call the existing API through the shared HTTP client (the request pipeline) with an abort signal, a configured base address and a typed response envelope.',
            data: 'Fetch through the shared HTTP client and the server-state cache using page, size, sort and filter parameters and the shared list envelope. Keep the query state in the URL so back and forward navigation works.',
            realtime: 'Connect from the browser with one managed connection per tab, using secure transport and cookie or ticket authentication.',
            action: 'Send the confirmed action through the shared HTTP client with an idempotency key and wait for the response before closing.',
            loading: 'Use a lightweight readiness request through the shared HTTP client. For hosting that sleeps, send it as early as possible and poll with backoff.',
            config: 'Use the framework mode flag or a small cross-platform loader. Only variables with the public prefix reach the browser bundle.',
        },
        security: {
            input: 'Web security: the server allows only the listed origins (CORS, never a wildcard when credentials are used), uses secure same-site cookies or short-lived tokens, protects state-changing requests against CSRF, sets security headers and a strict content security policy, and rate-limits the endpoint.',
            data: 'Authorize every request on the server, scope data by user or tenant, allow whitelisted fields only, cap page size, apply CORS and CSRF rules, and never expose internal ids or error details.',
            realtime: 'Verify the Origin header on the server, authenticate with a short-lived ticket, authorize per topic, and limit connections and message size.',
            action: 'The server authenticates, authorizes and validates the request and applies CSRF protection. The confirmation is a user experience feature, not protection.',
            loading: 'The readiness endpoint returns only a status, is rate-limited and needs no credentials. Protected content is never sent before the session is checked.',
            config: 'Never expose server secrets to the browser, and check the built bundle for secret values in CI.',
        },
        device: 'Responsive for browsers: mobile-first breakpoints, works at 200 percent zoom, supports mouse, touch and keyboard, and respects the browser back button.',
    },
    desktop: {
        integration: {
            input: 'Call the backend through a preload bridge: expose one narrow, typed function with contextBridge and handle it with ipcMain.handle in the main process. No direct ipcRenderer, no Node access in the renderer, and no local HTTP server unless the project already has one.',
            data: 'Load data through IPC handlers that return the shared list envelope, paginated and bounded. Heavy work goes to a worker or separate process so the window never freezes. Local files and local databases are accessed only in the main process.',
            realtime: 'Use IPC events from the main process behind one subscription module with unsubscribe, instead of opening sockets from the renderer, unless the project already uses sockets.',
            action: 'Send the confirmed action through an invoke handler. Destructive file or system actions can additionally use a native confirmation dialog from the main process.',
            loading: 'The first-load gate waits for the ready signal of the main process (services, local database, local server) over IPC. Use an HTTP wake request only when the app also uses a remote server.',
            config: 'Load env in the main process from the mode set by the npm script, build one validated config, and expose only the public part to the renderer through the preload bridge.',
        },
        security: {
            input: 'Desktop security: context isolation on, node integration off, sandbox on. Allow-list IPC channels, validate and sanitize every payload in the main process (never trust the renderer), and verify the sender frame. Never build shell commands, file paths or queries from the input. CORS is not needed for IPC, but remote calls use HTTPS only with a restricted content security policy.',
            data: 'Validate parameters in the main process, whitelist fields, use parameterized queries on the local database, keep paths inside allowed folders, and never return file system details or stack traces to the renderer.',
            realtime: 'Allow only listed event channels, validate event payloads, and detach listeners when a window closes.',
            action: 'The main process validates and authorizes the action itself. The renderer confirmation is not protection.',
            loading: 'Send only a status through IPC, never paths, versions or error details.',
            config: 'Secrets never enter the renderer or the packaged app files. Store user secrets with the OS keychain or safeStorage.',
        },
        device: 'Responsive for desktop windows: works when the window is resized or snapped to a small width, supports high-DPI screens and multiple monitors, keyboard shortcuts and visible focus.',
    },
    mobile: {
        integration: {
            input: 'Use the existing data layer: the API client for online data or the local database for offline data, both behind the same function. Apply request timeouts and cancellation.',
            data: 'Use paginated or cursor-based requests with small payloads, caching and retry with backoff, handle poor networks, and keep a local copy where offline use is needed.',
            realtime: 'Use one managed connection that pauses in the background, reconnects on foreground and network changes, and falls back to push notifications or sync while the app is suspended.',
            action: 'Send the confirmed action with an idempotency key, queue it when offline only if it is safe to queue, and show the final result.',
            loading: 'Show the first-load state while the app restores the session and checks the server. Handle no network and a waking server with a clear retry.',
            config: 'Use build profiles or schemes per environment (development, staging, production) selected by the build command. Only public values are placed in the app.',
        },
        security: {
            input: 'Mobile security: HTTPS only with certificate pinning where required, tokens in the secure keychain or keystore (never plain storage), no secrets in the app bundle, and full validation on the server because the client can be modified. CORS does not apply to native clients but does for a web view or a web build.',
            data: 'Authorize on the server, scope data by user, keep payloads minimal, keep personal data out of logs, and encrypt locally cached sensitive data.',
            realtime: 'Authenticate with a short-lived token from the secure store, authorize per topic, and close the connection on logout.',
            action: 'The server authorizes and validates the request. Consider biometric or device confirmation for high-risk actions.',
            loading: 'Do not show protected screens until the session is verified. The readiness response contains only a status.',
            config: 'Anything inside the app bundle can be read by users, so it must never be a secret. Real secrets stay on the server.',
        },
        device: 'Responsive for devices: phones and tablets, portrait and landscape, safe areas and notches, on-screen keyboard avoidance, 44px minimum touch targets and platform text scaling.',
    },
};

function shortOf(id) {
    const t = APP_TYPES.find((x) => x.id === id);
    return t ? t.short : id;
}

function extraRows(kind) {
    const rows = (COMMON[kind] || []).map((r) => Object.assign({}, r));
    for (const id of SPECIFIC_TYPES) {
        const t = TEXT[id];
        const short = shortOf(id);
        if (t.integration[kind]) {
            rows.push(req(GROUP.integration, 'must-have', 'Integration (' + short + ')', t.integration[kind], [id]));
        }
        if (t.security[kind]) {
            rows.push(req(GROUP.security, 'must-have', 'Security (' + short + ')', t.security[kind], [id]));
        }
        if ((kind === 'input' || kind === 'data') && t.device) {
            rows.push(req(GROUP.ux, 'standard', 'Device behavior (' + short + ')', t.device, [id]));
        }
    }
    return rows;
}

function applyAppTypes(presets) {
    return presets.map((p) => {
        const base = p.requirements.map((r) => Object.assign({ types: [] }, r));
        const kind = KIND_OF[p.key];
        if (!kind) return Object.assign({}, p, { requirements: base });
        return Object.assign({}, p, { requirements: base.concat(extraRows(kind)) });
    });
}

module.exports = { APP_TYPES, APP_TYPE_IDS, applyAppTypes };