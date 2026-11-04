'use strict';

const DEPLOY_COMMANDS = [
  [/\bdocker\s+push\b/, 'pushes a container image'],
  [/\bkubectl\s+(?:apply|rollout|set|delete|replace)\b/, 'changes a Kubernetes cluster'],
  [/\bhelm\s+(?:install|upgrade)\b/, 'installs a Helm release'],
  [/\bterraform\s+(?:apply|destroy)\b/, 'changes infrastructure with Terraform'],
  [/\bpulumi\s+(?:up|destroy)\b/, 'changes infrastructure with Pulumi'],
  [/\baws\s+(?:s3\s+(?:sync|cp|mv|rm)|ecs|lambda|cloudformation|elasticbeanstalk|cloudfront)\b/, 'changes AWS resources'],
  [/\bgcloud\s+(?:app\s+deploy|run\s+deploy|functions\s+deploy)\b/, 'deploys to Google Cloud'],
  [/\baz\s+(?:webapp|functionapp|containerapp)\b/, 'deploys to Azure'],
  [/\bfirebase\s+deploy\b/, 'deploys to Firebase'],
  [/\bvercel\s+(?:deploy|--prod)\b/, 'deploys to Vercel'],
  [/\bnetlify\s+deploy\b/, 'deploys to Netlify'],
  [/\bfly(?:ctl)?\s+deploy\b/, 'deploys to Fly.io'],
  [/\bgit\s+push\b/, 'pushes commits'],
  [/\b(?:scp|rsync)\b[^\n]*@/, 'copies files to a remote server'],
  [/\bssh\b[^\n]*@/, 'runs commands on a remote server'],
];

const RELEASE_COMMANDS = [
  [/\b(?:npm|yarn|pnpm)\s+publish\b/, 'publishes a package'],
  [/\btwine\s+upload\b/, 'uploads a Python package'],
  [/\bcargo\s+publish\b/, 'publishes a Rust crate'],
  [/\bdotnet\s+nuget\s+push\b/, 'pushes a NuGet package'],
  [/\bgh\s+release\s+(?:create|upload|edit)\b/, 'creates a GitHub release'],
  [/\bgradlew?\s+publish\b/, 'publishes a Gradle artifact'],
  [/\bmvn\b[^\n]*\bdeploy\b/, 'deploys a Maven artifact'],
];

const DEPLOY_USES = /^(?:aws-actions\/|azure\/|google-github-actions\/|appleboy\/(?:ssh|scp)-action|peaceiris\/actions-gh-pages|jamesives\/github-pages-deploy-action|actions\/deploy-pages|cloudflare\/wrangler-action|superfly\/flyctl-actions|amondnet\/vercel-action|nwtgck\/actions-netlify|docker\/build-push-action)/i;
const RELEASE_USES = /^(?:softprops\/action-gh-release|pypa\/gh-action-pypi-publish|changesets\/action|actions\/create-release)/i;

const TEST_RE = /\b(?:(?:npm|yarn|pnpm)\s+(?:run\s+)?test|jest|vitest|pytest|phpunit|dotnet\s+test|go\s+test|cargo\s+test|php\s+artisan\s+test|mocha|rspec)\b/;
const BUILD_RE = /\b(?:(?:npm|yarn|pnpm)\s+(?:run\s+)?build|docker\s+build|dotnet\s+build|cargo\s+build|go\s+build|make|cmake|tsc|gradlew?\s+build|mvn\s+(?:package|install|compile))\b/;
const LINT_RE = /\b(?:eslint|prettier|ruff|flake8|mypy|phpstan|psalm|pint|(?:npm|yarn|pnpm)\s+(?:run\s+)?(?:lint|typecheck))\b/;

function unique(list) {
  return Array.from(new Set(list)).slice(0, 8);
}

function contentCategory(workflow, commands) {
  const hasTest = TEST_RE.test(commands);
  const hasBuild = BUILD_RE.test(commands);
  const hasLint = LINT_RE.test(commands);
  if (hasTest && (hasBuild || hasLint)) return 'ci';
  if (hasTest) return 'test';
  if (hasBuild && hasLint) return 'ci';
  if (hasBuild) return 'build';
  if (hasLint) return 'ci';
  const names = workflow.triggers || [];
  const quiet = names.length > 0 && names.every((n) => n === 'schedule' || n === 'workflow_dispatch');
  if (quiet && names.includes('schedule')) return 'maintenance';
  if (/\b(?:ci|validate|check|lint)\b/i.test(String(workflow.name || '') + ' ' + String(workflow.file || ''))) return 'ci';
  return 'unknown';
}

function classify(workflow) {
  const deploy = [];
  const release = [];
  const names = workflow.triggers || [];
  const filters = workflow.triggerFilters || {};
  if (names.includes('release')) release.push('Triggered by a GitHub release');
  if (filters.push && filters.push.tags && filters.push.tags.length) release.push('Triggered by tag pushes');
  if (workflow.idTokenWrite) deploy.push('Can request cloud credentials (id-token: write)');
  let commands = '';
  for (const job of workflow.jobs || []) {
    if (job.environment) deploy.push('Job "' + job.id + '" targets the "' + job.environment + '" environment');
    if (job.idTokenWrite) deploy.push('Job "' + job.id + '" can request cloud credentials (id-token: write)');
    for (const step of job.steps || []) {
      if (step.run) {
        commands += '\n' + step.run;
        for (const [re, label] of RELEASE_COMMANDS) {
          if (re.test(step.run)) release.push('Job "' + job.id + '" ' + label);
        }
        for (const [re, label] of DEPLOY_COMMANDS) {
          if (re.test(step.run)) deploy.push('Job "' + job.id + '" ' + label);
        }
      }
      if (step.uses) {
        const name = String(step.uses).split('@')[0];
        if (RELEASE_USES.test(name)) release.push('Uses ' + name);
        else if (DEPLOY_USES.test(name)) deploy.push('Uses ' + name);
      }
    }
  }
  const reasons = unique(release.concat(deploy));
  let category;
  if (release.length) category = 'release';
  else if (deploy.length) category = 'deploy';
  else category = contentCategory(workflow, commands);
  return { category, deployBlocked: reasons.length > 0, deployReasons: reasons };
}

module.exports = { classify };