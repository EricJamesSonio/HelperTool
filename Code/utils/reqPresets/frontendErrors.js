const { def } = require('./helpers.js');

const frontendErrors = def('frontend-error-handling', 'Error Handling: Frontend', 'How the client catches, normalizes, shows and reports errors, built on the error format the backend returns.', 'Globals', 'Errors', ['errors', 'frontend', 'boundaries', 'messages'], [], ['backend-error-logging', 'states-feedback', 'form-validation', 'security-layer'], [
    ['a', 'm', 'Follow the project', 'Inspect how errors are already handled on the client (boundaries, handlers, notifications) and follow it. Build only what is missing.'],
    ['e', 'm', 'One error shape', 'Convert every failure (network, timeout, server response, thrown error) into one client error object with a code, a safe message, a status, field errors and a request id. Map it from the shared backend error format. Components never read raw responses.'],
    ['e', 'm', 'Error boundaries', 'Provide an app-level boundary and route-level boundaries so one failing page or section never blanks the whole app. Each boundary shows a safe message, a retry and a way back.'],
    ['e', 'm', 'Global safety net', 'Listen for uncaught errors and unhandled promise rejections, normalize them with the same error object, and show a generic message instead of a blank screen.'],
    ['e', 'm', 'Safe messages', 'Show friendly messages from one central message map keyed by error code. Never show stack traces, raw server text, ids or internal details to the user.'],
    ['u', 's', 'Choose the right feedback', 'Use inline field errors for validation, a toast for transient failures, a section error state with retry for failed data, and a full page for fatal and not-found cases. Reuse the shared toast and error state components.'],
    ['e', 's', 'Auth and access errors', 'Handle 401 by clearing the session and redirecting to sign in with a return path, 403 with a not-allowed page and 404 with a not-found page. Never show them as empty states.'],
    ['e', 's', 'Network and retry', 'Detect offline and timeouts, show a clear message, retry safe requests with backoff and a limit, and never retry non-idempotent actions automatically.'],
    ['f', 's', 'Form errors', 'Map server field errors back to their fields and keep the user input after a failure.'],
    ['s', 's', 'Reporting without leaks', 'Send client errors to the backend or a reporting service with the code, route, app version and request id. Strip personal data, tokens and form values, and rate-limit the reports.'],
    ['a', 's', 'One errors module', 'Keep normalization, the message map, boundaries and reporting in one global errors folder. Features import from it and never build their own handling.'],
    ['x', 's', 'Accessible errors', 'Announce errors through live regions, move focus to the error summary or heading, and never rely on color alone.'],
    ['t', 'd', 'Tests', 'Cover boundary fallback, unhandled rejection, 401, 403, 404, offline, field errors and the message map.'],
    ['c', 'm', 'Verified', 'Any failure shows a safe message in the right place, no screen goes blank, and no internal detail reaches the user.'],
]);

module.exports = [frontendErrors];