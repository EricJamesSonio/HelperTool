'use strict';

const path = require('path');
const ci = require('./ciWorkflows');
const { buildPlan } = require('./ciPlan');
const ciEnv = require('./ciEnv');
const { preflight } = require('./ciPreflight');
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

function register({ handle, knownRepo, httpError }) {
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
}

module.exports = { register };