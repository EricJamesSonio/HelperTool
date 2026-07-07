import { genId } from './workspaceStore.js';

/* ─── Preset Kits ─────────────────────────────────────────────────────── */

const DEFAULT_KITS = [
  {
    name: 'Security Pipeline',
    color: '#f87171',
    description: 'Security layers that protect your application from common threats',
    items: [
      {
        name: 'Input Validation & Sanitization',
        description: 'Validate and sanitize all user inputs before processing',
        details: 'Placed as global middleware chain before route handlers. Schema validation (Joi/Zod) at route level; XSS sanitization on all string inputs; SQL injection prevention via parameterized queries. Never trust raw request body/query/params.',
        children: [
          { name: 'Schema Validation (Joi/Zod)', description: 'Define request schemas and validate at the route level', details: 'Create validation schemas for every endpoint. Use a validation middleware that takes a schema and validates req.body/params/query. Return 400 with detailed error messages on failure.', checked: false },
          { name: 'XSS Protection', description: 'Sanitize user-generated content to prevent XSS', details: 'Use DOMPurify on server-rendered HTML, helmet with CSP headers. For APIs, ensure JSON responses properly encode special characters. Never inject raw user input into HTML.', checked: false },
          { name: 'SQL Injection Prevention', description: 'Use parameterized queries or ORM to prevent injection', details: 'Always use parameterized queries or an ORM that handles escaping. Never concatenate user input into SQL strings. Use query builders (Knex, Prisma, TypeORM) that enforce safe patterns.', checked: false },
        ],
      },
      {
        name: 'Authentication',
        description: 'Verify the identity of users accessing your system',
        details: 'Authentication middleware runs before authorization checks. It extracts credentials from the request (JWT from Authorization header, session cookie, API key) and attaches the verified user to req.user.',
        children: [
          { name: 'JWT Strategy', description: 'Token-based stateless authentication', details: 'Issue JWTs on login, verify on each request via middleware. Store refresh tokens in httpOnly cookies. Use RS256 or EdDSA for signing. Set short expiry (15min) on access tokens, longer on refresh.', checked: false },
          { name: 'Session-based Auth', description: 'Server-side session storage with cookies', details: 'Use express-session with a secure store (Redis, DB). Session ID stored in httpOnly, secure, sameSite cookie. Regenerate session ID on login to prevent fixation attacks.', checked: false },
          { name: 'OAuth / SSO Integration', description: 'Delegate auth to providers like Google, GitHub', details: 'Use Passport.js or similar strategy-based library. Store provider + providerId in user model. Handle callback redirect, state parameter for CSRF protection, and token exchange.', checked: false },
        ],
      },
      {
        name: 'Authorization (Access Control)',
        description: 'Control what authenticated users can do',
        details: 'Runs after authentication. Middleware checks if the authenticated user has the required role/permission for the requested resource. Throw 403 if not authorized.',
        children: [
          { name: 'Role-Based Access Control', description: 'Assign roles to users, check permissions by role', details: 'Define roles (admin, user, moderator) each with a set of permissions. Middleware checks if user.role has the required permission for the route. Store role hierarchy for inheritance.', checked: false },
          { name: 'Permission Middleware', description: 'Fine-grained permission checks per endpoint', details: 'Create a can(permission) middleware that checks user.permissions array. Apply to individual routes. Useful for apps where users have granular, role-independent permissions.', checked: false },
          { name: 'Resource Ownership', description: 'Ensure users can only access their own resources', details: 'When accessing /users/:id/posts/:postId, verify that the post belongs to the user. Implement in route handler or via a policy/ability class. Return 404 (not 403) to avoid leaking existence.', checked: false },
        ],
      },
      {
        name: 'Rate Limiting & Throttling',
        description: 'Prevent abuse by limiting request frequency',
        details: 'Applied as global or per-route middleware. Use in-memory store for single-instance, Redis for distributed. Return 429 with Retry-After header on limit exceeded.',
        children: [
          { name: 'IP-based Rate Limiting', description: 'Limit requests per IP address', details: 'Apply globally: e.g., 100 requests per 15 min per IP. Use express-rate-limit or similar. Whitelist trusted IPs (health checks, webhooks).', checked: false },
          { name: 'User-based Rate Limiting', description: 'Limit requests per authenticated user', details: 'Apply to auth-required endpoints. Use user ID as key. Stricter limits on sensitive endpoints (login: 5/min, API: 1000/min).', checked: false },
          { name: 'Slow Down on Suspicious Activity', description: 'Gradually slow down repeated failures', details: 'Track failed login attempts per IP. After 3 failures, delay response by 1s, after 5 by 5s. This frustrates brute-force without locking legitimate users.', checked: false },
        ],
      },
      {
        name: 'HTTP Security Headers',
        description: 'Set security-related HTTP headers for the application',
        details: 'Applied as the outermost middleware. Set headers on every response before route handlers run.',
        children: [
          { name: 'Helmet Middleware', description: 'Set common security headers (CSP, HSTS, X-Frame-Options)', details: 'Use helmet() in Express. Configure CSP policy restrictively: script-src self, style-src self. Use nonces for inline scripts if needed.', checked: false },
          { name: 'CORS Configuration', description: 'Control cross-origin requests', details: 'Configure cors() with specific allowed origins (not * for production). Set allowed methods, headers, and credentials. Handle preflight OPTIONS requests.', checked: false },
          { name: 'CSRF Protection', description: 'Protect against cross-site request forgery', details: 'Use csurf or double-submit cookie pattern. Generate CSRF token, send to client via cookie, validate on state-changing requests. Disabled for public APIs using token auth.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'Middleware Pipeline',
    color: '#60a5fa',
    description: 'HTTP middleware layers for processing every request',
    items: [
      {
        name: 'Request Parsing & Processing',
        description: 'Parse incoming request bodies and metadata',
        details: 'Applied as global middleware at the app level, before route handlers. Order matters: security headers → parse body → parse cookies → compress → log → routes.',
        children: [
          { name: 'Body Parser', description: 'Parse JSON, URL-encoded, and multipart bodies', details: 'Use express.json() and express.urlencoded(). Configure size limits (e.g., 1mb JSON, 10mb multipart). Add raw parser for webhook endpoints with signature verification.', checked: false },
          { name: 'Cookie Parser', description: 'Parse Cookie header into req.cookies', details: 'Use cookie-parser with a secret for signed cookies. Parse before session middleware so session store can use the session cookie.', checked: false },
          { name: 'Query String Parser', description: 'Parse and validate query parameters', details: 'Express parses query strings automatically. Add middleware to parse pagination (?page=1&limit=20), sort (?sort=-createdAt), and filter (?status=active) into structured objects.', checked: false },
        ],
      },
      {
        name: 'Logging & Observability',
        description: 'Log requests for debugging, monitoring, and audit',
        details: 'Request logger should be early in the middleware chain to capture all requests. Attach request ID to every log line for correlation.',
        children: [
          { name: 'Request Logger', description: 'Log every incoming request', details: 'Use morgan for HTTP logging, or a custom logger that captures method, URL, status, duration, user ID. Log at info level. Sanitize sensitive fields (password, token) before logging.', checked: false },
          { name: 'Structured Logging', description: 'Log in JSON format for log aggregation', details: 'Use winston or pino. Configure JSON output, attach request ID, service name, environment. Write to stdout in production, file in development.', checked: false },
          { name: 'Audit Trail', description: 'Log data-modifying operations for compliance', details: 'Create middleware that logs all POST/PUT/PATCH/DELETE requests with user ID, resource, action, diff. Store in a separate audit_logs table. Include timestamp and IP.', checked: false },
        ],
      },
      {
        name: 'Error Handling',
        description: 'Centralized error handling for consistent responses',
        details: 'Error-handling middleware is the LAST middleware in the chain. It has 4 parameters (err, req, res, next). All errors thrown or passed via next(err) end up here.',
        children: [
          { name: 'Global Error Handler', description: 'Catch-all error middleware', details: 'app.use((err, req, res, next) => { ... }). Determine status from err.statusCode || 500. Log error details, return sanitized response (no stack trace in production).', checked: false },
          { name: 'AppError Class', description: 'Custom error class with status code and metadata', details: 'class AppError extends Error { constructor(message, statusCode, code) { super(message); this.statusCode = statusCode; this.code = code; } }. Throw from anywhere in route handlers.', checked: false },
          { name: '404 Handler', description: 'Catch-all for unmatched routes', details: 'app.use(\'*\', (req, res) => { res.status(404).json({ error: \'Not Found\', code: \'ROUTE_NOT_FOUND\' }) }). Placed after all route definitions but before error handler.', checked: false },
          { name: 'Async Error Wrapper', description: 'Catch errors in async route handlers', details: 'Create a asyncHandler(fn) wrapper that returns (req, res, next) => fn(req, res, next).catch(next). This eliminates try/catch blocks in every async route.', checked: false },
        ],
      },
      {
        name: 'Compression & Response Optimization',
        description: 'Optimize response size and delivery',
        details: 'Compression middleware should be placed before routes but after body parsers. Consider Brotli for better compression ratios on text responses.',
        children: [
          { name: 'Gzip / Brotli Compression', description: 'Compress text responses', details: 'Use compression middleware. Enable Brotli if supported. Compress JSON, HTML, CSS, JS. Skip compression for already-compressed formats (images, videos).', checked: false },
          { name: 'Static File Caching', description: 'Cache headers for static assets', details: 'Set Cache-Control and ETag headers for static files. Use express.static with maxAge. Version filenames with hashes for long-term caching.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'Database Layer',
    color: '#34d399',
    description: 'Data access, modeling, and connection management',
    items: [
      {
        name: 'ORM / ODM Setup',
        description: 'Set up the data access layer with proper tooling',
        details: 'Chosen based on project stack (TypeORM/Prisma for SQL, Mongoose for MongoDB). Configured early in app startup, before routes are registered.',
        children: [
          { name: 'Schema / Model Definitions', description: 'Define data models with validation', details: 'Define all entity schemas with proper types, required fields, defaults, indexes, and relations. Use migrations or schema sync in development.', checked: false },
          { name: 'Migrations Setup', description: 'Track and apply database schema changes', details: 'Initialize migration system (TypeORM migrations, Prisma migrate, knex migrate). Create initial migration. Run migrations on app start or via CI/CD pipeline.', checked: false },
          { name: 'Seeds & Factories', description: 'Sample data for development and testing', details: 'Create seed files with realistic test data. Use factories (faker.js) for generating large datasets. Reset database between test runs.', checked: false },
        ],
      },
      {
        name: 'Query Optimization',
        description: 'Optimize data access for performance',
        details: 'Apply at the data access layer after models are defined. Monitor query performance and add optimizations as needed during development.',
        children: [
          { name: 'Indexes', description: 'Add database indexes for frequent queries', details: 'Index foreign keys, frequently filtered columns, and sort fields. Use composite indexes for multi-field queries. Avoid over-indexing (write performance cost).', checked: false },
          { name: 'Eager Loading / Relations', description: 'Efficiently load related data', details: 'Use ORM eager loading (Include, Populate) to avoid N+1 queries. Limit depth and select only needed fields. Use raw joins for complex cases.', checked: false },
          { name: 'Pagination', description: 'Paginate large result sets', details: 'Implement cursor-based pagination for APIs (more efficient than offset). Set max page size. Return pagination metadata (next cursor, total, hasMore).', checked: false },
        ],
      },
      {
        name: 'Connection Management',
        description: 'Manage database connections reliably',
        details: 'Configured at app startup, before any queries. Connection pooling is critical for production.',
        children: [
          { name: 'Connection Pool', description: 'Configure connection pool size and timeouts', details: 'Set pool size based on workload (typically 10-20 connections). Configure idle timeout, connection timeout, and max queue length. Monitor pool usage.', checked: false },
          { name: 'Retry & Reconnection', description: 'Handle transient database failures', details: 'Implement retry logic with exponential backoff for connection failures. Handle connection drops gracefully. Health-check endpoint should verify DB connectivity.', checked: false },
          { name: 'Transaction Management', description: 'Use transactions for atomic operations', details: 'Wrap related writes in transactions. Use ORM transaction API or raw BEGIN/COMMIT/ROLLBACK. Set appropriate isolation level. Handle deadlock retries.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'API Architecture',
    color: '#fbbf24',
    description: 'Structure and conventions for your API endpoints',
    items: [
      {
        name: 'Routing Structure',
        description: 'Organize routes in a maintainable structure',
        details: 'Applied at app bootstrap. Routes are grouped by resource/domain. Versioning considered from day one.',
        children: [
          { name: 'Versioned Routes', description: 'Prefix routes with API version', details: 'Use /api/v1/ prefix. Mount versioned routers in app.js. Keep old versions alive with deprecation headers until migration is complete.', checked: false },
          { name: 'Route Groups', description: 'Group related routes under a common path', details: 'Use Router() for each resource (users, posts, auth). Group by domain, not by HTTP method. Apply middleware (auth, validation) at the router level.', checked: false },
          { name: 'Resource Controllers', description: 'Handlers organized by resource', details: 'Each route file exports handler functions. Use the controller pattern: controller calls service layer. Keep route files thin — logic goes in services.', checked: false },
        ],
      },
      {
        name: 'Request Validation',
        description: 'Validate request structure and types',
        details: 'Applied as route-level middleware. Validates before controller logic runs. Returns 400 with field-level errors.',
        children: [
          { name: 'Input Schemas', description: 'Define expected request shapes', details: 'Use Zod/Joi/Yup to define schemas for body, params, query. Validate on every request. Return clear error messages with field paths.', checked: false },
          { name: 'Type Checking & Coercion', description: 'Ensure correct types, coerce when safe', details: 'Parse query strings into numbers/booleans. Validate enums (status, sort). Strip unknown fields to prevent mass assignment.', checked: false },
          { name: 'File Upload Validation', description: 'Validate uploaded file types and sizes', details: 'Use multer for multipart parsing. Validate MIME type, file size, and count. Store files securely (sanitize filename, use UUID names). Scan for malware if needed.', checked: false },
        ],
      },
      {
        name: 'Response Formatting',
        description: 'Consistent response structure across all endpoints',
        details: 'Applied as a response helper or middleware. Ensures API consumers always get predictable response shapes.',
        children: [
          { name: 'Consistent Envelope', description: 'Wrap responses in a standard envelope', details: 'Define envelope: { success: boolean, data: T, meta: { page, limit, total }, error: { code, message } }. Use a success/error response helper in every route.', checked: false },
          { name: 'Pagination Meta', description: 'Include pagination metadata in list responses', details: 'meta: { page, limit, total, totalPages, hasNextPage, hasPrevPage }. Use offset-based for simple UIs, cursor-based for real-time/reliable pagination.', checked: false },
          { name: 'Error Shape', description: 'Standard error response format', details: 'error: { code: string, message: string, details?: any }. Map HTTP status codes to error codes (VALIDATION_ERROR, NOT_FOUND, UNAUTHORIZED). Include field-level errors for 400 responses.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'Testing Infrastructure',
    color: '#c0c0c0',
    description: 'Comprehensive testing at all levels of the stack',
    items: [
      {
        name: 'Unit Tests',
        description: 'Test individual functions and modules in isolation',
        details: 'Run on every commit in CI. Fast (< 1ms per test). No external dependencies — mock everything.',
        children: [
          { name: 'Test Runner Setup', description: 'Configure Jest/Vitest with project settings', details: 'Setup test runner with coverage thresholds, module aliases, and global mocks. Use --watch mode during development.', checked: false },
          { name: 'Mocking Strategy', description: 'Mock external dependencies consistently', details: 'Use jest.mock or vi.mock for modules. Create __mocks__ directory. Mock database calls, HTTP requests, and file system operations.', checked: false },
          { name: 'Coverage Targets', description: 'Set minimum coverage thresholds', details: 'Set targets: 80% lines, 70% branches. Use coverage reports in CI. Focus on business logic coverage — lower targets for UI/glue code.', checked: false },
        ],
      },
      {
        name: 'Integration Tests',
        description: 'Test modules working together with real dependencies',
        details: 'Use test database (in-memory or containerized). Run after unit tests in CI. Slower but higher confidence.',
        children: [
          { name: 'API Endpoint Tests', description: 'Test HTTP endpoints end-to-end', details: 'Use supertest to call Express app. Test success and error scenarios. Validate response status, body shape, and headers. Use beforeAll for DB setup.', checked: false },
          { name: 'Database Integration Tests', description: 'Test database queries and transactions', details: 'Use testcontainers or SQLite in-memory. Run migrations before tests. Test CRUD operations, edge cases (nulls, empty results), and constraint violations.', checked: false },
          { name: 'Auth Flow Tests', description: 'Test login, register, token refresh', details: 'Test complete auth flows: registration → email verification → login → token refresh → logout. Test invalid credentials, expired tokens, and revoked tokens.', checked: false },
        ],
      },
      {
        name: 'E2E Tests',
        description: 'Test the complete system from user perspective',
        details: 'Run in CI on staging environment. Slower but gives highest confidence. Can be flaky — add retry logic.',
        children: [
          { name: 'Critical Path Tests', description: 'Test the most important user journeys', details: 'Identify 3-5 critical user paths. Test them end-to-end with real browser (Playwright/Cypress). Run on every PR merge to main.', checked: false },
          { name: 'CI Pipeline Integration', description: 'Automated test execution in CI', details: 'Configure GitHub Actions / GitLab CI to run tests on push. Parallelize test files. Upload coverage reports. Fail build on below-threshold coverage.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'DevOps & Tooling',
    color: '#a78bfa',
    description: 'Infrastructure and automation for reliable delivery',
    items: [
      {
        name: 'Environment Configuration',
        description: 'Manage configuration across environments',
        details: 'Configured at app startup. Secrets never committed to code. Validated on boot.',
        children: [
          { name: 'Environment Variables', description: 'Use env vars for all configuration', details: 'Use dotenv for local dev. Validate all required env vars on startup (fail fast). Never hardcode secrets. Use .env.example as documentation.', checked: false },
          { name: 'Config Validation', description: 'Validate config on app boot', details: 'Create a config module that reads env vars and validates them. Use Zod/Joi schema. Log missing or invalid config at startup. Crash if critical config is missing.', checked: false },
        ],
      },
      {
        name: 'Containerization',
        description: 'Package application for consistent deployment',
        details: 'Create Docker setup early in development. Test locally with the same image used in production.',
        children: [
          { name: 'Dockerfile', description: 'Production-ready Docker image', details: 'Multi-stage build: build stage with dev deps, production stage with only runtime deps. Use distroless base for security. Set non-root user. Include healthcheck.', checked: false },
          { name: 'Docker Compose', description: 'Local development environment', details: 'Define services: app, database, cache, queue. Use volumes for hot-reload. Set up .env for per-developer config. Include seed data script.', checked: false },
          { name: 'Health Checks', description: 'Implement health check endpoints', details: 'GET /health returns { status, uptime, version, dbConnected }. Used by orchestrator (K8s, Docker) for liveness/readiness probes. Check all external dependencies.', checked: false },
        ],
      },
      {
        name: 'CI / CD Pipeline',
        description: 'Automate build, test, and deployment',
        details: 'Set up in CI provider (GitHub Actions, GitLab CI). Every PR triggers build + test. Deploy on merge to main.',
        children: [
          { name: 'Lint & Format Check', description: 'Enforce code quality in CI', details: 'Run ESLint and Prettier --check in CI. Fail on warnings. Use consistent config across team. Pre-commit hooks for instant feedback.', checked: false },
          { name: 'Build & Test Stage', description: 'Build and run all tests', details: 'Steps: install deps, build, run unit tests, run integration tests, build Docker image. Cache node_modules between runs. Parallelize test execution.', checked: false },
          { name: 'Deploy Stage', description: 'Automated deployment on main branch', details: 'Deploy to staging on PR merge. Deploy to production on tag or manual trigger. Use blue-green or canary deployment. Rollback on health check failure.', checked: false },
        ],
      },
    ],
  },
];

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function _deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function _findItem(items, itemId) {
  for (const item of items) {
    if (item.id === itemId) return item;
    if (item.children) {
      const found = item.children.find(c => c.id === itemId);
      if (found) return found;
    }
  }
  return null;
}

function _assignIds(obj) {
  obj.id = genId();
  if (obj.children) obj.children.forEach(_assignIds);
}

function _isItemChecked(item) {
  if (!item.children || item.children.length === 0) return !!item.checked;
  return item.children.length > 0 && item.children.every(_isItemChecked);
}

function _recomputeChecked(items) {
  for (const item of items) {
    if (item.children) {
      _recomputeChecked(item.children);
    }
  }
}

/* ─── Public API ──────────────────────────────────────────────────────── */

export function getDefaultKits() {
  const kits = _deepClone(DEFAULT_KITS);
  for (const kit of kits) {
    kit.id = genId();
    kit.collapsed = false;
    for (const item of kit.items) {
      _assignIds(item);
    }
  }
  return kits;
}

export function toggleItem(project, kitId, itemId) {
  const kit = project.buildKits?.find(k => k.id === kitId);
  if (!kit) return false;
  const item = _findItem(kit.items, itemId);
  if (!item) return false;
  if (item.children && item.children.length > 0) return false;
  item.checked = !item.checked;
  return true;
}

export function addKit(project, kitData) {
  if (!Array.isArray(project.buildKits)) project.buildKits = [];
  const kit = _deepClone(kitData);
  kit.id = genId();
  kit.collapsed = false;
  if (kit.items) kit.items.forEach(_assignIds);
  project.buildKits.push(kit);
  return kit;
}

export function removeKit(project, kitId) {
  if (!Array.isArray(project.buildKits)) return false;
  const idx = project.buildKits.findIndex(k => k.id === kitId);
  if (idx < 0) return false;
  project.buildKits.splice(idx, 1);
  return true;
}

export function addItemToKit(project, kitId, parentId, itemData) {
  const kit = project.buildKits?.find(k => k.id === kitId);
  if (!kit) return null;
  const item = _deepClone(itemData);
  _assignIds(item);
  if (parentId) {
    const parent = _findItem(kit.items, parentId);
    if (!parent) return null;
    if (!parent.children) parent.children = [];
    parent.children.push(item);
  } else {
    kit.items.push(item);
  }
  return item;
}

export function removeItem(project, kitId, itemId) {
  const kit = project.buildKits?.find(k => k.id === kitId);
  if (!kit) return false;
  for (let i = 0; i < kit.items.length; i++) {
    if (kit.items[i].id === itemId) { kit.items.splice(i, 1); return true; }
    if (kit.items[i].children) {
      const ci = kit.items[i].children.findIndex(c => c.id === itemId);
      if (ci >= 0) { kit.items[i].children.splice(ci, 1); return true; }
    }
  }
  return false;
}

export function updateItemDetails(project, kitId, itemId, details) {
  const kit = project.buildKits?.find(k => k.id === kitId);
  if (!kit) return false;
  const item = _findItem(kit.items, itemId);
  if (!item) return false;
  item.details = details;
  return true;
}

export function getKitProgress(kit) {
  let total = 0;
  let done = 0;
  function walk(items) {
    for (const item of items) {
      if (!item.children || item.children.length === 0) {
        total++;
        if (item.checked) done++;
      } else {
        walk(item.children);
      }
    }
  }
  if (kit.items) walk(kit.items);
  return { done, total };
}

export function isItemChecked(item) {
  return _isItemChecked(item);
}

export function collapseKit(project, kitId, collapsed) {
  const kit = project.buildKits?.find(k => k.id === kitId);
  if (!kit) return;
  kit.collapsed = collapsed;
}

export function ensureDefaultKits(project) {
  if (Array.isArray(project.buildKits) && project.buildKits.length > 0) return;
  project.buildKits = getDefaultKits();
}
