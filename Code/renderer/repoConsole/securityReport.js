import { S, h, call, toast, copyText, fmtMs, fmtDate } from './state.js';

const SEV = ['critical', 'high', 'medium', 'low', 'info'];
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const TABS = [
  ['summary', 'Summary'],
  ['improve', 'What to improve'],
  ['findings', 'Findings'],
  ['tests', 'Tests'],
  ['output', 'Output'],
];
const STATUS_TEXT = { pass: 'Passed', fail: 'Failed', review: 'Review', skip: 'Not run' };

export async function runSecurity() {
  const sec = S.security;
  if (sec.running) return;
  const repoPath = S.repoPath;
  sec.running = true;
  sec.runError = '';
  S.hooks.renderPage();
  try {
    const res = await call('securityRun', { repoPath });
    if (repoPath === S.repoPath) {
      sec.report = res.report;
      sec.history = res.history || [];
      sec.profile = res.profile || sec.profile;
      sec.tab = 'summary';
      sec.sevFilter = 'all';
      toast('Security test finished');
    }
  } catch (e) {
    if (repoPath === S.repoPath) sec.runError = e.message;
    toast(e.message, 'error');
  } finally {
    sec.running = false;
    S.hooks.renderPage();
  }
}

export function securityRunBar() {
  const sec = S.security;
  const settings = sec.settings || {};
  const hint = settings.targetUrl
    ? 'Runs code checks plus live read-only checks against ' + settings.targetUrl + '. Start your app first.'
    : 'Runs code checks only. Save a target URL below to add live checks (start your app first).';
  return h(
    'div',
    { class: 'rc-card rc-sec-run' },
    h(
      'div',
      { class: 'rc-row' },
      h('button', {
        class: 'rc-btn',
        text: sec.running ? 'Running...' : sec.report ? 'Run again' : 'Run security test',
        disabled: !!sec.running,
        onclick: runSecurity,
      }),
      h('span', { class: 'rc-where', text: hint })
    ),
    sec.running
      ? h(
          'div',
          null,
          h('div', { class: 'rc-bar indeterminate' }, h('div', { style: 'width:35%' })),
          h('div', { class: 'rc-where', text: 'Scanning code, auditing dependencies and probing the target. This can take up to a minute.' })
        )
      : null,
    sec.runError ? h('div', { class: 'rc-warn red', text: sec.runError }) : null
  );
}

function sevChip(sev) {
  return h('span', { class: 'rc-sec-sev sev-' + sev, text: sev });
}

function statusPill(status) {
  return h('span', { class: 'rc-sec-st st-' + status, text: STATUS_TEXT[status] || status });
}

function location(f) {
  if (!f.file) return '';
  return f.file + (f.line ? ':' + f.line : '');
}

function trendText(report) {
  const history = S.security.history || [];
  const previous = history.find((entry) => entry.id !== report.id && entry.startedAt < report.startedAt);
  if (!previous || previous.score === null || previous.score === undefined || report.score.overall === null) return '';
  const diff = report.score.overall - previous.score;
  if (diff === 0) return 'same score as the previous run';
  return (diff > 0 ? '+' : '') + diff + ' points since the previous run';
}

function levelBox(name, level) {
  let text;
  let cls;
  if (!level || level.status === 'not-available') {
    text = 'Not available yet';
    cls = 'st-skip';
  } else if (level.pct === null) {
    text = 'Nothing to score';
    cls = 'st-skip';
  } else {
    text = level.pct + '% ' + (level.achieved ? 'achieved' : 'not achieved');
    cls = level.achieved ? 'st-pass' : 'st-fail';
  }
  return h('div', { class: 'rc-sec-level' }, h('b', { text: name }), h('span', { class: 'rc-sec-st ' + cls, text }));
}

function tile(value, label, cls) {
  return h('div', { class: 'rc-sec-tile' + (cls ? ' ' + cls : '') }, h('b', { text: String(value) }), h('span', { text: label }));
}

function actionRow(report) {
  return h(
    'div',
    { class: 'rc-row' },
    h('button', { class: 'rc-btn secondary small', text: 'Copy report', onclick: () => copyText(reportMarkdown(report), 'Report copied') }),
    h('button', { class: 'rc-btn secondary small', text: 'Copy fix prompt', onclick: () => copyText(fixPrompt(report), 'Fix prompt copied') }),
    h('button', { class: 'rc-btn secondary small', text: 'Download .md', onclick: () => downloadReport(report) })
  );
}

function scoreCard(report) {
  const score = report.score;
  const trend = trendText(report);
  const by = report.totals.bySeverity;
  const grade = score.grade === '-' ? 'none' : score.grade;
  return h(
    'div',
    { class: 'rc-card rc-sec-report' },
    h(
      'div',
      { class: 'rc-sec-top' },
      h('div', { class: 'rc-sec-grade grade-' + grade, text: score.grade }),
      h(
        'div',
        { class: 'rc-sec-headline' },
        h('div', { class: 'rc-sec-pct', text: score.overall === null ? 'No score' : score.overall + '%' }),
        h('p', { text: report.headline }),
        h('div', { class: 'rc-where', text: 'Ran ' + fmtDate(report.finishedAt) + ' / ' + fmtMs(report.durationMs) + (trend ? ' / ' + trend : '') })
      )
    ),
    h(
      'div',
      { class: 'rc-sec-levels' },
      levelBox('Basic', score.levels.basic),
      levelBox('Medium', score.levels.medium),
      levelBox('Advanced', score.levels.advanced)
    ),
    h(
      'div',
      { class: 'rc-sec-tiles' },
      tile(by.critical || 0, 'Critical', by.critical ? 'bad' : ''),
      tile(by.high || 0, 'High', by.high ? 'bad' : ''),
      tile(by.medium || 0, 'Medium'),
      tile(by.low || 0, 'Low'),
      tile(report.totals.passed, 'Checks passed', 'good'),
      tile(report.totals.skipped, 'Not run')
    ),
    h(
      'div',
      { class: 'rc-where' },
      'Stack: ' + report.stack.frontend + ' frontend, ' + report.stack.backend + ' backend, ' + report.stack.database + ' database, ' + report.stack.auth + ' auth. Folders: ' + report.stack.folders.join(', ') + '.'
    ),
    h('div', { class: 'rc-where', text: 'Target: ' + (report.target.url || 'none') + (report.target.reachable ? ' (reachable)' : ' - ' + report.target.note) }),
    actionRow(report)
  );
}

function improvementCard(item) {
  return h(
    'div',
    { class: 'rc-card rc-sec-item' },
    h('div', { class: 'rc-card-head' }, h('h3', { text: item.title }), h('div', { class: 'rc-row' }, sevChip(item.severity), h('span', { class: 'rc-where', text: item.count + ' finding' + (item.count === 1 ? '' : 's') }), item.status === 'review' ? h('span', { class: 'rc-where', text: 'needs review' }) : null)),
    h('p', { text: item.why }),
    item.fixes.length ? h('div', null, h('h4', { text: 'How to fix' }), h('ul', null, item.fixes.map((fix) => h('li', { text: fix })))) : null,
    item.files.length ? h('div', { class: 'rc-where rc-mono', text: 'Files: ' + item.files.join(', ') }) : null
  );
}

function summaryTab(report) {
  const top = report.improvements.slice(0, 5);
  return h(
    'div',
    null,
    report.assumptions.length ? h('div', { class: 'rc-warn' }, h('ul', null, report.assumptions.map((a) => h('li', { text: a })))) : null,
    h('h4', { text: 'Fix these first' }),
    top.length
      ? top.map(improvementCard)
      : h('div', { class: 'rc-empty', text: 'Nothing to fix in the checks that ran. See "Not covered" below for what this run could not look at.' }),
    h('h4', { text: 'Not covered by this run' }),
    h('ul', null, report.notCovered.map((item) => h('li', null, h('b', { text: item.title }), ' - ' + item.reason)))
  );
}

function improveTab(report) {
  if (!report.improvements.length) return h('div', { class: 'rc-empty', text: 'Nothing to improve in the checks that ran.' });
  return h('div', null, report.improvements.map(improvementCard));
}

function findingItem(report, f) {
  const test = report.tests.find((t) => t.id === f.testId);
  const where = location(f);
  const refs = test ? [test.owasp, test.cwe].filter(Boolean).join(' / ') : '';
  return h(
    'details',
    { class: 'rc-more rc-sec-item' },
    h(
      'summary',
      null,
      sevChip(f.severity),
      h('b', { text: f.title }),
      where ? h('span', { class: 'rc-where rc-mono', text: where }) : null,
      f.confidence === 'review' ? h('span', { class: 'rc-where', text: 'needs review' }) : null
    ),
    h(
      'div',
      { class: 'rc-more-body' },
      f.detail ? h('p', { text: f.detail }) : null,
      f.evidence ? h('pre', { class: 'rc-sec-pre', text: f.evidence }) : null,
      f.fix ? h('div', null, h('h4', { text: 'How to fix' }), h('p', { text: f.fix })) : null,
      refs ? h('div', { class: 'rc-where', text: refs }) : null
    )
  );
}

function findingsTab(report) {
  const sec = S.security;
  const present = SEV.filter((sev) => report.findings.some((f) => f.severity === sev));
  const filter = present.includes(sec.sevFilter) ? sec.sevFilter : 'all';
  const shown = filter === 'all' ? report.findings : report.findings.filter((f) => f.severity === filter);
  const seg = h(
    'div',
    { class: 'rc-seg' },
    ...['all'].concat(present).map((id) =>
      h('button', {
        class: filter === id ? 'on' : '',
        text: id === 'all' ? 'All (' + report.findings.length + ')' : id,
        onclick: () => {
          sec.sevFilter = id;
          S.hooks.renderPage();
        },
      })
    )
  );
  if (!report.findings.length) return h('div', { class: 'rc-empty', text: 'No findings.' });
  return h('div', null, seg, shown.map((f) => findingItem(report, f)));
}

function testsTab(report) {
  const groups = new Map();
  for (const test of report.tests) {
    if (!groups.has(test.category)) groups.set(test.category, []);
    groups.get(test.category).push(test);
  }
  const nodes = [];
  for (const [category, list] of groups) {
    nodes.push(h('div', { class: 'rc-group-title', text: category }));
    for (const test of list) {
      const note = test.reason || (test.findingCount ? test.findingCount + ' finding' + (test.findingCount === 1 ? '' : 's') : '');
      nodes.push(
        h(
          'div',
          { class: 'rc-sec-test' },
          statusPill(test.status),
          h('div', { class: 'rc-sec-test-main' }, h('b', { text: test.title }), note ? h('div', { class: 'rc-where', text: note }) : null),
          h('span', { class: 'rc-where', text: test.level + ' / ' + test.severity + ' / ' + (test.kind === 'dynamic' ? 'live' : 'code') })
        )
      );
    }
  }
  return h('div', null, nodes);
}

function outputTab(report) {
  return h('pre', { class: 'rc-sec-pre rc-sec-log', text: report.output.join('\n') });
}

export function reportSection() {
  const sec = S.security;
  const report = sec.report;
  if (!report) {
    return h('div', { class: 'rc-empty', text: sec.running ? 'Running the security test...' : 'No security report yet. Press "Run security test" to create one.' });
  }
  const tab = TABS.some((t) => t[0] === sec.tab) ? sec.tab : 'summary';
  const tabBar = h(
    'div',
    { class: 'rc-sec-tabs' },
    ...TABS.map(([id, label]) =>
      h('button', {
        class: tab === id ? 'on' : '',
        text: id === 'findings' ? label + ' (' + report.findings.length + ')' : label,
        onclick: () => {
          sec.tab = id;
          S.hooks.renderPage();
        },
      })
    )
  );
  let body;
  if (tab === 'improve') body = improveTab(report);
  else if (tab === 'findings') body = findingsTab(report);
  else if (tab === 'tests') body = testsTab(report);
  else if (tab === 'output') body = outputTab(report);
  else body = summaryTab(report);
  return h('div', null, scoreCard(report), tabBar, h('div', { class: 'rc-sec-body' }, body));
}

/* ---------- exports ---------- */

function reportMarkdown(r) {
  const lines = [];
  lines.push('# Security test report - ' + r.repoName, '');
  lines.push('Date: ' + fmtDate(r.finishedAt));
  lines.push('Score: ' + (r.score.overall === null ? 'n/a' : r.score.overall + '% (grade ' + r.score.grade + ')'));
  lines.push('Target: ' + (r.target.url || 'none') + (r.target.reachable ? ' (reachable)' : ' - live checks did not run: ' + r.target.note));
  lines.push('Stack: ' + r.stack.frontend + ' frontend, ' + r.stack.backend + ' backend, ' + r.stack.database + ' database, ' + r.stack.auth + ' auth', '');
  lines.push(r.headline, '');
  lines.push('## Fix these first', '');
  if (!r.improvements.length) lines.push('Nothing to fix in the checks that ran.', '');
  r.improvements.forEach((item, index) => {
    lines.push((index + 1) + '. [' + item.severity + '] ' + item.title + ' (' + item.count + ')');
    lines.push('   Why: ' + item.why);
    for (const fix of item.fixes) lines.push('   - ' + fix);
    if (item.files.length) lines.push('   Files: ' + item.files.join(', '));
  });
  lines.push('', '## Findings', '');
  for (const f of r.findings) {
    lines.push('- [' + f.severity + '] ' + f.title + (location(f) ? ' (' + location(f) + ')' : ''));
    if (f.evidence) lines.push('  Evidence: ' + f.evidence);
    if (f.fix) lines.push('  Fix: ' + f.fix);
  }
  lines.push('', '## Not covered by this run', '');
  for (const item of r.notCovered) lines.push('- ' + item.title + ': ' + item.reason);
  return lines.join('\n');
}

function fixPrompt(r) {
  const lines = [];
  lines.push('A security test of "' + r.repoName + '" found issues to fix.');
  lines.push('Stack: ' + r.stack.frontend + ' frontend, ' + r.stack.backend + ' backend, ' + r.stack.database + ' database, ' + r.stack.auth + ' auth. Project folders: ' + r.stack.folders.join(', ') + '.');
  lines.push('Fix them in the order below. Request the files you need before changing anything.', '');
  r.improvements.forEach((item, index) => {
    lines.push((index + 1) + '. [' + item.severity + '] ' + item.title + ' (' + item.count + ' finding' + (item.count === 1 ? '' : 's') + ')');
    for (const fix of item.fixes) lines.push('   Fix: ' + fix);
    if (item.files.length) lines.push('   Files: ' + item.files.join(', '));
  });
  const places = r.findings.filter((f) => f.file && f.line).slice(0, 25);
  if (places.length) {
    lines.push('', 'Exact locations:');
    for (const f of places) lines.push('- ' + location(f) + ' - ' + f.title);
  }
  return lines.join('\n');
}

function downloadReport(report) {
  const url = URL.createObjectURL(new Blob([reportMarkdown(report)], { type: 'text/markdown' }));
  const link = h('a', { href: url, download: 'security-report-' + report.id + '.md' });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}