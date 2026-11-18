const { def } = require('./helpers.js');

module.exports = [
    def('env-switcher', 'Environment Switching', 'Choose the environment by the command you run: each script loads its own env file into one validated config, on both the client and the server.', 'Globals', 'Config', ['env', 'environment', 'config', 'scripts', 'secrets'], [], ['frontend-folder-structure', 'backend-folder-structure', 'security-layer', 'ci-pipeline', 'devops-security', 'authentication'], [
        ['a', 'm', 'The command decides', 'Each run command selects its environment through a mode value: dev loads .env.local, and dev:staging, dev:prod, build:prod and start:prod each load their own file. No manual copying or renaming of files. The client and the server use the same mode names.'],
        ['a', 'm', 'One loader, one config', 'Load env in one place on each side, from the mode set by the command, and export one validated config object. The app reads that config and never reads raw environment variables.'],
        ['f', 'm', 'Fixed names and precedence', 'Use a fixed set of files (.env, .env.local, .env.development, .env.staging, .env.production, .env.example) with documented precedence. Document which command loads which file, for the client and for the server.'],
        ['f', 'm', 'Backend: config module', 'The backend config folder (env schema, app config, index) is the only place that reads process.env. Services, modules and the pipeline import the typed config and nothing else.'],
        ['f', 'm', 'Validate at startup and build', 'Validate every variable with a schema before anything else starts. Fail fast with a clear list of missing or invalid names, exit with a non-zero code and never print values.'],
        ['s', 'm', 'Secrets stay out of git', 'Ignore every real env file except .env.example, never commit secrets, and keep the example complete with placeholder values.'],
        ['s', 'm', 'Security: public and server split', 'Server secrets exist only in the backend config. Only variables with the public prefix may reach client code, and the loader rejects a public variable whose name looks like a secret (key, secret, token, password).'],
        ['s', 'm', 'Security: production guard', 'A command that targets production shows a visible banner and refuses destructive actions (reset, seed, drop, wipe). The backend enforces this itself, so a wrong client can never bypass it. Local mode never points at production services without an explicit typed confirmation.'],
        ['a', 's', 'Typed config', 'Export a typed config grouped by concern (api, realtime, auth, database, cache, features) with defaults only for non-sensitive values.'],
        ['a', 's', 'Backend: environment-aware settings', 'Allowed origins, rate limits, log level, cookie flags, debug features and error detail come from config per environment. No code branches on a mode name.'],
        ['i', 's', 'Client and server agree', 'The client API address and realtime address come from the public config. The server allows only the origins listed for its own environment.'],
        ['s', 's', 'Security: safe diagnostics', 'The readiness endpoint and the logs may show the environment name only, never values, hosts or secrets. Debug output and detailed errors are off in production.'],
        ['f', 's', 'Works on every system', 'Use a small cross-platform tool or the framework mode flag so the commands behave the same on Windows, macOS and Linux.'],
        ['u', 'd', 'Environment indicator', 'Show an environment badge outside production and log the active environment name once at startup, on both sides (never the values).'],
        ['d', 'd', 'Build time versus runtime', 'Document which values are fixed at build time (client public values) and which are read at runtime (server values). Rebuild when a build-time value changes.'],
        ['i', 'd', 'CI and deployment', 'Provide secrets to CI and hosting through their secret stores instead of env files, use the same variable names in every environment, and fail the pipeline when the schema check fails.'],
        ['t', 'd', 'Tests', 'Test the loader for each mode, missing variables, invalid values, the public and server split, rejection of secret-looking public names, and the production guard on both sides.'],
        ['s', 'x', 'Rotation and audit', 'Rotate secrets on a schedule and after any exposure, and log which environment started and which variable names were missing (names only).'],
        ['c', 'm', 'Verified', 'Each command loads exactly the intended file, a missing required variable stops startup with a clear message, no secret reaches the client bundle or git, and destructive actions are refused in production.'],
    ]),
];