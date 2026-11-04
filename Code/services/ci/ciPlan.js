'use strict';

const crypto = require('crypto');
const path = require('path');
const manifest = require('../consoleManifest');
const { analyzeCondition, analyzeExpressions } = require('./ciConditions');

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string'))];
}

function topologicalOrder(jobs) {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const visited = new Set();
  const visiting = new Set();
  const ordered = [];
  let cycle = false;

  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      cycle = true;
      return;
    }
    const job = byId.get(id);
    if (!job) return;

    visiting.add(id);
    for (const dependency of job.needs) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    ordered.push(job);
  }

  for (const job of jobs) visit(job.id);
  return { ordered, cycle };
}

function selectedJobIds(workflow, mode, jobIds) {
  const ids = new Set(workflow.jobs.map((job) => job.id));
  const requested = uniqueStrings(jobIds);

  for (const id of requested) {
    if (!ids.has(id)) throw Object.assign(new Error(`Unknown job: ${id}`), { status: 400 });
  }

  if (!['full', 'selected', 'single'].includes(mode)) {
    throw Object.assign(new Error('Invalid CI plan mode.'), { status: 400 });
  }

  if (mode === 'full') return workflow.jobs.map((job) => job.id);
  if (!requested.length) {
    throw Object.assign(new Error('Select at least one job.'), { status: 400 });
  }
  if (mode === 'single' && requested.length !== 1) {
    throw Object.assign(new Error('Single-job mode requires exactly one job.'), { status: 400 });
  }

  const byId = new Map(workflow.jobs.map((job) => [job.id, job]));
  const included = new Set();

  function include(id) {
    if (included.has(id)) return;
    included.add(id);
    const job = byId.get(id);
    if (job) for (const need of job.needs) include(need);
  }

  for (const id of requested) include(id);
  return workflow.jobs.filter((job) => included.has(job.id)).map((job) => job.id);
}

function buildPlan({ repoPath, workflow, mode = 'full', jobIds = [], approvedSkips = [], trusted = false }) {
  const blockers = [];
  const approved = new Set(uniqueStrings(approvedSkips));
  const selectedIds = selectedJobIds(workflow, mode, jobIds);
  const selected = new Set(selectedIds);

  if (workflow.parseError) blockers.push('The workflow has a YAML parse error.');
  if (workflow.deployBlocked) blockers.push('Deployment and release workflows are disabled for local runs.');

  for (const problem of workflow.problems || []) blockers.push(problem);

  const selectedJobs = workflow.jobs.filter((job) => selected.has(job.id));
  const { ordered, cycle } = topologicalOrder(selectedJobs);
  if (cycle) blockers.push('Selected jobs contain a dependency cycle.');

  const jobs = ordered.map((job) => {
    const reasons = [];
    const steps = job.steps.map((step) => {
      const key = `${job.id}:${step.index}`;
      const condition = analyzeCondition(step.if);
      const expressions = analyzeExpressions(step.run);
      const relativeCwd = step.workingDirectory || job.workingDirectory || '.';
      const cwd = path.resolve(repoPath, relativeCwd);
      const cwdValid = manifest.isInside(repoPath, cwd);

      let kind = 'unsupported';
      let reason = null;

      if (!cwdValid) {
        reason = 'Working directory resolves outside this repository.';
      } else if (condition.review) {
        kind = 'unsupported';
        reason = 'Condition requires manual review.';
      } else if (condition.result === 'skip') {
        kind = 'skipped';
        reason = 'Condition is always false.';
      } else if (step.kind === 'run') {
        if (expressions.review || step.support === 'partial') {
          kind = 'unsupported';
          reason = 'Command contains expressions that are not supported yet.';
        } else {
          kind = condition.result === 'runtime' ? 'review' : 'run';
          if (condition.result === 'runtime') reason = 'Condition depends on runtime job status.';
        }
      } else if (step.kind === 'uses' && (step.support === 'satisfied' || step.support === 'validate')) {
        kind = 'satisfied';
        reason =
          step.support === 'validate'
            ? 'Checked against the installed runtime during preflight. Nothing is installed.'
            : 'The repository is already checked out locally.';
      } else if (step.kind === 'uses' && step.support === 'skipped') {
        kind = 'skipped';
        reason = 'This action is intentionally skipped locally.';
      } else if (approved.has(key)) {
        kind = 'skipped';
        reason = 'Unsupported action skipped with user approval.';
      } else {
        reason = step.notes && step.notes[0] ? step.notes[0] : 'This step is unsupported locally.';
      }

      return {
        key,
        index: step.index,
        name: step.name || step.run || step.uses || `Step ${step.index + 1}`,
        kind,
        shell: step.shell,
        cwd,
        command: step.run,
        uses: step.uses,
        envNames: step.env || [],
        secretNames: expressions.secretNames,
        referencedEnvNames: expressions.envNames,
        risk: 'changes',
        timeoutMs: null,
        ifResult: condition.result,
        line: step.line,
        reason,
      };
    });

    const state = steps.some((step) => step.kind === 'unsupported')
      ? 'unsupported'
      : steps.some((step) => step.kind === 'review')
        ? 'review'
        : 'ready';

    if (state !== 'ready') reasons.push(`Job contains ${state} steps.`);

    return {
      id: job.id,
      name: job.name,
      needs: job.needs,
      state,
      reasons,
      steps,
    };
  });

  const plan = {
    repoPath,
    workflow: { file: workflow.file, name: workflow.name, hash: workflow.hash },
    mode,
    selectedJobs: jobs.map((job) => job.id),
    trusted,
    jobs,
    blockers,
  };

  const hash = crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  return { plan: { ...plan, hash }, planHash: hash };
}

module.exports = { buildPlan };