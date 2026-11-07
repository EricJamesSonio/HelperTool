import { S, h, call, toast, copyText, fmtMs, fmtDate } from './state.js';

const SEV = ['critical', 'high', 'medium', 'low', 'info'];
const TABS = [
  ['summary', 'Summary'],
  ['improve', 'What to improve'],
  ['findings', 'Findings'],
  ['tests', 'Tests'],
  ['output', 'Output'],
];
const STATUS_TEXT = { pass: 'Passed', fail: 'Failed', review: 'Review', skip: 'Not run' };
const STEP_ICON = { pass: '\u2713', fail: '\u2715', review: '!', skip: '\u2013', wait: '\u25CB' };

let ticker = null;
let renderTimer = null;

/* ---------- state ---------- */

function stopTicker() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function startTicker() {
  stopTicker();
  ticker = setInterval(() => {
    const el = document.getElementById('rcSecElapsed');
    const prog = S.security.progress;
    if (!el || !prog) return;
    el.textContent = fmtMs(Date.now() - prog.startedAt);
  }, 500);
}

function newProgress() {
  return { startedAt: Date.now(), stage: 'Starting', plan: [], total: 0, done: 0, current: null, results: {}, log: [] };
}

export function securityReset() {
  const sec = S.security;
  sec.screen = 'setup';
  sec.running = false;
  sec.runError = '';
  sec.progress = null;
  sec.report = null;
  sec.history = [];
  sec.tab = 'summary';
  sec.sevFilter = 'all';
  sec.target = { loading: false, loaded: false, data: null, error: '' };
  sec.draft = { url: null, safe: null };
  sec.confirm = null;
  sec.saving = false;
  stopTicker();
}

function scheduleRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => {
    renderTimer = null;
    if (S.page === 'security') S.hooks.renderPage();
  }, 150);
}

function pushLog(prog, text, kind, at) {
  prog.log.push({ text: String(text), kind: kind || 'log', at: at || Date.now() });
  if (prog.log.length > 400) prog.log.splice(0, prog.log.length - 400);
}

export function applySecurityEvent(repoPath, data) {
  const sec = S.security;
  if (repoPath !== S.repoPath || !sec.running || !sec.progress || !data) return;
  const prog = sec.progress;
  if (data.type === 'plan') {
    prog.plan = Array.isArray(data.tests) ? data.tests : [];
    prog.total = data.total || prog.plan.length;
  } else if (data.type === 'stage') {
    prog.stage = data.text;
    pushLog(prog, data.text, 'stage', data.at);
  } else if (data.type === 'log') {
    pushLog(prog, data.text, 'log', data.at);
  } else if (data.type === 'test-start') {
    prog.current = { id: data.id, title: data.title, kind: data.kind };
  } else if (data.type === 'test-done') {
    prog.results[data.id] = {
      status: data.status,
      findingCount: data.findingCount || 0,
      reason: data.reason || '',
      durationMs: data.durationMs || 0,
    };
    prog.done += 1;
    if (prog.current && prog.current.id === data.id) prog.current = null;
  }
  scheduleRender();
}

/* ---------- run ---------- */

export async function runSecurity() {
  const sec = S.security;
  if (sec.running) return;
  const repoPath = S.repoPath;
  sec.running = true;
  sec.runError = '';
  sec.screen = 'running';
  sec.progress = newProgress();
  startTicker();
  S.hooks.renderPage();
  try {
    const res = await call('securityRun', { repoPath });
    if (repoPath === S.repoPath) {
      sec.report = res.report;
      sec.history = res.history || [];
      sec.profile = res.profile || sec.profile;
      sec.tab = 'summary';
      sec.sevFilter = 'all';
      sec.screen = 'report';
      toast(res.report.savedFile ? 'Security test finished. Saved to ' + res.report.savedFile : 'Security test finished');
    }
  } catch (e) {
    if (repoPath === S.repoPath) {
      sec.runError = e.message;
      sec.screen = 'setup';
    }
    toast(e.message, 'error');
  } finally {
    if (repoPath === S.repoPath) {
      sec.running = false;
      sec.progress = null;
      stopTicker();
    }
    S.hooks.renderPage();
  }
}

/* ---------- running screen ---------- */

function stepNote(result, active) {
  if (result) {
    if (result.reason) return result.reason;
    if (result.status === 'pass') return 'No issues found';
    if (result.status === 'review') return result.findingCount + ' to review';
    return result.findingCount + ' finding' + (result.findingCount === 1 ? '' : 's');
  }
  return active ? 'Checking now...' : '';
}

function stepRow(test, prog) {
  const result = prog.results[test.id];
  const active = !!(prog.current && prog.current.id === test.id);
  let state = 'wait';
  if (result) state = result.status;
  else if (active) state = 'run';
  const icon = state === 'run' ? h('span', { class: 'rc-spin' }) : STEP_ICON[state] || STEP_ICON.wait;
  const note = stepNote(result, active);
  return h(
    'div',
    { class: 'rc-sec-step st-' + state },
    h('span', { class: 'rc-sec-step-icon' }, icon),
    h('div', { class: 'rc-sec-step-main' }, h('b', { text: test.title }), note ? h('div', { class: 'rc-where', text: note }) : null),
    h('span', { class: 'rc-where', text: test.kind === 'dynamic' ? 'live' : 'code' }),
    h('span', { class: 'rc-where rc-sec-step-time', text: result ? fmtMs(result.durationMs) : '' })
  );
}

function logText(prog) {
  return prog.log
    .slice(-150)
    .map((entry) => {
      const offset = ((entry.at - prog.startedAt) / 1000).toFixed(1);
      return '[+' + offset + 's] ' + (entry.kind === 'stage' ? '>> ' : '') + entry.text;
    })
    .join('\n');
}

export function runningView() {
  const sec = S.security;
  const prog = sec.progress || newProgress();
  const total = prog.total || prog.plan.length;
  const pct = total ? Math.min(100, Math.round((prog.done / total) * 100)) : 0;
  const current = prog.current;

  const head = h(
    'div',
    { class: 'rc-card rc-sec-live' },
    h(
      'div',
      { class: 'rc-sec-live-top' },
      h('span', { class: 'rc-spin' }),
      h(
        'div',
        { class: 'rc-sec-live-title' },
        h('h3', { text: 'Security test running' }),
        h('div', { class: 'rc-where', text: current ? 'Now checking: ' + current.title : prog.stage })
      ),
      h('div', { class: 'rc-sec-live-time' }, h('span', { id: 'rcSecElapsed', text: fmtMs(Date.now() - prog.startedAt) }))
    ),
    h('div', { class: 'rc-bar' + (total ? '' : ' indeterminate') }, h('div', { style: 'width:' + (total ? pct : 35) + '%' })),
    h('div', { class: 'rc-where', text: total ? prog.done + ' of ' + total + ' checks finished' : 'Preparing the check list...' })
  );

  const steps = h(
    'div',
    { class: 'rc-card rc-sec-steps' },
    h('h4', { text: 'Checks' }),
    prog.plan.length ? prog.plan.map((test) => stepRow(test, prog)) : h('div', { class: 'rc-where', text: 'Waiting for the check list...' })
  );

  const pre = h('pre', { class: 'rc-sec-pre rc-sec-livelog', text: logText(prog) || 'Waiting for output...' });
  requestAnimationFrame(() => {
    pre.scrollTop = pre.scrollHeight;
  });
  const log = h('div', { class: 'rc-card rc-sec-logcard' }, h('h4', { text: 'Live output' }), pre);

  return [head, h('div', { class: 'rc-sec-live-grid' }, steps, log)];
}

/* ---------- report pieces ---------- */

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

function savedLine(report) {
  if (report.savedFile) return h('div', { class: 'rc-sec-saved rc-mono', text: 'Saved automatically to ' + report.savedFile });
  if (report.saveError) return h('div', { class: 'rc-warn', text: 'The report could not be saved to the repository: ' + report.saveError });
  return null;
}

function copyReport(report) {
  if (!report.markdown) {
    toast('This older report has no saved text. Run the test again.', 'error');
    return;
  }
  copyText(report.markdown, 'Report copied');
}

function actionRow(report) {
  return h(
    'div',
    { class: 'rc-row' },
    h('button', { class: 'rc-btn secondary small', text: 'Copy report', onclick: () => copyReport(report) }),
    h('button', { class: 'rc-btn secondary small', text: 'Copy fix prompt', onclick: () => copyText(fixPrompt(report), 'Fix prompt copied') })
  );
}

function targetLine(report) {
  const t = report.target;
  const source = t.source === 'auto' ? ' (auto-detected)' : t.source === 'saved' ? ' (saved)' : '';
  if (!t.url) return 'Target: none - ' + t.note;
  return 'Target: ' + t.url + source + (t.reachable ? ' (reachable)' : ' - ' + t.note);
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
    h('div', { class: 'rc-where', text: targetLine(report) }),
    savedLine(report),
    actionRow(report)
  );
}

function improvementCard(item) {
  return h(
    'div',
    { class: 'rc-card rc-sec-item' },
    h(
      'div',
      { class: 'rc-card-head' },
      h('h3', { text: item.title }),
      h(
        'div',
        { class: 'rc-row' },
        sevChip(item.severity),
        h('span', { class: 'rc-where', text: item.count + ' finding' + (item.count === 1 ? '' : 's') }),
        item.status === 'review' ? h('span', { class: 'rc-where', text: 'needs review' }) : null
      )
    ),
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

/* ---------- report screen ---------- */

export function reportView() {
  const sec = S.security;
  const report = sec.report;
  const tab = TABS.some((t) => t[0] === sec.tab) ? sec.tab : 'summary';
  const topBar = h(
    'div',
    { class: 'rc-row rc-sec-topbar' },
    h('button', {
      class: 'rc-btn secondary small',
      text: '\u2190 Back to setup',
      onclick: () => {
        sec.screen = 'setup';
        S.hooks.renderPage();
      },
    }),
    h('button', { class: 'rc-btn small', text: 'Run again', onclick: runSecurity })
  );
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
  return h('div', null, topBar, scoreCard(report), tabBar, h('div', { class: 'rc-sec-body' }, body));
}

/* ---------- last run card (setup screen) ---------- */

export function lastRunCard() {
  const sec = S.security;
  const report = sec.report;
  if (!report) return null;
  const grade = report.score.grade === '-' ? 'none' : report.score.grade;
  return h(
    'div',
    { class: 'rc-card rc-sec-last' },
    h('div', { class: 'rc-sec-grade small grade-' + grade, text: report.score.grade }),
    h(
      'div',
      { class: 'rc-sec-last-main' },
      h('b', { text: 'Last run: ' + (report.score.overall === null ? 'no score' : report.score.overall + '%') }),
      h('div', { class: 'rc-where', text: report.headline }),
      h('div', { class: 'rc-where', text: 'Ran ' + fmtDate(report.finishedAt) + (report.savedFile ? ' / saved to ' + report.savedFile : '') })
    ),
    h('button', {
      class: 'rc-btn secondary',
      text: 'View report',
      onclick: () => {
        sec.screen = 'report';
        S.hooks.renderPage();
      },
    })
  );
}

/* ---------- fix prompt ---------- */

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

/* ---------- hooks used by index.js ---------- */

securityReset();
S.hooks.securityReset = securityReset;
S.hooks.securityEvent = applySecurityEvent;