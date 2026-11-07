'use strict';

const path = require('path');
const { evaluatePathFilter } = require('./ciPathMatch');

const WORKFLOW_PREFIX = '.github/workflows/';
const PATH_EVENTS = ['push', 'pull_request', 'pull_request_target'];
const SAMPLE_FILES = 3;
const SAMPLE_OUTCOME = 5;
const MAX_SHARED = 20;

function normalizeDir(value) {
  if (typeof value !== 'string') return '.';
  const text = value.trim().replace(/\\/g, '/');
  if (!text || text.includes('${{')) return null;
  if (text.startsWith('/') || /^[A-Za-z]:/.test(text)) return null;
  const parts = [];
  for (const part of text.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') return null;
    parts.push(part);
  }
  return parts.length ? parts.join('/') : '.';
}

function inDir(file, dir) {
  return file === dir || file.startsWith(dir + '/');
}

function jobScope(job) {
  const directories = new Set();
  let runSteps = 0;
  let unresolved = false;
  let atRoot = false;

  for (const step of job.steps || []) {
    if (step.kind !== 'run') continue;
    runSteps += 1;
    const dir = normalizeDir(step.workingDirectory || job.workingDirectory || '.');
    if (dir === null) {
      unresolved = true;
    } else if (dir === '.') {
      atRoot = true;
    } else {
      directories.add(dir);
    }
  }

  if (!runSteps) {
    return { kind: 'root', directories: [], why: 'It has no command steps, so its scope is unknown and any relevant change may affect it.' };
  }
  if (unresolved) {
    return { kind: 'root', directories: [], why: 'A working directory could not be resolved, so any relevant change may affect it.' };
  }
  if (atRoot) {
    return { kind: 'root', directories: [], why: 'It runs commands at the repository root, so any relevant change may affect it.' };
  }
  return { kind: 'directory', directories: Array.from(directories).sort(), why: '' };
}

function scopeFiles(files, topLevel, repoPath) {
  const list = Array.isArray(files) ? files : [];
  if (!topLevel || !repoPath) return list;
  const rel = path.relative(path.resolve(topLevel), path.resolve(repoPath)).split(path.sep).join('/');
  if (!rel) return list;
  if (rel.startsWith('..')) return [];
  const prefix = rel + '/';
  return list.filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length));
}

function decideFilters(workflow, files, truncated) {
  const warnings = [];
  const workflowFile = WORKFLOW_PREFIX + workflow.file;

  if (files.includes(workflowFile)) {
    return {
      mode: 'workflow-changed',
      triggered: true,
      events: [],
      relevant: files,
      reason: 'The workflow file itself changed, so every job is selected.',
      note: '',
      warnings,
    };
  }

  if (truncated) {
    warnings.push('Git reported more changed files than were listed, so path filters were not applied.');
    return {
      mode: 'truncated',
      triggered: true,
      events: [],
      relevant: files,
      reason: 'The list of changed files is incomplete, so every job is selected to be safe.',
      note: '',
      warnings,
    };
  }

  const triggers = Array.isArray(workflow.triggers) ? workflow.triggers : [];
  const filters = workflow.triggerFilters || {};
  const events = PATH_EVENTS.filter((event) => triggers.includes(event));

  if (!events.length) {
    return {
      mode: 'unfiltered',
      triggered: true,
      events: [],
      relevant: files,
      reason: '',
      note: 'This workflow has no push or pull_request trigger, so path filters do not apply.',
      warnings,
    };
  }

  const outcomes = [];
  const relevantSet = new Set();
  let triggered = false;
  let filtered = false;
  let allFiles = false;

  for (const event of events) {
    const result = evaluatePathFilter(files, filters[event]);
    if (result.warning) warnings.push(event + ': ' + result.warning);
    outcomes.push({
      event,
      outcome: result.outcome,
      matchedCount: result.matched.length,
      sample: result.matched.slice(0, SAMPLE_OUTCOME),
    });
    if (result.outcome === 'matched') {
      triggered = true;
      filtered = true;
      for (const file of result.matched) relevantSet.add(file);
    } else if (result.outcome === 'ignored') {
      filtered = true;
    } else {
      triggered = true;
      allFiles = true;
    }
  }

  return {
    mode: filtered ? 'filtered' : 'unfiltered',
    triggered,
    events: outcomes,
    relevant: allFiles ? files : files.filter((file) => relevantSet.has(file)),
    reason: triggered
      ? ''
      : 'The paths filters on ' + events.join(' and ') + ' exclude every changed file, so GitHub would not run this workflow.',
    note: '',
    warnings,
  };
}

function sampleText(files) {
  const shown = files.slice(0, SAMPLE_FILES).join(', ');
  const more = files.length - SAMPLE_FILES;
  return more > 0 ? shown + ' and ' + more + ' more' : shown;
}

function emptyResult(workflow) {
  return {
    file: workflow ? workflow.file : '',
    fileCount: 0,
    mode: 'none',
    triggered: false,
    note: '',
    filters: [],
    jobs: [],
    selectedJobIds: [],
    dependencyJobIds: [],
    sharedFiles: [],
    sharedCount: 0,
    warnings: [],
    summary: '',
  };
}

function selectJobs(options) {
  const o = options || {};
  const workflow = o.workflow;
  const result = emptyResult(workflow);

  if (!workflow || workflow.parseError || !Array.isArray(workflow.jobs) || !workflow.jobs.length) {
    result.summary = 'The workflow has no jobs that Smart CI can choose from.';
    return result;
  }

  const files = Array.from(new Set((Array.isArray(o.files) ? o.files : []).filter((f) => typeof f === 'string' && f)));
  const scopes = workflow.jobs.map((job) => ({ job, scope: jobScope(job) }));
  result.fileCount = files.length;

  if (!files.length) {
    result.jobs = scopes.map(({ job, scope }) => ({
      id: job.id,
      name: job.name,
      selected: false,
      dependency: false,
      reason: 'There are no changed files.',
      scope: scope.kind,
      directories: scope.directories,
      files: [],
    }));
    result.summary = 'There are no changed files, so no jobs were selected.';
    return result;
  }

  const decided = decideFilters(workflow, files, !!o.truncated);
  result.mode = decided.mode;
  result.triggered = decided.triggered;
  result.note = decided.note;
  result.filters = decided.events;
  result.warnings = decided.warnings.slice();

  const selectAll = decided.mode === 'workflow-changed' || decided.mode === 'truncated';

  const entries = scopes.map(({ job, scope }) => {
    const entry = {
      id: job.id,
      name: job.name,
      selected: false,
      dependency: false,
      reason: '',
      scope: scope.kind,
      directories: scope.directories,
      files: [],
    };

    if (selectAll) {
      entry.selected = true;
      entry.reason = decided.reason;
    } else if (!decided.triggered) {
      entry.reason = decided.reason;
    } else if (scope.kind === 'root') {
      entry.selected = true;
      entry.reason = scope.why;
    } else {
      const hits = decided.relevant.filter((file) => scope.directories.some((dir) => inDir(file, dir)));
      entry.files = hits.slice(0, SAMPLE_FILES);
      if (hits.length) {
        entry.selected = true;
        entry.reason = 'Changed files under ' + scope.directories.join(', ') + ': ' + sampleText(hits) + '.';
      } else {
        entry.reason = 'No changed files under ' + scope.directories.join(', ') + '.';
      }
    }
    return entry;
  });

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const needsById = new Map(workflow.jobs.map((job) => [job.id, Array.isArray(job.needs) ? job.needs : []]));

  for (const root of entries.filter((entry) => entry.selected)) {
    const stack = (needsById.get(root.id) || []).slice();
    const seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const target = byId.get(id);
      if (!target) continue;
      if (!target.selected && !target.dependency) {
        target.dependency = true;
        target.reason = target.reason + ' Included because job "' + root.name + '" needs it.';
      }
      for (const next of needsById.get(id) || []) stack.push(next);
    }
  }

  if (!selectAll && decided.triggered) {
    const dirScopes = scopes.filter((item) => item.scope.kind === 'directory');
    const shared = decided.relevant.filter(
      (file) => !dirScopes.some((item) => item.scope.directories.some((dir) => inDir(file, dir)))
    );
    result.sharedCount = shared.length;
    result.sharedFiles = shared.slice(0, MAX_SHARED);
    const skipped = entries.some((entry) => entry.scope === 'directory' && !entry.selected);
    if (shared.length && skipped) {
      result.warnings.push(
        shared.length +
          ' changed file(s) are outside every job directory (for example ' +
          shared[0] +
          '). Jobs limited to a folder were not selected for them. Use Full CI if they affect every job.'
      );
    }
  }

  result.jobs = entries;
  result.selectedJobIds = entries.filter((entry) => entry.selected).map((entry) => entry.id);
  result.dependencyJobIds = entries.filter((entry) => entry.dependency).map((entry) => entry.id);

  if (!decided.triggered) {
    result.summary = decided.reason;
  } else {
    const extra = result.dependencyJobIds.length ? ', plus ' + result.dependencyJobIds.length + ' needed by dependencies' : '';
    result.summary = result.selectedJobIds.length + ' of ' + entries.length + ' job(s) selected' + extra + '.';
  }
  return result;
}

module.exports = { selectJobs, jobScope, normalizeDir, scopeFiles };