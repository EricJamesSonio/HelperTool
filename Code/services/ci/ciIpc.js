'use strict';

const path = require('path');
const ci = require('./ciWorkflows');
const { buildPlan } = require('./ciPlan');
const manifest = require('../consoleManifest');

function trustKey(repoPath, file) {
  return `ci:${path.resolve(repoPath)}:${file}`;
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
    if (!ci.isWorkflowFile(file)) throw httpError(400, 'That is not a workflow file name.');

    const workflow = ci.getWorkflow(repoPath, file);
    if (!workflow) throw httpError(404, 'That workflow file was not found.');

    return {
      workflow: {
        ...workflow,
        trusted: manifest.isTrusted(trustKey(repoPath, file), workflow.hash),
      },
    };
  });

  handle('repoConsole:ciPlan', ({ repoPath, file, mode, jobIds, approvedSkips }) => {
    knownRepo(repoPath);
    if (!ci.isWorkflowFile(file)) throw httpError(400, 'That is not a workflow file name.');

    const workflow = ci.getWorkflow(repoPath, file);
    if (!workflow) throw httpError(404, 'That workflow file was not found.');

    const trusted = manifest.isTrusted(trustKey(repoPath, file), workflow.hash);
    return buildPlan({ repoPath, workflow, mode, jobIds, approvedSkips, trusted });
  });

  handle('repoConsole:ciTrust', ({ repoPath, file, hash }) => {
    knownRepo(repoPath);
    if (!ci.isWorkflowFile(file)) throw httpError(400, 'That is not a workflow file name.');

    const workflow = ci.getWorkflow(repoPath, file);
    if (!workflow) throw httpError(404, 'That workflow file was not found.');
    if (typeof hash !== 'string' || hash !== workflow.hash) {
      throw httpError(409, 'The workflow changed since you reviewed it. Reload and review it again.');
    }

    manifest.setTrusted(trustKey(repoPath, file), hash);
    return { trusted: true };
  });
}

module.exports = { register };