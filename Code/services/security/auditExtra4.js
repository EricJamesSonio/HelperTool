'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const AUDIT_TIMEOUT_MS = 45000;
const HISTORY_TIMEOUT_MS = 45000;
const HISTORY_MAX_BYTES = 64 * 1024 * 1024;
const HISTORY_MAX_COMMITS = 3000;
const MAX_AUDIT_OUTPUT = 8 * 1024 * 1024;
const MAX_NAMES = 6;
const MAX_REMOVED_FILES = 20;
const MAX_LIVE_CHECKS = 200;

const SEVERITIES = ['critical', 'high', 'moderate', 'low'];
const FINDING_SEVERITY = { critical: 'critical', high: 'high', moderate: 'medium', low: 'low' };
const MANAGER_LABEL = { pnpm: 'pnpm', yarn: 'yarn', 'yarn-berry': 'yarn' };

const HISTORY_SCAN_RE = /\.(?:js|jsx|mjs|cjs|ts|tsx|vue|svelte|php|py|rb|go|java|cs|html|ya?ml|json|toml|sql|sh|properties|conf|cfg|ini|xml)$/i;
const VENDOR_RE = /(?:^|\/)(?:node_modules|dist|build|vendor|\.next|coverage)\//;

const HISTORY_PICKAXE = [
  'AKIA[0-9A-Z]{16}',
  '-----BEGIN [A-Z ]*PRIVATE KEY-----',
  'gh[pousr]_[A-Za-z0-9]{36}',
  'AIza[0-9A-Za-z_-]{35}',
  'xox[baprs]-[A-Za-z0-9-]{10}',
  '[sr]k_live_[0-9A-Za-z]{16}',
  'npm_[A-Za-z0-9]{36}',
].join('|');

const HISTORY_RULES = [
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/, severity: 'critical' },
  { name: 'Private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, severity: 'critical', noMask: true },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, severity: 'critical' },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/, severity: 'high' },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, severity: 'high' },
  { name: 'Stripe live key', re: /\b[sr]k_live_[0-9A-Za-z]{16,}\b/, severity: 'critical' },
  { name: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/, severity: 'high' },
];

/* ---------- pnpm and yarn audit ---------- */

function emptyCounts() {
  return { critical: 0, high: 0, moderate: 0, low: 0 };
}

function emptyNames() {
  return { critical: [], high: [], moderate: [], low: [] };
}

function addName(names, severity, name) {
  const sev = String(severity || '').toLowerCase();
  if (!names[sev] || !name) return;
  const text = String(name);
  if (names[sev].length >= MAX_NAMES || names[sev].includes(text)) return;
  names[sev].push(text);
}

function readErrorText(error) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') return error.summary || error.message || error.code || 'The audit reported an error.';
  return 'The audit reported an error.';
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function parseAuditOutput(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const whole = tryParse(trimmed);
  const counts = emptyCounts();
  const names = emptyNames();

  if (whole && typeof whole === 'object' && !Array.isArray(whole)) {
    if (whole.error) return { error: readErrorText(whole.error) };
    const meta = whole.metadata && whole.metadata.vulnerabilities;
    if (meta && typeof meta === 'object') {
      for (const sev of SEVERITIES) counts[sev] = Number(meta[sev]) || 0;
      const advisories = whole.advisories && typeof whole.advisories === 'object' ? Object.values(whole.advisories) : [];
      for (const adv of advisories) addName(names, adv && adv.severity, adv && adv.module_name);
      const vulns = whole.vulnerabilities && typeof whole.vulnerabilities === 'object' ? Object.values(whole.vulnerabilities) : [];
      for (const v of vulns) addName(names, v && v.severity, v && v.name);
      return { counts, names };
    }
  }

  let records;
  if (Array.isArray(whole)) records = whole;
  else if (whole && typeof whole === 'object') records = [whole];
  else records = trimmed.split(/\r?\n/).map((line) => tryParse(line.trim())).filter(Boolean);

  let summary = null;
  let berry = false;
  let sawAdvisory = false;
  let errorText = '';

  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue;
    if (rec.type === 'auditSummary' && rec.data && rec.data.vulnerabilities) {
      summary = rec.data.vulnerabilities;
      continue;
    }
    if (rec.type === 'auditAdvisory' && rec.data && rec.data.advisory) {
      sawAdvisory = true;
      addName(names, rec.data.advisory.severity, rec.data.advisory.module_name);
      continue;
    }
    if (rec.children && rec.children.Severity) {
      berry = true;
      const sev = String(rec.children.Severity).toLowerCase();
      if (Object.prototype.hasOwnProperty.call(counts, sev)) counts[sev] += 1;
      addName(names, sev, rec.value);
      continue;
    }
    if (rec.type === 'error' && !errorText) errorText = readErrorText(rec.data);
  }

  if (summary) {
    for (const sev of SEVERITIES) counts[sev] = Number(summary[sev]) || 0;
    return { counts, names };
  }
  if (berry || sawAdvisory) return { counts, names };
  if (errorText) return { error: errorText };
  return null;
}

function pickManager(root) {
  const has = (name) => fs.existsSync(path.join(root, name));
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (!has('yarn.lock')) return null;
  if (has('.yarnrc.yml')) return 'yarn-berry';
  const pkg = tryParse(readText(path.join(root, 'package.json')));
  const match = /^yarn@(\d+)/.exec(String((pkg && pkg.packageManager) || ''));
  if (match && Number(match[1]) >= 2) return 'yarn-berry';
  return 'yarn';
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return '';
  }
}

function hasBunLock(root) {
  return fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'));
}

function hasNpmLock(root) {
  return fs.existsSync(path.join(root, 'package-lock.json')) || fs.existsSync(path.join(root, 'npm-shrinkwrap.json'));
}

function auditCommand(manager) {
  if (manager === 'pnpm') return { command: 'pnpm', args: ['audit', '--json'] };
  if (manager === 'yarn-berry') return { command: 'yarn', args: ['npm', 'audit', '--json'] };
  return { command: 'yarn', args: ['audit', '--json'] };
}

function fixAdvice(manager, rel) {
  const where = rel ? ' in ' + rel : '';
  if (manager === 'pnpm') {
    return 'Run "pnpm audit --fix"' + where + ' to add overrides, or "pnpm update <package>" for direct dependencies. Run the tests afterwards.';
  }
  if (manager === 'yarn-berry') {
    return 'Run "yarn npm audit"' + where + ' to see the dependency paths, then "yarn up -R <package>" to update them. Run the tests afterwards.';
  }
  return 'Run "yarn audit"' + where + ' to see the dependency paths, then "yarn upgrade <package>" to update them. Run the tests afterwards.';
}

function runTool(h, command, args, cwd) {
  return new Promise((resolve) => {
    let out = '';
    let errOut = '';
    let settled = false;
    let timer = null;
    let child = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    try {
      child = spawn(command, args, {
        cwd,
        shell: process.platform === 'win32',
        windowsHide: true,
        env: h.npmEnv(),
      });
    } catch (e) {
      const failure = h.classifyNpmFailure(e.message);
      finish({ error: command + ' could not be started: ' + failure.message, reasonCode: failure.code });
      return;
    }

    timer = setTimeout(() => {
      h.killTree(child);
      finish({ error: command + ' audit timed out after ' + Math.round(AUDIT_TIMEOUT_MS / 1000) + 's.', reasonCode: 'timeout' });
    }, AUDIT_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (out.length < MAX_AUDIT_OUTPUT) out += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      if (errOut.length < 64 * 1024) errOut += chunk;
    });
    child.on('error', (err) => {
      if (err && err.code === 'ENOENT') {
        finish({ error: command + ' is not installed or is not on PATH.', reasonCode: 'tooling' });
        return;
      }
      const failure = h.classifyNpmFailure(err && err.message);
      finish({ error: command + ' could not be started: ' + failure.message, reasonCode: failure.code });
    });
    child.on('close', (code) => {
      finish({ stdout: out, stderr: errOut.trim(), code });
    });
  });
}

async function runManagerAudit(h, manager, cwd) {
  const spec = auditCommand(manager);
  const res = await runTool(h, spec.command, spec.args, cwd);
  if (res.error) return res;

  const text = String(res.stdout || '');
  if (!text.trim()) {
    if (res.code === 0) return { counts: emptyCounts(), names: emptyNames() };
    const failure = h.classifyNpmFailure(res.stderr || (res.code ? spec.command + ' audit exited with code ' + res.code : ''));
    return { error: failure.message, reasonCode: failure.code };
  }

  const parsed = parseAuditOutput(text);
  if (!parsed) {
    const failure = h.classifyNpmFailure(res.stderr || spec.command + ' audit did not return a readable report.');
    return { error: failure.message, reasonCode: failure.code };
  }
  if (parsed.error) {
    const failure = h.classifyNpmFailure(parsed.error);
    return { error: failure.message, reasonCode: failure.code };
  }
  return parsed;
}

/* ---------- git history scan ---------- */

function parseDiffPath(line) {
  let p = line.slice(4).replace(/\t.*$/, '').trim();
  if (p.length > 1 && p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
  if (p.startsWith('b/')) p = p.slice(2);
  return p;
}

function createHistoryParser(h, onHit) {
  let leftover = '';
  let commit = '';
  let file = '';
  let skipFile = true;
  let prev = '';

  const skipPath = (rel) =>
    !rel ||
    rel === '/dev/null' ||
    !HISTORY_SCAN_RE.test(rel) ||
    h.skipFileRe.test(rel) ||
    h.testPathRe.test(rel) ||
    h.sensitiveRe.test(rel) ||
    VENDOR_RE.test(rel);

  const handle = (line) => {
    const before = prev;
    prev = line;
    if (line.startsWith('@@C ')) {
      commit = line.slice(4).trim();
      file = '';
      skipFile = true;
      return;
    }
    if (line.startsWith('+++ ') && before.startsWith('--- ')) {
      file = parseDiffPath(line);
      skipFile = skipPath(file);
      return;
    }
    if (skipFile || line.charCodeAt(0) !== 43 || line.length > 2000) return;
    const text = line.slice(1);
    for (const rule of HISTORY_RULES) {
      const m = rule.re.exec(text);
      if (!m) continue;
      const value = m[0];
      onHit({ key: rule.name + '|' + (rule.noMask ? file : value), rule, value, file, commit });
    }
  };

  return {
    push(chunk) {
      const parts = (leftover + chunk).split('\n');
      leftover = parts.pop();
      for (const part of parts) handle(part.replace(/\r$/, ''));
    },
    end() {
      if (leftover) handle(leftover.replace(/\r$/, ''));
      leftover = '';
    },
  };
}

function scanHistory(h, repoPath) {
  return new Promise((resolve) => {
    const hits = new Map();
    const parser = createHistoryParser(h, (hit) => hits.set(hit.key, hit));
    const args = [
      '-c',
      'core.quotepath=false',
      'log',
      '--all',
      '--no-merges',
      '--no-color',
      '--no-ext-diff',
      '--no-renames',
      '--diff-filter=AM',
      '-U0',
      '-p',
      '--max-count=' + HISTORY_MAX_COMMITS,
      '--format=@@C %h',
      '-G' + HISTORY_PICKAXE,
    ];
    let stopped = '';
    let bytes = 0;
    let settled = false;
    let timer = null;
    let child = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    try {
      child = spawn('git', args, { cwd: repoPath, windowsHide: true });
    } catch (e) {
      finish({ error: e.message });
      return;
    }

    timer = setTimeout(() => {
      stopped = 'time';
      h.killTree(child);
    }, HISTORY_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > HISTORY_MAX_BYTES) {
        if (!stopped) {
          stopped = 'size';
          h.killTree(child);
        }
        return;
      }
      parser.push(chunk);
    });
    child.stderr.on('data', () => {});
    child.on('error', (err) => finish({ error: err && err.message ? err.message : 'git could not be started' }));
    child.on('close', () => {
      parser.end();
      finish({ hits: Array.from(hits.values()), stopped });
    });
  });
}

function stillInSource(ctx, values) {
  const pending = new Set(values.slice(0, MAX_LIVE_CHECKS));
  const live = new Set();
  if (!pending.size) return live;
  for (const file of ctx.corpus) {
    for (const line of file.lines) {
      if (line.length > 2000) continue;
      for (const value of pending) {
        if (line.includes(value)) {
          live.add(value);
          pending.delete(value);
        }
      }
      if (!pending.size) return live;
    }
  }
  return live;
}

/* ---------- tests ---------- */

function createTests(h) {
  const { finding, outcome, skip, na } = h;

  return [
    {
      id: 'pkg-audit',
      title: 'Dependencies (pnpm and yarn) have no known vulnerabilities',
      category: 'Universal',
      level: 'basic',
      severity: 'high',
      kind: 'static',
      owasp: 'A06:2021 Vulnerable and Outdated Components',
      cwe: 'CWE-1104',
      why: 'Known vulnerabilities in packages are attacked automatically and in bulk, whichever package manager installed them.',
      fixTitle: 'Update vulnerable pnpm and yarn dependencies',
      run: async (ctx) => {
        const targets = [];
        const bunRoots = [];
        for (const r of ctx.deps.byRoot) {
          const manager = pickManager(r.root);
          if (manager) {
            targets.push({ root: r.root, rel: r.rel, file: r.file, manager });
            continue;
          }
          if (hasBunLock(r.root) && !hasNpmLock(r.root)) bunRoots.push(r);
        }

        if (!targets.length) {
          if (bunRoots.length) return na('Not applicable: only Bun lockfiles were found, and Bun audits are not supported by this scanner yet.');
          return na('Not applicable: no pnpm-lock.yaml or yarn.lock was found (npm projects are covered by the npm audit check).');
        }

        const findings = [];
        const problems = [];
        const codes = [];
        let audited = 0;

        for (const target of targets.slice(0, 3)) {
          const label = target.rel || 'root';
          const manager = MANAGER_LABEL[target.manager];
          ctx.say(manager + ' audit in ' + label + ' ...');
          const res = await runManagerAudit(h, target.manager, target.root);
          if (res.error) {
            problems.push(label + ': ' + res.error);
            if (res.reasonCode) codes.push(res.reasonCode);
            continue;
          }
          audited += 1;
          for (const sev of SEVERITIES) {
            const count = res.counts[sev];
            if (!count) continue;
            const names = res.names[sev].join(', ');
            findings.push(
              finding({
                severity: FINDING_SEVERITY[sev],
                title: count + ' ' + sev + ' vulnerabilit' + (count === 1 ? 'y' : 'ies') + ' in ' + label + ' dependencies (' + manager + ')',
                detail: manager + ' audit reports known security advisories for packages this project uses.',
                file: target.file,
                evidence: names ? 'Packages: ' + names : '',
                fix: fixAdvice(target.manager, target.rel),
              })
            );
          }
        }

        if (!audited) {
          const reason = problems.join(' ') || 'The audit could not run.';
          return Object.assign(skip(reason), { reasonCode: codes[0] || 'tooling' });
        }

        const result = outcome(findings);
        const notes = [];
        if (problems.length) notes.push('Some folders could not be audited: ' + problems.join(' '));
        if (bunRoots.length) notes.push('Bun folders were not audited because Bun is not supported yet.');
        if (notes.length) result.reason = notes.join(' ');
        return result;
      },
    },
    {
      id: 'git-history-secrets',
      title: 'No secrets were ever committed to git history',
      category: 'Universal',
      level: 'medium',
      severity: 'high',
      kind: 'static',
      owasp: 'A02:2021 Cryptographic Failures',
      cwe: 'CWE-540',
      why: 'A secret deleted from the latest commit is still readable in history and in every old clone until it is rotated.',
      fixTitle: 'Rotate secrets found in git history',
      run: async (ctx) => {
        const repoPath = ctx.repoPath;
        if (h.git(repoPath, ['rev-parse', '--git-dir']) === null) {
          return skip('This folder is not a git repository (or git is missing), so history cannot be scanned.');
        }

        const notes = [];
        const shallow = h.git(repoPath, ['rev-parse', '--is-shallow-repository']);
        if (shallow && shallow.trim() === 'true') notes.push('This is a shallow clone, so older history was not available.');

        const findings = [];

        const added = h.git(repoPath, ['-c', 'core.quotepath=false', 'log', '--all', '--no-renames', '--diff-filter=A', '--name-only', '--pretty=format:']);
        if (added === null) {
          notes.push('The list of files ever committed could not be read, so removed secret files were not checked.');
        } else {
          const tracked = h.trackedFiles(repoPath) || new Set();
          const seen = new Set();
          let listed = 0;
          for (const raw of added.split(/\r?\n/)) {
            const rel = raw.trim();
            if (!rel || seen.has(rel)) continue;
            seen.add(rel);
            if (!h.sensitiveRe.test(rel) || h.testPathRe.test(rel) || VENDOR_RE.test(rel)) continue;
            if (tracked.has(rel)) continue;
            if (listed >= MAX_REMOVED_FILES) break;
            listed += 1;
            findings.push(
              finding({
                severity: 'high',
                confidence: 'review',
                title: rel + ' was committed in the past and is no longer tracked',
                detail: 'This file name normally holds secrets. Its old content stays readable in git history and in every older clone. The content was not read, so check whether it held real secrets.',
                file: rel,
                fix: 'Rotate every secret that file held. If the repository is shared, purge the file from history with git filter-repo or BFG.',
              })
            );
          }
        }

        const scan = await scanHistory(h, repoPath);
        if (scan.error) {
          if (!findings.length) return skip('The history scan could not run: ' + scan.error);
          notes.push('The history content scan could not run: ' + scan.error);
        } else {
          const live = stillInSource(
            ctx,
            scan.hits.filter((hit) => !hit.rule.noMask).map((hit) => hit.value)
          );
          for (const hit of scan.hits) {
            if (!hit.rule.noMask && live.has(hit.value)) continue;
            const masked = hit.rule.noMask ? hit.value : hit.value.slice(0, 4) + '***';
            findings.push(
              finding({
                severity: hit.rule.severity,
                confidence: 'confirmed',
                title: hit.rule.name + ' found in git history',
                detail: 'A value in the format of a real ' + hit.rule.name + ' was added in commit ' + hit.commit + ' and is no longer in the current files. It is still readable in history and in every old clone.',
                file: hit.file,
                evidence: hit.rule.name + ': ' + masked + ' (commit ' + hit.commit + ')',
                fix: 'Rotate or revoke it now, because removing it from the latest commit does not remove it from history. If the repository is shared, purge it with git filter-repo or BFG.',
              })
            );
          }
          if (scan.stopped === 'time') {
            notes.push('The history scan stopped at the time limit (' + Math.round(HISTORY_TIMEOUT_MS / 1000) + ' s), so older commits were not checked.');
          }
          if (scan.stopped === 'size') {
            notes.push('The history scan stopped at its output limit, so older commits were not checked.');
          }
        }

        const result = outcome(findings);
        if (notes.length) result.reason = notes.join(' ');
        return result;
      },
    },
  ];
}

module.exports = {
  createTests,
  _internals: {
    parseAuditOutput,
    pickManager,
    createHistoryParser,
    HISTORY_RULES,
  },
};