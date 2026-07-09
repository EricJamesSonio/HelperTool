import { genId } from './workspaceStore.js';

/* ─── Preset Kits ─────────────────────────────────────────────────────── */

const DEFAULT_KITS = [
  {
    name: 'Security Pipeline',
    color: '#f87171',
    category: 'backend',
    description: 'Security layers that protect your application from common threats',
    items: [
      {
        name: 'Input Validation & Sanitization',
        description: 'Validate and sanitize all user inputs before processing',
        stage: 'early',
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
        stage: 'early',
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
        stage: 'early',
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
        stage: 'mid',
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
        stage: 'early',
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
    category: 'backend',
    description: 'HTTP middleware layers for processing every request',
    items: [
      {
        name: 'Request Parsing & Processing',
        description: 'Parse incoming request bodies and metadata',
        stage: 'early',
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
        stage: 'mid',
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
        stage: 'early',
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
        stage: 'late',
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
    category: 'backend',
    description: 'Data access, modeling, and connection management',
    items: [
      {
        name: 'ORM / ODM Setup',
        description: 'Set up the data access layer with proper tooling',
        stage: 'early',
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
        stage: 'mid',
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
        stage: 'early',
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
    category: 'backend',
    description: 'Structure and conventions for your API endpoints',
    items: [
      {
        name: 'Routing Structure',
        description: 'Organize routes in a maintainable structure',
        stage: 'early',
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
        stage: 'mid',
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
        stage: 'mid',
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
    category: 'backend',
    description: 'Comprehensive testing at all levels of the stack',
    items: [
      {
        name: 'Unit Tests',
        description: 'Test individual functions and modules in isolation',
        stage: 'mid',
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
        stage: 'mid',
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
        stage: 'late',
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
    category: 'backend',
    description: 'Infrastructure and automation for reliable delivery',
    items: [
      {
        name: 'Environment Configuration',
        description: 'Manage configuration across environments',
        stage: 'early',
        details: 'Configured at app startup. Secrets never committed to code. Validated on boot.',
        children: [
          { name: 'Environment Variables', description: 'Use env vars for all configuration', details: 'Use dotenv for local dev. Validate all required env vars on startup (fail fast). Never hardcode secrets. Use .env.example as documentation.', checked: false },
          { name: 'Config Validation', description: 'Validate config on app boot', details: 'Create a config module that reads env vars and validates them. Use Zod/Joi schema. Log missing or invalid config at startup. Crash if critical config is missing.', checked: false },
        ],
      },
      {
        name: 'Containerization',
        description: 'Package application for consistent deployment',
        stage: 'mid',
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
        stage: 'late',
        details: 'Set up in CI provider (GitHub Actions, GitLab CI). Every PR triggers build + test. Deploy on merge to main.',
        children: [
          { name: 'Lint & Format Check', description: 'Enforce code quality in CI', details: 'Run ESLint and Prettier --check in CI. Fail on warnings. Use consistent config across team. Pre-commit hooks for instant feedback.', checked: false },
          { name: 'Build & Test Stage', description: 'Build and run all tests', details: 'Steps: install deps, build, run unit tests, run integration tests, build Docker image. Cache node_modules between runs. Parallelize test execution.', checked: false },
          { name: 'Deploy Stage', description: 'Automated deployment on main branch', details: 'Deploy to staging on PR merge. Deploy to production on tag or manual trigger. Use blue-green or canary deployment. Rollback on health check failure.', checked: false },
        ],
      },
    ],
  },
  // ── Frontend ─────────────────────────────────────────────────────
  {
    name: 'UI Foundation',
    color: '#38bdf8',
    category: 'frontend',
    description: 'Build tooling, project structure, and environment setup for the frontend',
    items: [
      {
        name: 'Bundler & Build Config',
        description: 'Set up the build pipeline with bundler, transpilation, and asset handling',
        stage: 'early',
        details: 'Configure Vite/Rspack/Webpack with React/Vue/Svelte preset. Set up TypeScript, PostCSS, CSS modules. Configure HMR for development. Set up path aliases and environment variable injection.',
        children: [
          { name: 'Vite / Rspack Setup', description: 'Configure the bundler with framework preset', details: 'Initialize with create-vite or manual config. Set resolve aliases, CSS preprocessing, asset rules. Enable HMR and source maps in dev mode.', checked: false },
          { name: 'TypeScript Configuration', description: 'Strict TS config with path aliases and declarations', details: 'Enable strict mode, set jsx/react-jsx, configure outDir, rootDir. Add path aliases matching bundler config. Generate declarations for library builds.', checked: false },
          { name: 'Environment Variables', description: 'Typed env vars with validation', details: 'Use VITE_ prefix convention. Define env schema via Zod. Create typed useEnv hook. Set defaults for local dev. Document required vars in .env.example.', checked: false },
        ],
      },
      {
        name: 'Linting & Formatting',
        description: 'Enforce code quality and consistency across the frontend codebase',
        stage: 'early',
        details: 'Configure ESLint with framework-specific rules, Prettier for formatting, and lint-staged for pre-commit enforcement. Integrate with IDE and CI pipeline.',
        children: [
          { name: 'ESLint Config', description: 'Framework-aware lint rules with auto-fix', details: 'Extend eslint-plugin-react/hooks/jsx-a11y or Vue/Svelte equivalent. Set up import ordering. Add Perfectionist for natural sort. Run --fix on save.', checked: false },
          { name: 'Prettier Integration', description: 'Consistent formatting across the team', details: 'Set printWidth 100, single quotes, trailingComma es5. Create .prettierignore. Integrate with ESLint via eslint-config-prettier. Format on pre-commit.', checked: false },
          { name: 'Husky & lint-staged', description: 'Pre-commit hooks for instant feedback', details: 'Initialize husky. Set lint-staged to run ESLint --fix + Prettier --write on staged files. Add commitlint for conventional commit messages.', checked: false },
        ],
      },
      {
        name: 'Folder Structure & Conventions',
        description: 'Establish scalable project organization and coding conventions',
        stage: 'early',
        details: 'Define a feature-first or layered folder structure. Set up barrel exports, naming conventions, and module boundaries. Document in a CONTRIBUTING guide.',
        children: [
          { name: 'Feature-based Layout', description: 'Organize by domain feature, not by file type', details: 'Use src/features/{feature}/ structure. Each feature contains components, hooks, api, types. Keep shared code in src/shared. Avoid deeply nested folders.', checked: false },
          { name: 'Naming Conventions', description: 'Consistent file, component, and hook naming', details: 'Components: PascalCase. Hooks: use{Name}. Utils: camelCase. Test files: {name}.test.tsx. Pages: {route}.page.tsx. Use index.ts barrel files.', checked: false },
          { name: 'Module Boundaries', description: 'Enforce dependency rules between layers', details: 'Use ESLint import/no-restricted-paths. Pages can import features, features cannot import pages. Shared code is framework-agnostic. Enforce via CI.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'Design System & Components',
    color: '#a78bfa',
    category: 'frontend',
    description: 'Theme engine, design tokens, and reusable component primitives',
    items: [
      {
        name: 'Theme Engine & Design Tokens',
        description: 'Create a flexible theming system with consistent design tokens',
        stage: 'early',
        details: 'Define color palette, spacing scale, typography, breakpoints, and shadows as CSS custom properties. Support dark/light mode switching. Expose tokens to components via theme context.',
        children: [
          { name: 'CSS Custom Properties', description: 'Define all design tokens as CSS variables', details: 'Create :root variables for colors, spacing (4px base), font sizes, radii, shadows, z-indexes. Use hsl() for runtime color manipulation. Document each token.', checked: false },
          { name: 'Theme Context Provider', description: 'React context for theme switching', details: 'Create ThemeProvider with mode state (light/dark/system). Toggle data-theme attribute on <html>. Persist preference in localStorage. Respect OS prefers-color-scheme.', checked: false },
          { name: 'Dark Mode Support', description: 'Dual theme with smooth transition', details: 'Define dark variants for all tokens under [data-theme=dark]. Use color-scheme meta tag. Add transition on background/color for smooth switching. Test both modes.', checked: false },
        ],
      },
      {
        name: 'Component Primitives',
        description: 'Build reusable, accessible base components',
        stage: 'early',
        details: 'Create a set of atomic components (Button, Input, Select, Modal, Tooltip) with consistent API, accessible markup, and theme support. Each component ships with its own types and tests.',
        children: [
          { name: 'Button Component', description: 'Versatile button with variants, sizes, loading state', details: 'Props: variant (primary/secondary/ghost/danger), size (sm/md/lg), loading, disabled, icon, as (button/a). Use forwardRef + Polymorphic pattern. Support full keyboard interaction.', checked: false },
          { name: 'Form Controls', description: 'Input, Select, Textarea, Checkbox with error states', details: 'Use label + input pattern for accessibility. Show validation errors inline. Support maxLength counter. Forward refs for form library integration. Handle disabled/readonly.', checked: false },
          { name: 'Overlay Components', description: 'Modal, Drawer, Tooltip, Popover', details: 'Use portal rendering. Trap focus. Close on Escape. Animate enter/exit. Support different placements for tooltip/popover. Accessible via ARIA attributes.', checked: false },
        ],
      },
      {
        name: 'Layout System',
        description: 'Responsive layout primitives and page shell',
        stage: 'early',
        details: 'Build a flexible layout system with Container, Stack, Grid, and Flex components. Create the app shell with sidebar, header, and main content area. Support responsive breakpoints.',
        children: [
          { name: 'Layout Primitives', description: 'Container, Stack, Grid, Flex components', details: 'Stack: vertical/horizontal with gap. Grid: CSS Grid wrapper with column config. Flex: flexbox with align/justify props. Container: max-width centered wrapper. Responsive via breakpoint props.', checked: false },
          { name: 'App Shell', description: 'Sidebar, header, breadcrumbs, main area', details: 'Create Shell layout with collapsible sidebar. Header with search, notifications, user menu. Breadcrumb trail. Main area with padding. Responsive: sidebar becomes drawer on mobile.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'Routing & Navigation',
    color: '#fbbf24',
    category: 'frontend',
    description: 'Client-side routing with lazy loading, guards, and navigation UI',
    items: [
      {
        name: 'Router Setup & Configuration',
        description: 'Configure the router with route definitions and lazy loading',
        stage: 'early',
        details: 'Use React Router v7 / TanStack Router. Define route tree with loaders, actions, and error elements. Implement code splitting via dynamic imports for every route.',
        children: [
          { name: 'Route Definitions', description: 'Declarative route tree with nested layouts', details: 'Define routes as a tree. Use layout routes for shared shells. Set index routes for default children. Parameterize dynamic segments (/users/:id).', checked: false },
          { name: 'Lazy Loading', description: 'Code-split each route for optimal bundle size', details: 'Use React.lazy + Suspense or framework-native lazy(). Set up Suspense boundary with loading skeleton per route level. Preload on hover.', checked: false },
          { name: 'Route Loaders', description: 'Data fetching at the route level', details: 'Define loader functions per route that return data before render. Handle loading and error states. Use deferred data for non-critical content. Cache responses with SWR.', checked: false },
        ],
      },
      {
        name: 'Route Guards & Navigation Control',
        description: 'Protect routes and manage navigation flow',
        stage: 'mid',
        details: 'Implement auth guards, role-based redirects, navigation guards for unsaved changes, and scroll restoration. Handle 404 and forbidden states at the route level.',
        children: [
          { name: 'Auth Guard', description: 'Redirect unauthenticated users to login', details: 'Create ProtectedRoute wrapper. Check auth state, redirect to /login with returnUrl. Show loading spinner while checking. Handle token expiry gracefully.', checked: false },
          { name: 'Unsaved Changes Guard', description: 'Warn before leaving forms with unsaved data', details: 'Use beforeunload event + router blocker. Track dirty state via form library. Show confirmation dialog. Allow saving before navigating away.', checked: false },
          { name: 'Scroll Restoration', description: 'Restore scroll position on back navigation', details: 'Use router\'s built-in scroll restoration. Store scroll positions per route. Handle dynamic content loading. Smooth scroll to anchor links.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'State & Data Layer',
    color: '#34d399',
    category: 'frontend',
    description: 'State management, API communication, and data caching',
    items: [
      {
        name: 'Store Setup & Architecture',
        description: 'Create the state management layer with stores and actions',
        stage: 'mid',
        details: 'Use Zustand / Pinia / Jotai for global state. Structure stores by domain. Use selectors for derived state and memoization. Keep server state separate from UI state via TanStack Query.',
        children: [
          { name: 'Global Store', description: 'Domain-based stores with actions and selectors', details: 'Create stores per feature (auth, ui, settings). Define types for state + actions. Use immer for nested updates. Create selector hooks with equality checks.', checked: false },
          { name: 'Server State Management', description: 'Async data fetching with caching and revalidation', details: 'Use TanStack Query / SWR. Define query keys and fetchers per API endpoint. Set stale times per resource (5s for chat, 5min for settings). Use optimistic updates for mutations.', checked: false },
          { name: 'Form State Management', description: 'Form handling with validation and async submit', details: 'Use React Hook Form / Formik. Integrate with Zod validation. Handle async submit with loading state. Show field-level and form-level errors. Support multi-step forms.', checked: false },
        ],
      },
      {
        name: 'API Client & HTTP Layer',
        description: 'Centralized HTTP client with interceptors and error handling',
        stage: 'mid',
        details: 'Create a typed API client (fetch wrapper / axios) with request/response interceptors. Handle auth token injection, refresh flows, and standardized error responses.',
        children: [
          { name: 'HTTP Client Setup', description: 'Typed fetch wrapper with interceptors', details: 'Create apiClient with base URL, timeout, and interceptors. Request interceptor: inject Authorization header. Response interceptor: parse JSON, handle 401 refresh. Use AbortController for cancellation.', checked: false },
          { name: 'Error Handling & Retry', description: 'Graceful error handling with automatic retry', details: 'Classify errors: network, auth, validation, server. Show toast for unexpected errors. Retry idempotent requests (3 attempts with backoff). Log errors to monitoring service.', checked: false },
          { name: 'Request Caching & Deduplication', description: 'Cache GET responses and deduplicate in-flight requests', details: 'Use TanStack Query or manual cache map. Deduplicate identical concurrent requests. Invalidate cache on mutations. Consider stale-while-revalidate strategy.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'User Experience & Polish',
    color: '#fb923c',
    category: 'frontend',
    description: 'Loading states, error boundaries, notifications, and form UX',
    items: [
      {
        name: 'Loading States & Skeletons',
        description: 'Visual feedback during data fetching and async operations',
        stage: 'mid',
        details: 'Create a consistent loading system with skeleton screens, spinners, and progress bars. Apply page-level, section-level, and inline loading patterns.',
        children: [
          { name: 'Skeleton Components', description: 'Animated placeholder shapes for loading content', details: 'Create Skeleton component with variant (text/circle/rect). Match dimensions of actual content. Use shimmer animation. Export presets for common patterns (card, table, list).', checked: false },
          { name: 'Page & Section Loading', description: 'Loading indicators at different granularity', details: 'Full-page spinner for route transitions (via Suspense). Section-level skeleton for data-fetching areas. Inline spinner for button/submit actions. Debounce loading state to avoid flicker.', checked: false },
          { name: 'Progress Bar', description: 'Top-of-page progress indicator for navigation', details: 'Use NProgress-style bar that activates during route transitions. Show deterministic progress for file uploads. Auto-hide after completion or timeout.', checked: false },
        ],
      },
      {
        name: 'Error Boundaries & Fallbacks',
        description: 'Graceful error recovery at component and page level',
        stage: 'mid',
        details: 'Implement ErrorBoundary components at critical UI boundaries. Show helpful fallback UI with retry action. Log errors to monitoring service without crashing the entire app.',
        children: [
          { name: 'Component Error Boundary', description: 'Wrap components that may throw', details: 'Create ErrorBoundary class component with getDerivedStateFromError + componentDidCatch. Show fallback with error message and Retry button. Log to console + external service.', checked: false },
          { name: 'Full-page Error States', description: 'Dedicated error pages for 404, 403, 500', details: 'Create NotFound, Forbidden, ServerError page components. Show illustration + message + action button. Use route errorElement for router-level errors. Include contact support link.', checked: false },
          { name: 'Offline Detection', description: 'Detect network loss and show appropriate UI', details: 'Listen to navigator.onLine and online/offline events. Show offline banner when disconnected. Disable mutation actions. Queue failed mutations for retry when back online.', checked: false },
        ],
      },
      {
        name: 'Notifications & Toasts',
        description: 'In-app notification system for feedback and alerts',
        stage: 'mid',
        details: 'Build a toast notification system with different types (success, error, info, warning). Support auto-dismiss, stacking, and action buttons. Accessible via ARIA live regions.',
        children: [
          { name: 'Toast Container & Context', description: 'Global toast management', details: 'Create ToastProvider with addToast/removeToast. Support position config (top-right, bottom-center). Stack multiple toasts with offset. Animate enter/exit. Auto-dismiss with configurable duration.', checked: false },
          { name: 'Toast Variants', description: 'Success, error, info, warning, undo', details: 'Each variant has icon, color scheme, and default duration. Undo toast stays until action or timeout. Error toast includes copy-details button. Group duplicate toasts.', checked: false },
        ],
      },
      {
        name: 'Form UX Enhancements',
        description: 'Polished form interactions for better user experience',
        stage: 'late',
        details: 'Add auto-save, draft recovery, keyboard shortcuts, and field-level optimizations. Enhance form completion rates with smart defaults and contextual help.',
        children: [
          { name: 'Auto-save & Drafts', description: 'Save form state automatically', details: 'Debounce form changes and persist to localStorage/sessionStorage. Restore draft on remount. Show "Saved" indicator. Clear draft on successful submission.', checked: false },
          { name: 'Keyboard Navigation', description: 'Efficient form filling via keyboard', details: 'Support Tab/Shift+Tab for field traversal. Enter to submit. Escape to close/cancel. Arrow keys for select/radio. Show keyboard hints for power users.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'Performance & Bundle Optimization',
    color: '#22d3ee',
    category: 'frontend',
    description: 'Optimize bundle size, rendering performance, and asset delivery',
    items: [
      {
        name: 'Code Splitting & Lazy Loading',
        description: 'Split the bundle into smaller chunks loaded on demand',
        stage: 'late',
        details: 'Implement route-based and component-level code splitting. Analyze bundle composition and optimize import strategies for third-party libraries.',
        children: [
          { name: 'Route-based Splitting', description: 'Each route loads its own chunk', details: 'Use dynamic import() for every route component. Configure chunk naming in bundler. Set up preloading strategies (hover, viewport intersection). Monitor chunk sizes.', checked: false },
          { name: 'Component-level Splitting', description: 'Lazy-load heavy components (charts, editors)', details: 'Use React.lazy for heavy components not immediately visible. Show skeleton placeholder. Consider splitting by feature flag for gradual rollout.', checked: false },
          { name: 'Bundle Analysis', description: 'Analyze and optimize bundle composition', details: 'Use vite-bundle-analyzer or webpack-bundle-analyzer. Identify large dependencies. Tree-shake unused exports. Consider dynamic imports for large libraries (moment, lodash).', checked: false },
        ],
      },
      {
        name: 'Rendering Optimization',
        description: 'Optimize component rendering and re-renders',
        stage: 'late',
        details: 'Use memoization, virtualization, and strategic rendering patterns to reduce unnecessary re-renders and improve perceived performance.',
        children: [
          { name: 'Memoization Strategy', description: 'Prevent unnecessary re-renders', details: 'Use React.memo for pure components. useMemo for expensive computations. useCallback for stable callbacks. Profile with React DevTools. Avoid premature optimization.', checked: false },
          { name: 'Virtual Lists', description: 'Efficiently render large lists', details: 'Use TanStack Virtual or react-window for 1000+ items. Fixed or dynamic height estimation. Windowed rendering with overscan. Handle variable heights gracefully.', checked: false },
          { name: 'Image Optimization', description: 'Optimize image loading and delivery', details: 'Use next/image or sharp-based pipeline. Serve WebP/AVIF with fallback. Lazy load below-fold images. Set explicit dimensions to prevent layout shift. Use responsive srcset.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'PWA & Offline Support',
    color: '#f472b6',
    category: 'frontend',
    description: 'Progressive Web App capabilities for offline and near-native experience',
    items: [
      {
        name: 'Service Worker & Caching',
        description: 'Register service worker and implement caching strategies',
        stage: 'late',
        details: 'Use Workbox to generate service worker with precaching and runtime caching strategies. Cache static assets, API responses, and page shells for offline access.',
        children: [
          { name: 'Service Worker Registration', description: 'Register and update service worker', details: 'Register SW on app mount. Handle update flow: show "New version available" prompt. Skip waiting on user confirmation. Fall back gracefully if SW fails.', checked: false },
          { name: 'Precaching Strategy', description: 'Cache static assets at install time', details: 'Precache JS, CSS, fonts, and critical images. Use revision hashes for invalidation. Runtime cache for non-critical assets with stale-while-revalidate strategy.', checked: false },
          { name: 'API Response Caching', description: 'Cache API responses for offline browsing', details: 'Cache GET responses using Network First strategy for fresh data, Cache First for static data. Implement background sync for failed mutations. Show cached data with freshness indicator.', checked: false },
        ],
      },
      {
        name: 'Web App Manifest & Installation',
        description: 'Configure manifest for installable PWA experience',
        stage: 'late',
        details: 'Create web app manifest with app name, icons, theme color, and display mode. Implement beforeinstallprompt event for custom install UX.',
        children: [
          { name: 'Manifest Configuration', description: 'Define PWA metadata and icons', details: 'Create manifest.json: name, short_name, description, start_url, display: standalone, orientation, theme_color, background_color. Generate icon sizes (192x192, 512x512).', checked: false },
          { name: 'Install Prompt', description: 'Custom install button UI', details: 'Listen for beforeinstallprompt event. Show install button in header. Store dismissed state. Handle appinstalled event. Provide instructions for iOS Safari.', checked: false },
        ],
      },
    ],
  },
  {
    name: 'Accessibility & i18n',
    color: '#eab308',
    category: 'frontend',
    description: 'Make the app accessible to all users and support multiple languages',
    items: [
      {
        name: 'Accessibility (a11y)',
        description: 'Ensure the application meets WCAG 2.1 AA standards',
        stage: 'late',
        details: 'Add semantic HTML, ARIA attributes, keyboard navigation, focus management, and screen reader support. Test with assistive technologies.',
        children: [
          { name: 'Semantic HTML & ARIA', description: 'Use correct landmarks, roles, and states', details: 'Use semantic elements (nav, main, aside, article). Add ARIA labels for icon buttons and dynamic content. Set aria-live regions for toasts and announcements. Test with VoiceOver/NVDA.', checked: false },
          { name: 'Keyboard Navigation', description: 'Full keyboard access for all interactions', details: 'Ensure all interactive elements are reachable via Tab. Show visible focus indicators. Implement arrow key navigation for lists and menus. Support Escape for closing overlays.', checked: false },
          { name: 'Color Contrast & Focus', description: 'Sufficient color contrast and visible focus rings', details: 'Meet WCAG AA contrast ratios (4.5:1 normal, 3:1 large). Use not-allowed cursor on disabled elements. Show focus ring on keyboard nav only (not click). Test with color blindness simulators.', checked: false },
        ],
      },
      {
        name: 'Internationalization (i18n)',
        description: 'Support multiple languages and regional formats',
        stage: 'late',
        details: 'Use i18next / react-intl for translations, date/number formatting, and pluralization. Lazy-load locale files. Support RTL layout for Arabic/Hebrew.',
        children: [
          { name: 'i18n Framework Setup', description: 'Configure translation library and locale detection', details: 'Set up i18next with react-i18next. Detect browser locale. Lazy-load translation JSON files per language. Fall back to en-US. Format dates and numbers per locale.', checked: false },
          { name: 'RTL Layout Support', description: 'Mirror the UI for right-to-left languages', details: 'Use dir=rtl on <html> for RTL locales. Swap logical properties (margin-inline-start, padding-inline-end). Test with Arabic/Hebrew content. Reverse icon directions for RTL.', checked: false },
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

/* ─── Stage Metadata ──────────────────────────────────────────────── */

export function getStageMeta(stage) {
  const stages = {
    early: { label: 'early', color: '#fbbf24', desc: 'Foundation — implement first, everything depends on this' },
    mid:   { label: 'mid',   color: '#38bdf8', desc: 'Core — build core functionality on top of the foundation' },
    late:  { label: 'late',  color: '#a78bfa', desc: 'Polish — optimize and enhance after core is stable' },
  };
  return stages[stage] || null;
}

/* ─── Prompt Generation ─────────────────────────────────────────────── */

export function getItemPrompt(item) {
  if (item.prompt && item.prompt.length > 0) return item.prompt;
  const lines = [];
  const stageMeta = item.stage ? getStageMeta(item.stage) : null;
  if (stageMeta) {
    lines.push('Stage: ' + stageMeta.label.toUpperCase() + ' \u2014 ' + stageMeta.desc);
    lines.push('');
  }
  lines.push('Analyze the project codebase to understand the current architecture:');
  lines.push('- Examine the src/ directory structure, entry point, route organization, and middleware pipeline');
  lines.push('- Check package.json for existing dependencies and the tech stack in use');
  lines.push('- Review how similar features are currently implemented to follow the same conventions');
  lines.push('- Identify the correct location in the codebase where this feature should be integrated');
  lines.push('');
  lines.push('Then implement:');
  lines.push((item.name || '') + ' \u2014 ' + (item.description || ''));
  lines.push('');
  lines.push('Implementation guidance: ' + (item.details || ''));
  if (item.children && item.children.length > 0) {
    lines.push('');
    lines.push('Scope includes:');
    item.children.forEach(function(child) {
      lines.push('- ' + (child.name || '') + ': ' + (child.description || ''));
    });
  }
  lines.push('');
  lines.push('Verification:');
  lines.push('- Follow existing code patterns and conventions in the project');
  lines.push('- Implement each component and verify integration');
  lines.push('- Run the existing test suite and add new tests where needed');
  lines.push('- Check for regressions and security considerations');
  return lines.join('\n');
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
  if (!Array.isArray(project.buildKits)) { project.buildKits = getDefaultKits(); return; }
  if (project.buildKits.length === 0) { project.buildKits = getDefaultKits(); return; }
  const defaults = _deepClone(DEFAULT_KITS);
  for (const defKit of defaults) {
    const existing = project.buildKits.find(k => k.name === defKit.name);
    if (!existing) {
      defKit.id = genId();
      defKit.collapsed = false;
      if (defKit.items) defKit.items.forEach(_assignIds);
      project.buildKits.push(defKit);
    } else {
      if (defKit.category && !existing.category) existing.category = defKit.category;
      if (!existing.color) existing.color = defKit.color;
      for (const defItem of defKit.items) {
        const match = existing.items.find(i => i.name === defItem.name);
        if (match && defItem.stage && !match.stage) match.stage = defItem.stage;
      }
    }
  }
}
