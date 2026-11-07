'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const YAML = require('yaml');
const { classify } = require('./ciClassify');
const { redact } = require('../../database/consoleDb');

const WORKFLOW_DIR = path.join('.github', 'workflows');
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.ya?ml$/;
const MAX_BYTES = 512 * 1024;
const MAX_RUN_CHARS = 4000;
const SIMPLE_IF_RE = /^\s*(?:\$\{\{\s*)?(?:success\(\)|always\(\)|failure\(\)|cancelled\(\)|true|false)\s*(?:\}\})?\s*$/;
const EXPR_RE = /\$\{\{([\s\S]*?)\}\}/g;
const KNOWN_EXPR_RE = /^(?:(?:env|secrets)\.[A-Za-z_][A-Za-z0-9_]*|github\.(?:workspace|sha))$/;

const SETUP_ACTIONS = new Set([
  'actions/setup-node',
  'actions/setup-python',
  'actions/setup-java',
  'actions/setup-go',
  'actions/setup-dotnet',
  'actions/setup-ruby',
  'ruby/setup-ruby',
  'shivammathur/setup-php',
  'pnpm/action-setup',
  'dtolnay/rust-toolchain',
]);
const SKIPPED_ACTIONS = new Set(['actions/cache', 'actions/upload-artifact']);

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function list(value) {
  if (value === null || value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(str).filter((v) => v !== null);
}

function keys(value) {
  return isObject(value) ? Object.keys(value) : [];
}

function isWorkflowFile(name) {
  return typeof name === 'string' && FILE_RE.test(name);
}

function emptyWorkflow(file, text) {
  return {
    file,
    name: file,
    triggers: [],
    triggerFilters: {},
    jobs: [],
    features: [],
    problems: [],
    category: 'unknown',
    deployBlocked: false,
    deployReasons: [],
    support: 'unsupported',
    parseError: null,
    idTokenWrite: false,
    hash: typeof text === 'string' ? crypto.createHash('sha256').update(text).digest('hex') : null,
  };
}

function failedWorkflow(file, message) {
  const workflow = emptyWorkflow(file, null);
  workflow.parseError = { message, line: null, col: null };
  return workflow;
}

function readTriggers(on) {
  if (typeof on === 'string') return { names: [on], filters: {} };
  if (Array.isArray(on)) return { names: list(on), filters: {} };
  if (!isObject(on)) return { names: [], filters: {} };
  const filters = {};
  for (const name of Object.keys(on)) {
    const cfg = on[name];
    if (!isObject(cfg)) continue;
    const entry = {
      paths: list(cfg.paths),
      pathsIgnore: list(cfg['paths-ignore']),
      branches: list(cfg.branches),
      tags: list(cfg.tags),
    };
    if (entry.paths.length || entry.pathsIgnore.length || entry.branches.length || entry.tags.length) filters[name] = entry;
  }
  return { names: Object.keys(on), filters };
}

function unresolvedExpressions(text) {
  const out = [];
  for (const match of String(text).matchAll(EXPR_RE)) {
    const inner = match[1].trim();
    if (!KNOWN_EXPR_RE.test(inner) && !out.includes(inner)) out.push(inner);
  }
  return out;
}

function conditionNeedsReview(value) {
  const text = str(value);
  if (text === null) return false;
  return !SIMPLE_IF_RE.test(text);
}

function usesPolicy(uses, withObject) {
  const ref = String(uses).trim();
  if (ref.startsWith('./')) {
    return { support: 'skipped', remote: true, note: 'Local action. It is skipped locally, only the commands run.' };
  }
  if (ref.startsWith('docker://')) {
    return { support: 'skipped', remote: true, note: 'Docker action. It is skipped locally, only the commands run.' };
  }
  const name = ref.split('@')[0].toLowerCase();
  if (name === 'actions/checkout') {
    if (isObject(withObject) && (withObject.repository || withObject.path)) {
      return {
        support: 'skipped',
        remote: true,
        note: 'Checks out another repository or path. It is skipped locally and the current repository is used.',
      };
    }
    return { support: 'satisfied', remote: false, note: 'The repository is already available locally.' };
  }
  if (SETUP_ACTIONS.has(name)) {
    return { support: 'validate', remote: false, note: 'Checked against the installed runtime. Nothing is installed.' };
  }
  if (SKIPPED_ACTIONS.has(name)) {
    return { support: 'skipped', remote: false, note: 'Skipped locally.' };
  }
  return { support: 'skipped', remote: true, note: 'Third-party action. It is skipped locally, only the commands run.' };
}

function normalizeStep(raw, index, line) {
  const step = {
    index,
    name: null,
    kind: 'unknown',
    run: null,
    uses: null,
    with: [],
    if: null,
    review: false,
    workingDirectory: null,
    shell: null,
    env: [],
    line: line || null,
    support: 'unsupported',
    remoteOnly: false,
    unresolved: false,
    notes: [],
  };
  if (!isObject(raw)) {
    step.notes.push('This step is not a valid step definition.');
    return step;
  }
  step.name = str(raw.name);
  step.if = str(raw.if);
  step.review = conditionNeedsReview(raw.if);
  step.workingDirectory = str(raw['working-directory']);
  step.shell = str(raw.shell);
  step.env = keys(raw.env);
  if (typeof raw.run === 'string') {
    step.kind = 'run';
    step.run = redact(raw.run).slice(0, MAX_RUN_CHARS);
    step.support = 'supported';
    const open = unresolvedExpressions(raw.run);
    if (open.length) {
      step.unresolved = true;
      step.support = 'skipped';
      step.notes.push(
        'Uses GitHub expressions that are not available locally (' + open.slice(0, 5).join(', ') + '), so this step is skipped locally.'
      );
    }
  } else if (typeof raw.uses === 'string') {
    step.kind = 'uses';
    step.uses = raw.uses;
    step.with = keys(raw.with);
    const policy = usesPolicy(raw.uses, raw.with);
    step.support = policy.support;
    step.remoteOnly = !!policy.remote;
    step.notes.push(policy.note);
  } else {
    step.notes.push('The step has neither run nor uses.');
  }
  if (step.review) {
    step.notes.push('The condition depends on GitHub context, so this step is skipped locally.');
    if (step.kind !== 'unknown') step.support = 'skipped';
  }
  return step;
}

function runsOnText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return list(value).join(', ');
  if (isObject(value)) return 'custom runner';
  return '';
}

function normalizeJob(id, raw, stepLine) {
  const job = {
    id,
    name: id,
    runsOn: '',
    needs: [],
    if: null,
    review: false,
    workingDirectory: null,
    env: [],
    steps: [],
    commandCount: 0,
    skippedCount: 0,
    matrix: false,
    services: [],
    container: false,
    environment: null,
    reusable: null,
    timeoutMinutes: null,
    idTokenWrite: false,
    features: [],
    notes: [],
    support: 'full',
  };
  if (!isObject(raw)) {
    job.support = 'unsupported';
    job.notes.push('The job definition is not a mapping.');
    return job;
  }
  job.name = str(raw.name) || id;
  job.runsOn = runsOnText(raw['runs-on']);
  job.needs = list(raw.needs);
  job.if = str(raw.if);
  job.review = conditionNeedsReview(raw.if);
  job.workingDirectory = isObject(raw.defaults) && isObject(raw.defaults.run) ? str(raw.defaults.run['working-directory']) : null;
  job.env = keys(raw.env);
  job.matrix = isObject(raw.strategy) && raw.strategy.matrix !== undefined && raw.strategy.matrix !== null;
  job.services = keys(raw.services);
  job.container = raw.container !== undefined && raw.container !== null;
  job.environment = isObject(raw.environment) ? str(raw.environment.name) : str(raw.environment);
  job.reusable = str(raw.uses);
  job.timeoutMinutes = typeof raw['timeout-minutes'] === 'number' ? raw['timeout-minutes'] : null;
  job.idTokenWrite = isObject(raw.permissions) && raw.permissions['id-token'] === 'write';
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  job.steps = steps.map((s, i) => normalizeStep(s, i, stepLine(id, i)));
  job.commandCount = job.steps.filter((s) => s.kind === 'run' && s.support === 'supported').length;
  job.skippedCount = job.steps.filter((s) => s.support === 'skipped').length;

  if (job.matrix) {
    job.features.push('matrix');
    job.notes.push('Matrix jobs are not run by the local runner yet.');
  }
  if (job.reusable) {
    job.features.push('reusable-workflow');
    job.notes.push('Reusable workflows are not run by the local runner.');
  }
  if (job.services.length) {
    job.features.push('services');
    job.notes.push('Service containers are not started locally. Commands that need them use whatever is already running on this machine.');
  }
  if (job.container) {
    job.features.push('container');
    job.notes.push('The job runs in a container on GitHub. Locally its commands run directly on this machine.');
  }
  if (job.steps.some((s) => s.remoteOnly)) job.features.push('third-party-action');
  if (job.steps.some((s) => s.unresolved)) job.features.push('expressions');
  if (job.steps.some((s) => s.review)) job.features.push('conditions');
  if (job.review) job.notes.push('The job condition is ignored locally. The job runs when it is selected.');

  if (!job.reusable && job.steps.length === 0) {
    job.notes.push('The job has no steps.');
    job.support = 'unsupported';
  } else if (job.reusable || job.matrix) {
    job.support = 'unsupported';
  } else if (job.steps.some((s) => s.support === 'unsupported')) {
    job.support = 'partial';
  }
  return job;
}

function findCycle(jobs) {
  const needs = new Map(jobs.map((j) => [j.id, j.needs]));
  const state = new Map();
  const stack = [];
  let found = null;
  const visit = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const next of needs.get(id) || []) {
      if (!needs.has(next)) continue;
      if (state.get(next) === 1) {
        found = stack.slice(stack.indexOf(next)).concat(next);
        return;
      }
      if (!state.has(next)) visit(next);
      if (found) return;
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of needs.keys()) {
    if (found) break;
    if (!state.has(id)) visit(id);
  }
  return found;
}

function findProblems(jobs) {
  const problems = [];
  const ids = new Set(jobs.map((j) => j.id));
  for (const job of jobs) {
    for (const need of job.needs) {
      if (!ids.has(need)) problems.push('Job "' + job.id + '" needs "' + need + '", which does not exist.');
    }
  }
  const cycle = findCycle(jobs);
  if (cycle) problems.push('Jobs form a dependency cycle: ' + cycle.join(' -> ') + '.');
  return problems;
}

function workflowSupport(workflow) {
  if (workflow.parseError || workflow.jobs.length === 0) return 'unsupported';
  if (workflow.jobs.every((j) => j.support === 'unsupported')) return 'unsupported';
  if (workflow.problems.length || workflow.jobs.some((j) => j.support !== 'full')) return 'partial';
  return 'full';
}

function readError(err) {
  const pos = Array.isArray(err.linePos) && err.linePos[0] ? err.linePos[0] : null;
  return {
    message: String(err.message || 'The file could not be parsed.').split('\n')[0],
    line: pos ? pos.line : null,
    col: pos ? pos.col : null,
  };
}

function parseWorkflowText(file, text) {
  const workflow = emptyWorkflow(file, text);
  const lineCounter = new YAML.LineCounter();
  let doc;
  try {
    doc = YAML.parseDocument(text, { lineCounter });
  } catch (e) {
    workflow.parseError = { message: e.message, line: null, col: null };
    return workflow;
  }
  if (doc.errors.length) {
    workflow.parseError = readError(doc.errors[0]);
    return workflow;
  }
  let data;
  try {
    data = doc.toJS();
  } catch (e) {
    workflow.parseError = { message: String(e.message).split('\n')[0], line: null, col: null };
    return workflow;
  }
  if (!isObject(data)) {
    workflow.parseError = { message: 'The file is not a YAML mapping.', line: null, col: null };
    return workflow;
  }

  const stepLine = (jobId, index) => {
    const node = doc.getIn(['jobs', jobId, 'steps'], true);
    if (YAML.isSeq(node) && node.items[index] && node.items[index].range) {
      return lineCounter.linePos(node.items[index].range[0]).line;
    }
    return null;
  };

  workflow.name = str(data.name) || file;
  const triggers = readTriggers(data.on !== undefined ? data.on : data.true);
  workflow.triggers = triggers.names;
  workflow.triggerFilters = triggers.filters;
  workflow.idTokenWrite = isObject(data.permissions) && data.permissions['id-token'] === 'write';

  if (isObject(data.jobs)) {
    workflow.jobs = Object.keys(data.jobs).map((id) => normalizeJob(id, data.jobs[id], stepLine));
  }
  if (workflow.jobs.length === 0) workflow.problems.push('The workflow defines no jobs.');
  workflow.problems = workflow.problems.concat(findProblems(workflow.jobs));

  const features = new Set();
  for (const job of workflow.jobs) {
    for (const feature of job.features) features.add(feature);
  }
  workflow.features = Array.from(features);

  const cls = classify(workflow);
  workflow.category = cls.category;
  workflow.deployBlocked = cls.deployBlocked;
  workflow.deployReasons = cls.deployReasons;
  workflow.support = workflowSupport(workflow);
  return workflow;
}

function readWorkflowFile(dir, name) {
  const full = path.join(dir, name);
  let text;
  try {
    const stat = fs.lstatSync(full);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_BYTES) return failedWorkflow(name, 'The file is larger than ' + MAX_BYTES / 1024 + ' KB and was not read.');
    text = fs.readFileSync(full, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    return failedWorkflow(name, 'The file could not be read: ' + e.message);
  }
  return parseWorkflowText(name, text.replace(/^\uFEFF/, ''));
}

function discover(repoPath) {
  const dir = path.join(repoPath, WORKFLOW_DIR);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return { dirExists: false, workflows: [] };
  }
  const names = entries
    .filter((e) => e.isFile() && FILE_RE.test(e.name))
    .map((e) => e.name)
    .sort();
  const workflows = names.map((name) => readWorkflowFile(dir, name)).filter(Boolean);
  return { dirExists: true, workflows };
}

function getWorkflow(repoPath, file) {
  if (!isWorkflowFile(file)) return null;
  return readWorkflowFile(path.join(repoPath, WORKFLOW_DIR), file);
}

function readRunScripts(repoPath, file) {
  if (!isWorkflowFile(file)) return null;
  let text;
  try {
    const full = path.join(repoPath, WORKFLOW_DIR, file);
    const stat = fs.lstatSync(full);
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    text = fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
  } catch (e) {
    return null;
  }

  let data;
  try {
    data = YAML.parse(text);
  } catch (e) {
    return null;
  }
  if (!isObject(data) || !isObject(data.jobs)) return null;

  const scripts = {};
  for (const jobId of Object.keys(data.jobs)) {
    const job = data.jobs[jobId];
    if (!isObject(job) || !Array.isArray(job.steps)) continue;
    job.steps.forEach((step, index) => {
      if (isObject(step) && typeof step.run === 'string') scripts[jobId + ':' + index] = step.run;
    });
  }
  return { hash: crypto.createHash('sha256').update(text).digest('hex'), scripts };
}

function summarize(workflow) {
  return {
    file: workflow.file,
    name: workflow.name,
    category: workflow.category,
    support: workflow.support,
    triggers: workflow.triggers,
    jobCount: workflow.jobs.length,
    deployBlocked: workflow.deployBlocked,
    deployReasons: workflow.deployReasons,
    features: workflow.features,
    problems: workflow.problems,
    parseError: workflow.parseError,
    hash: workflow.hash,
  };
}

module.exports = { WORKFLOW_DIR, discover, getWorkflow, readRunScripts, summarize, parseWorkflowText, isWorkflowFile };