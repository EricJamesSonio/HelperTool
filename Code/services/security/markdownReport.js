'use strict';

function location(f) {
  if (!f.file) return '';
  return f.file + (f.line ? ':' + f.line : '');
}

function levelText(level) {
  if (!level || level.status === 'not-available') return 'not available yet';
  if (level.pct === null) return 'nothing to score';
  return level.pct + '% ' + (level.achieved ? 'achieved' : 'not achieved');
}

function targetText(target) {
  const t = target || {};
  if (!t.url) return 'none (' + (t.note || 'no target') + ')';
  const source = t.source === 'auto' ? ' (auto-detected)' : t.source === 'saved' ? ' (saved)' : '';
  return t.url + source + (t.reachable ? ' - reachable' : ' - live checks did not run: ' + (t.note || ''));
}

function build(r) {
  const out = [];
  const s = r.score;
  out.push('# Security test report - ' + r.repoName, '');
  out.push('- Date: ' + new Date(r.finishedAt || r.startedAt).toISOString());
  out.push('- Score: ' + (s.overall === null ? 'n/a' : s.overall + '% (grade ' + s.grade + ')'));
  out.push('- Target: ' + targetText(r.target));
  out.push('- Stack: ' + r.stack.frontend + ' frontend, ' + r.stack.backend + ' backend, ' + r.stack.database + ' database, ' + r.stack.auth + ' auth');
  out.push('- Folders: ' + r.stack.folders.join(', '));
  out.push('- Duration: ' + (r.durationMs / 1000).toFixed(1) + ' s');
  if (r.savedFile) out.push('- Saved as: ' + r.savedFile);
  out.push('', r.headline, '');

  out.push('## Levels', '');
  out.push('- Basic: ' + levelText(s.levels.basic));
  out.push('- Medium: ' + levelText(s.levels.medium));
  out.push('- Advanced: ' + levelText(s.levels.advanced));
  out.push('');

  if (r.assumptions && r.assumptions.length) {
    out.push('## Assumptions', '');
    for (const item of r.assumptions) out.push('- ' + item);
    out.push('');
  }

  out.push('## Fix these first', '');
  if (!r.improvements.length) out.push('Nothing to fix in the checks that ran.', '');
  r.improvements.forEach((item, index) => {
    out.push((index + 1) + '. [' + item.severity + '] ' + item.title + ' (' + item.count + ')');
    out.push('   Why: ' + item.why);
    for (const fix of item.fixes) out.push('   - ' + fix);
    if (item.files.length) out.push('   Files: ' + item.files.join(', '));
  });
  out.push('');

  out.push('## Findings (' + r.findings.length + ')', '');
  if (!r.findings.length) out.push('No findings.', '');
  for (const f of r.findings) {
    out.push('- [' + f.severity + '] ' + f.title + (location(f) ? ' (' + location(f) + ')' : '') + (f.confidence === 'review' ? ' - needs review' : ''));
    if (f.detail) out.push('  Detail: ' + f.detail);
    if (f.evidence) out.push('  Evidence: ' + f.evidence);
    if (f.fix) out.push('  Fix: ' + f.fix);
  }
  out.push('');

  out.push('## Checks (' + r.tests.length + ')', '');
  for (const t of r.tests) {
    const status = t.status === 'skip' ? 'NOT RUN' : t.status.toUpperCase();
    const note = t.reason ? ': ' + t.reason : t.findingCount ? ': ' + t.findingCount + ' finding' + (t.findingCount === 1 ? '' : 's') : '';
    out.push('- [' + status + '] ' + t.title + ' (' + t.level + ' / ' + t.severity + ' / ' + (t.kind === 'dynamic' ? 'live' : 'code') + ')' + note);
  }
  out.push('');

  out.push('## Not covered by this run', '');
  for (const item of r.notCovered) out.push('- ' + item.title + ': ' + item.reason);
  out.push('');

  return out.join('\n');
}

module.exports = { build };