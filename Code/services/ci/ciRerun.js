'use strict';

const CI_PREFIX = 'ci:';
const WHICH = ['failed', 'same'];
const MODES = ['full', 'selected', 'single'];

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function workflowFileOf(detail) {
  const run = detail && detail.run;
  if (!run || run.kind !== 'ci') return null;
  if (typeof run.actionId !== 'string' || !run.actionId.startsWith(CI_PREFIX)) return null;
  const file = run.actionId.slice(CI_PREFIX.length);
  return file || null;
}

function incompleteJobIds(steps) {
  const finished = new Map();
  for (const step of Array.isArray(steps) ? steps : []) {
    if (!step || !step.jobId) continue;
    const previous = finished.has(step.jobId) ? finished.get(step.jobId) : true;
    finished.set(step.jobId, previous && step.status === 'done');
  }
  const out = [];
  for (const [id, ok] of finished) {
    if (!ok) out.push(id);
  }
  return out;
}

function storedPlan(detail) {
  const meta = detail && detail.run ? detail.run.meta : null;
  if (!meta || typeof meta !== 'object' || meta.truncated) return null;
  return meta;
}

function selectRerun(options) {
  const o = options || {};
  const detail = o.detail;
  const workflow = o.workflow;

  if (!WHICH.includes(o.which)) throw fail(400, 'Choose to rerun the failed jobs or the same jobs.');

  const file = workflowFileOf(detail);
  if (!file) throw fail(400, 'That run is not a CI workflow run.');
  if (!workflow || workflow.file !== file) throw fail(409, 'That run belongs to a different workflow file.');
  if (workflow.parseError) throw fail(400, 'The workflow has a YAML parse error, so it cannot be planned.');

  const known = new Set((workflow.jobs || []).map((job) => job.id));
  const meta = storedPlan(detail);
  const snapshotHash = meta && meta.workflow && typeof meta.workflow.hash === 'string' ? meta.workflow.hash : null;
  const workflowChanged = !snapshotHash || snapshotHash !== workflow.hash;

  let mode;
  let wanted;
  let failedJobIds = [];

  if (o.which === 'failed') {
    failedJobIds = incompleteJobIds(detail.steps);
    if (!failedJobIds.length) {
      throw fail(400, 'Every job in that run finished successfully, so there is nothing to rerun.');
    }
    mode = 'selected';
    wanted = failedJobIds;
  } else {
    if (!meta || !MODES.includes(meta.mode)) {
      throw fail(409, 'The stored plan for that run is incomplete, so the same jobs cannot be rebuilt. Build a new plan instead.');
    }
    if (meta.mode === 'full') {
      mode = 'full';
      wanted = [];
    } else {
      const ids = Array.isArray(meta.selectedJobs) ? meta.selectedJobs.filter((id) => typeof id === 'string') : [];
      if (!ids.length) {
        throw fail(409, 'The stored plan for that run has no jobs, so the same jobs cannot be rebuilt. Build a new plan instead.');
      }
      mode = 'selected';
      wanted = ids;
    }
  }

  const missing = wanted.filter((id) => !known.has(id));
  if (missing.length) {
    throw fail(409, 'The workflow no longer has these jobs: ' + missing.join(', ') + '. Review the workflow and build a new plan.');
  }

  const wantedSet = new Set(wanted);
  const jobIds = mode === 'full' ? [] : (workflow.jobs || []).filter((job) => wantedSet.has(job.id)).map((job) => job.id);

  return {
    file,
    mode,
    jobIds,
    failedJobIds,
    workflowChanged,
    source: { id: detail.run.id, status: detail.run.status },
  };
}

module.exports = { selectRerun, workflowFileOf, incompleteJobIds };