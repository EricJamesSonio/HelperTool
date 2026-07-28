const { runOpencode } = require('./runner');
const { validate } = require('./validator');
const { improvePrompt } = require('./promptFixer');
const { runTest } = require('./testRunner');
const { discover } = require('../ipc/opencode_ipc');

async function runHarness(config, onEvent) {
  const { prompt, maxRetries = 3, testCommand, timeoutMs } = config;
  const results = [];

  const { binaryPath, version } = await discover();
  if (binaryPath === 'opencode') {
    onEvent({ type: 'log', attempt: 0, message: '[Setup] opencode binary not found on PATH or known install locations.' });
    onEvent({ type: 'final', success: false, attempts: 0, output: '', error: 'opencode not found' });
    return { success: false, attempts: 0, output: '', results, error: 'opencode not found' };
  }
  onEvent({ type: 'log', attempt: 0, message: `[Setup] Using opencode at "${binaryPath}" (${version})` });

  let currentPrompt = prompt;
  const attempts = [];

  for (let i = 0; i < maxRetries; i++) {
    const attempt = i + 1;

    onEvent({ type: 'log', attempt, message: `[Attempt ${attempt}] Running opencode...` });

    const result = await runOpencode(config.repoPath || process.cwd(), currentPrompt, binaryPath, timeoutMs);

    attempts.push(result);
    onEvent({ type: 'log', attempt, message: result.output || '(no output)' });
    if (result.error) {
      onEvent({ type: 'log', attempt, message: `[stderr] ${result.error}` });
    }

    const validation = validate(result, config);
    results.push({ attempt, passed: validation.pass, reason: validation.reason });

    if (!validation.pass) {
      onEvent({ type: 'result', attempt, passed: false, reason: validation.reason });
      currentPrompt = improvePrompt(prompt, validation.reason, attempt);
      continue;
    }

    onEvent({ type: 'result', attempt, passed: true });

    if (testCommand) {
      onEvent({ type: 'log', attempt, message: `[Test] Running: ${testCommand}` });
      const testResult = await runTest(config.repoPath || process.cwd(), testCommand);
      if (!testResult.pass) {
        onEvent({ type: 'result', attempt, passed: false, reason: 'Tests failed' });
        currentPrompt = improvePrompt(prompt, testResult.error || 'Tests failed', attempt);
        continue;
      }
      onEvent({ type: 'log', attempt, message: '[Test] Passed' });
    }

    onEvent({ type: 'final', success: true, attempts: attempt, output: result.output });
    return { success: true, attempts: attempt, output: result.output, results };
  }

  const lastResult = attempts[attempts.length - 1] || { output: '' };
  onEvent({ type: 'final', success: false, attempts: maxRetries, output: lastResult.output });
  return { success: false, attempts: maxRetries, output: lastResult.output, results };
}

module.exports = { runHarness };