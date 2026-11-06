'use strict';

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

function sevRank(sev) {
  const i = SEV_ORDER.indexOf(sev);
  return i === -1 ? 9 : i;
}

function evidenceLine(e) {
  return '- `' + e.file + (e.line ? ':' + e.line : '') + '` ' + e.text;
}

function toMarkdown(r) {
  const out = [];
  const s = r.score;
  out.push('# Security test report', '');
  out.push('- Repository: ' + r.repoName);
  out.push('- Date: ' + new Date(r.startedAt).toISOString());
  out.push('- Live target: ' + (r.targetTested ? r.target : 'not tested (' + r.dynamicNote + ')'));
  out.push('- Files scanned: ' + r.scanInfo.files + (r.scanInfo.truncated ? ' (limit reached)' : ''));
  out.push('- Requests sent: ' + r.scanInfo.requests);
  out.push(
    '- Stack: frontend ' + r.profile.frontend.framework + ', backend ' + r.profile.backend.framework + ', database ' + r.profile.database.dialect + ', auth ' + r.profile.auth.mechanism
  );
  out.push('');
  out.push('## Score', '');
  out.push('Overall: ' + (s.overall === null ? 'n/a' : s.overall + '% (grade ' + s.grade + ')'));
  out.push(
    'Failed: ' + s.counts.fail + ' (critical ' + s.counts.critical + ', high ' + s.counts.high + ', medium ' + s.counts.medium + ', low ' + s.counts.low + '). Passed: ' + s.counts.pass + '. Could not run: ' + s.counts.skip + '. Not applicable: ' + s.counts.na + '.'
  );
  out.push('');
  out.push('| Level | Score | Passed | Failed | Achieved |', '|---|---|---|---|---|');
  for (const id of ['basic', 'medium', 'advanced']) {
    const l = s.levels[id];
    out.push('| ' + id + ' | ' + (l.score === null ? 'no checks' : l.score + '%') + ' | ' + l.passed + ' | ' + l.failed + ' | ' + (l.achieved ? 'yes' : 'no') + ' |');
  }
  out.push('');
  out.push('| Category | Score | Passed | Failed |', '|---|---|---|---|');
  for (const c of s.categories) {
    out.push('| ' + c.name + ' | ' + (c.score === null ? 'n/a' : c.score + '%') + ' | ' + c.passed + ' | ' + c.failed + ' |');
  }
  out.push('');

  const failed = r.findings.filter((f) => f.status === 'fail').sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  out.push('## Failed checks (' + failed.length + ')', '');
  if (!failed.length) out.push('No failed checks.', '');
  for (const f of failed) {
    out.push('### [' + f.severity.toUpperCase() + '] ' + f.title);
    out.push('- Level: ' + f.level + ' / Category: ' + f.category + ' / Type: ' + f.kind + (f.owasp ? ' / OWASP: ' + f.owasp : ''));
    out.push('- Result: ' + f.detail);
    if (f.evidence.length) {
      out.push('- Evidence:');
      for (const e of f.evidence.slice(0, 15)) out.push('  ' + evidenceLine(e));
      if (f.evidence.length > 15) out.push('  - ...and ' + (f.evidence.length - 15) + ' more');
    }
    if (f.fix) out.push('- Fix: ' + f.fix);
    out.push('');
  }

  const skipped = r.findings.filter((f) => f.status === 'skip');
  out.push('## Could not run (' + skipped.length + ')', '');
  if (!skipped.length) out.push('Every applicable check ran.', '');
  for (const f of skipped) out.push('- ' + f.title + ': ' + f.detail);
  if (skipped.length) out.push('');

  const missing = r.notCovered || [];
  out.push('## Not covered yet (' + missing.length + ')', '');
  for (const m of missing) out.push('- [' + m.level + '] ' + m.title + ': ' + m.why);
  out.push('');

  const passed = r.findings.filter((f) => f.status === 'pass');
  out.push('## Passed (' + passed.length + ')', '');
  for (const f of passed) out.push('- ' + f.title);
  out.push('');

  const notApplicable = r.findings.filter((f) => f.status === 'na');
  out.push('## Not applicable (' + notApplicable.length + ')', '');
  for (const f of notApplicable) out.push('- ' + f.title + ': ' + f.detail);
  out.push('');

  return out.join('\n');
}

module.exports = { toMarkdown };