'use strict';

const path = require('path');
const ci = require('./ciWorkflows');
const { buildPlan } = require('./ciPlan');
const ciEnv = require('./ciEnv');
const { preflight } = require('./ciPreflight');
const { startCiRun } = require('./ciExecutor');
const { getChanges } = require('./ciChanges');
const { selectJobs, scopeFiles } = require('./ciSmart');
const { selectRerun, workflowFileOf } = require('./ciRerun');
const history = require('../../database/consoleDb');
const manifest = require('../consoleManifest');

function trustKey(repoPath, file) {
  return 'ci:' + path.resolve(repoPath) + ':' + file;
}

function currentWorkflow(repoPath, file, httpError) {
  if (!ci.isWorkflowFile(file)) throw httpError(400, 'That is not a workflow file name.');
  const workflow = ci.getWorkflow(repoPath, file);
  if (!workflow) throw httpError(404, 'That workflow file was not found.');
  return workflow;
}

function register({ handle, knownRepo, httpError, runner }) {
  handle('repoConsole:ciDiscover', ({ repoPath }) => {
    knownRepo(repoPath);
    const found = ci.discover(repoPath);
    return {
      dirExists: found.dirExists,
      workflows: found.workflows.map((workflow) => ({
        ...ci.summarize(workflow),
        trusted: manifest.isTrusted(trustKey(repoPath, workflow.file), workflow.hash),
      })),
    };
  });

  handle('repoConsole:ciWorkflow', ({ repoPath, file }) => {
    knownRepo(repoPath);
    const workflow = currentWorkflow(repoPath, file, httpError);
    return {
      workflow: {
        ...workflow,
        trusted: manifest.isTrusted(trustKey(repoPath, file), workflow.hash),
      },
    };
  });

  handle('repoConsole:ciPlan', ({ repoPath, file, mode, jobIds, approvedSkips }) => {
    knownRepo(repoPath);
    const workflow = currentWorkflow(repoPath, file, httpError);
    const trusted = manifest.isTrusted(trustKey(repoPath, file), workflow.hash);
    return buildPlan({ repoPath, workflow, mode, jobIds, approvedSkips, trusted });
  });

  handle('repoConsole:ciTrust', ({ repoPath, file, hash }) => {
    knownRepo(repoPath);
    const workflow = currentWorkflow(repoPath, file, httpError);
    if (typeof hash !== 'string' || hash !== workflow.hash) {
      throw httpError(409, 'The workflow changed since you reviewed it. Reload and review it again.');
    }

    manifest.setTrusted(trustKey(repoPath, file), hash);
    return { trusted: true };
  });

  handle('repoConsole:ciEnvGet', ({ repoPath }) => {
    knownRepo(repoPath);
    return { names: ciEnv.getNames(manifest.getRepoConsoleDir(), repoPath) };
  });

  handle('repoConsole:ciEnvSet', ({ repoPath, values }) => {
    knownRepo(repoPath);
    const names = ciEnv.setValues(manifest.getRepoConsoleDir(), repoPath, values);
    return { names };
  });

  handle('repoConsole:ciEnvDelete', ({ repoPath, name }) => {
    knownRepo(repoPath);
    const names = ciEnv.deleteValue(manifest.getRepoConsoleDir(), repoPath, name);
    return { names };
  });

  handle('repoConsole:ciPreflight', async ({ repoPath, file, mode, jobIds, approvedSkips, planHash }) => {
    knownRepo(repoPath);
    const workflow = currentWorkflow(repoPath, file, httpError);
    const trusted = manifest.isTrusted(trustKey(repoPath, file), workflow.hash);
    const rebuilt = buildPlan({ repoPath, workflow, mode, jobIds, approvedSkips, trusted });

    if (typeof planHash !== 'string' || planHash !== rebuilt.planHash) {
      throw httpError(409, 'The plan changed since it was reviewed. Build and review the plan again.');
    }

    const values = ciEnv.getValues(manifest.getRepoConsoleDir(), repoPath);
    const result = await preflight({ repoPath, workflow, plan: rebuilt.plan, envValues: values });
    return { preflight: result };
  });

  handle('repoConsole:ciChanges', async ({ repoPath, base }) => {
    knownRepo(repoPath);
    const changes = await getChanges({ repoPath, base });
    return { changes };
  });

  handle('repoConsole:ciSmart', async ({ repoPath, file, base }) => {
    knownRepo(repoPath);
    const workflow = currentWorkflow(repoPath, file, httpError);
    if (workflow.parseError) {
      throw httpError(400, 'The workflow has a YAML parse error, so Smart CI cannot choose jobs.');
    }
    const changes = await getChanges({ repoPath, base });
    const files = scopeFiles(
      changes.files.map((entry) => entry.file),
      changes.topLevel,
      repoPath
    );
    const smart = selectJobs({ workflow, files, truncated: changes.truncated });
    return { changes, smart };
  });

  handle('repoConsole:ciRerunPlan', ({ repoPath, id, which }) => {
    knownRepo(repoPath);
    if (typeof id !== 'string' || !id) throw httpError(400, 'No run selected.');
    if (runner && runner.isRunning(repoPath)) {
      throw httpError(409, 'Another job is still running in this repository. Wait for it or press Stop.');
    }
    const detail = history.getRun(id);
    if (!detail || detail.run.repoPath !== repoPath) throw httpError(404, 'That run was not found.');

    const file = workflowFileOf(detail);
    if (!file || !ci.isWorkflowFile(file)) throw httpError(400, 'That run is not a CI workflow run.');

    const workflow = currentWorkflow(repoPath, file, httpError);
    const picked = selectRerun({ detail, workflow, which });
    const trusted = manifest.isTrusted(trustKey(repoPath, file), workflow.hash);
    const rebuilt = buildPlan({
      repoPath,
      workflow,
      mode: picked.mode,
      jobIds: picked.jobIds,
      approvedSkips: [],
      trusted,
    });

    return {
      file,
      mode: picked.mode,
      jobIds: picked.jobIds,
      failedJobIds: picked.failedJobIds,
      workflowChanged: picked.workflowChanged,
      source: picked.source,
      plan: rebuilt.plan,
      planHash: rebuilt.planHash,
    };
  });

  handle('repoConsole:ciRun', async ({ repoPath, file, mode, jobIds, approvedSkips, planHash, ack }) => {
    knownRepo(repoPath);
    if (!runner) throw httpError(500, 'The console runner is not available.');
    if (!ci.isWorkflowFile(file)) throw httpError(400, 'That is not a workflow file name.');
    const result = await startCiRun({
      repoPath,
      file,
      mode,
      jobIds,
      approvedSkips,
      planHash,
      ack,
      runner,
      dataDir: manifest.getRepoConsoleDir(),
      isTrusted: (hash) => manifest.isTrusted(trustKey(repoPath, file), hash),
    });
    return { job: result.job };
  });
}

module.exports = { register };