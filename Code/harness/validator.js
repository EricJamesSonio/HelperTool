function validate(result, config) {
  const { output, exitCode } = result;
  const type = config.validationType || 'json';
  const keyword = config.keyword || '';
  const pattern = config.pattern || '';

  switch (type) {
    case 'json':
      try {
        JSON.parse(output);
        return { pass: true, reason: '' };
      } catch {
        return { pass: false, reason: 'Output is not valid JSON' };
      }

    case 'keyword': {
      if (!keyword) return { pass: true, reason: '' };
      const found = output.toLowerCase().includes(keyword.toLowerCase());
      return found
        ? { pass: true, reason: '' }
        : { pass: false, reason: `Output does not contain keyword "${keyword}"` };
    }

    case 'exit':
      return exitCode === 0
        ? { pass: true, reason: '' }
        : { pass: false, reason: `Exit code ${exitCode} is not 0` };

    case 'regex': {
      if (!pattern) return { pass: true, reason: '' };
      try {
        const re = new RegExp(pattern);
        return re.test(output)
          ? { pass: true, reason: '' }
          : { pass: false, reason: `Output does not match pattern ${pattern}` };
      } catch {
        return { pass: false, reason: 'Invalid regex pattern' };
      }
    }

    default:
      return { pass: true, reason: '' };
  }
}

module.exports = { validate };
