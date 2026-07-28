function improvePrompt(originalPrompt, reason, attempt) {
  return `${originalPrompt}

[Harness Retry #${attempt}]
Your previous output failed validation.
Reason: ${reason}

Please fix the issue and provide a corrected result.`;
}

module.exports = { improvePrompt };
