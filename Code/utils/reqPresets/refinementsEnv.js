const FUNCTIONAL = 'Functional Requirements';
const ARCH = 'Architecture Requirements';
const SECURITY = 'Security Requirements';
const DATA = 'Data Management Requirements';
const ERRORS = 'Error Handling Requirements';
const INTEGRATION = 'Integration Requirements';
const TESTING = 'Testing Requirements';
const ACCEPT = 'Acceptance Criteria';

// Database migration commands for the Environment Switching preset.
module.exports = {
    'env-switcher': {
        add: [
            {
                group: ARCH,
                level: 'must-have',
                title: 'Database commands per environment',
                description: 'If the project uses an ORM or a migration tool (for example Prisma, Drizzle, TypeORM, Sequelize, Knex, Django or Alembic), give every database command a local version and a prod version, selected by the same mode value as the app commands. Use one naming pattern, for example db:status:local, db:migrate:local, db:rollback:local, db:seed:local and db:status:prod, db:migrate:prod, db:rollback:prod, plus db:migrate:create (local only), db:migrate:dry:prod and db:backup:prod. Map each name to the command of the ORM the project already uses and do not switch tools. If the project has no ORM or migrations, say so and skip these rows.',
            },
            {
                group: ARCH,
                level: 'must-have',
                title: 'Same loader as the app',
                description: 'Every database command loads its env file through the same loader and validated config as the app, so it reads the database address from the config of its own environment. A command never reads raw environment variables and never takes a connection string typed by hand on the command line.',
            },
            {
                group: FUNCTIONAL,
                level: 'must-have',
                title: 'Update order: local first, then prod',
                description: 'Define and document one fixed order. 1) Create the migration on local with db:migrate:create. 2) Apply and test it with db:migrate:local, including the rollback. 3) Commit the generated migration files with the code. 4) On prod run db:backup:prod, then db:migrate:dry:prod, then db:migrate:prod. Prod only ever applies migration files that were created and tested on local, and a migration that has been applied is never edited: fix it with a new migration.',
            },
            {
                group: SECURITY,
                level: 'must-have',
                title: 'Prod commands only apply, never generate',
                description: 'The prod migrate command only applies existing migration files (deploy mode). It never generates migrations, never pushes the schema directly, never resets, drops or truncates, and never seeds test data. Commands that destroy data (reset, drop, wipe, force push) exist only for local and are refused when the mode is production, enforced inside the script and not only by naming.',
            },
            {
                group: SECURITY,
                level: 'must-have',
                title: 'Target check and confirmation',
                description: 'Before any prod database command runs, print the target in masked form (environment name, host and database name, never the password or full connection string) and require an explicit typed confirmation such as the environment name. Refuse to run when the mode and the database target do not match, for example a local command pointing at a prod host or a prod command pointing at localhost. Skip the prompt only in CI where the pipeline approval already acts as the confirmation.',
            },
            {
                group: SECURITY,
                level: 'standard',
                title: 'Migration account separate from the app account',
                description: 'Run migrations with a separate database account that has schema change rights, supplied only to the migration command or the CI step. The running app uses a least-privilege account without schema rights. Neither credential is committed or printed.',
            },
            {
                group: DATA,
                level: 'must-have',
                title: 'Backup before prod migrations',
                description: 'db:backup:prod creates a restorable backup or snapshot before any prod migration, prints where it is stored (without secrets) and is verified to restore. The prod migrate command warns or stops when no recent backup is recorded, depending on the project policy.',
            },
            {
                group: DATA,
                level: 'standard',
                title: 'Dry run and status',
                description: 'db:status and db:migrate:dry:prod show which migrations are applied and which are pending, and print the SQL or the plan that would run, without changing anything. Run the status check before every prod migration and after it to confirm that nothing is pending.',
            },
            {
                group: DATA,
                level: 'standard',
                title: 'Rollback plan',
                description: 'Every migration has a tested way back: a down migration, or a documented forward fix when the change cannot be reversed. db:rollback:local is used to test it and db:rollback:prod exists only with confirmation and a backup. Prefer fixing forward on prod for destructive changes.',
            },
            {
                group: DATA,
                level: 'standard',
                title: 'Backward compatible changes',
                description: 'Write migrations in the expand then contract style so the running app keeps working during a deploy: add the new column, table or index first, deploy the code that uses it, and remove the old one in a later migration. Avoid renames, type changes and dropped columns in a single step. Make large data changes batched and safe to resume.',
            },
            {
                group: FUNCTIONAL,
                level: 'standard',
                title: 'Seeds per environment',
                description: 'Keep seed data separate from schema migrations. db:seed:local may load sample and test data. db:seed:prod, if it exists at all, loads only required reference data, is safe to run twice and never contains test or personal data.',
            },
            {
                group: ARCH,
                level: 'standard',
                title: 'One runner at a time',
                description: 'Use the migration tool lock or an advisory lock so two processes can never run migrations at once. Run migrations as one explicit step in the deploy, before the new app version starts, and never automatically on every app start in production.',
            },
            {
                group: INTEGRATION,
                level: 'standard',
                title: 'CI and deployment',
                description: 'The prod deploy pipeline runs the prod migrate command as its own step with the secrets from the secret store, after the backup and the dry run and before the app is released. CI checks that the committed migrations match the schema (no drift, no pending generated changes) and runs the migrations on a fresh database to prove they apply cleanly.',
            },
            {
                group: ERRORS,
                level: 'standard',
                title: 'Failure handling',
                description: 'When a migration fails, stop immediately, print the failed migration name and the reason without secrets, leave the database state clearly reported (the tool transaction rolled back or the exact point where it stopped) and exit with a non-zero code. Never continue to the next migration or release the app after a failure.',
            },
            {
                group: ARCH,
                level: 'standard',
                title: 'Documented command table',
                description: 'Document a table of every app and database command: its name, the env file it loads, the database it targets, what it changes and whether it is allowed in production. Keep it next to the env example so local and prod always show the same set of names.',
            },
            {
                group: TESTING,
                level: 'medium',
                title: 'Migration command tests',
                description: 'Test that each command loads the intended env file, that destructive local commands are refused in production mode, that a mode and target mismatch is refused, that the dry run changes nothing, that a pending migration is applied once and not twice, that rollback works on local and that the masked target output never contains secrets.',
            },
            {
                group: ACCEPT,
                level: 'must-have',
                title: 'Verified: migrations',
                description: 'A schema change can be created and tested with the local commands, then applied to prod with the prod commands in the documented order, prod commands cannot generate, reset or seed test data, every prod run shows the masked target and needs confirmation, and a backup and a dry run happen before the migration is applied.',
            },
        ],
    },
};