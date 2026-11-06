'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { pass, fail, skip, na } = require('../result');

const SENSITIVE = [
  /(?:^|\/)\.env(?:\.[\w-]+)?$/i,
  /(?:^|\/)(?:credentials|client_secret[\w-]*|service[-_]?account[\w-]*|secrets?)\.json$/i,
  /(?:^|\/)[\w.-]*(?:store|token|tokens)\.json$/i,
  /\.(?:pem|p12|pfx|key|keystore|jks)$/i,
  /(?:^|\/)id_(?:rsa|ed25519|ecdsa)$/,
];
const SAFE_NAME = /\.(?:example|sample|template|dist)$/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor']);

function gitList(repoPath) {
  return new Promise((resolve) => {
    execFile('git', ['ls-files'], { cwd: repoPath, maxBuffer: 50 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) resolve(null);
      else resolve(String(stdout).split(/\r?\n/).filter(Boolean));
    });
  });
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
}

function findLockDirs(repoPath) {
  const roots = [repoPath];
  try {
    for (const e of fs.readdirSync(repoPath, { withFileTypes: true })) {
      if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) roots.push(path.join(repoPath, e.name));
    }
  } catch (e) {
    return [];
  }
  return roots.filter((d) => fs.existsSync(path.join(d, 'package-lock.json')) && fs.existsSync(path.join(d, 'package.json'))).slice(0, 2);
}

function runAudit(dir) {
  return new Promise((resolve) => {
    execFile(
      'npm',
      ['audit', '--json'],
      { cwd: dir, timeout: 40000, maxBuffer: 20 * 1024 * 1024, shell: true, windowsHide: true },
      (err, stdout) => {
        try {
          const json = JSON.parse(stdout);
          const vul = json && json.metadata ? json.metadata.vulnerabilities : null;
          if (!vul) resolve({ ok: false, error: (json && json.error && json.error.summary) || 'npm audit returned no result' });
          else resolve({ ok: true, vul });
        } catch (e) {
          resolve({ ok: false, error: err ? err.message : 'npm audit returned no output' });
        }
      }
    );
  });
}

const envTracked = {
  id: 'secret-files-tracked',
  title: 'No .env, key or credential files are tracked by git',
  category: 'Secrets',
  level: 'basic',
  severity: 'critical',
  kind: 'static',
  owasp: 'A02:2021 Cryptographic Failures',
  applies: null,
  async run(ctx) {
    if (ctx.tracked === undefined) ctx.tracked = await gitList(ctx.repoPath);
    if (!ctx.tracked) return skip('This is not a git repository, or git is not available.');
    const hits = ctx.tracked.filter((f) => !SAFE_NAME.test(f) && SENSITIVE.some((re) => re.test(f)));
    if (!hits.length) return pass('No sensitive file names are tracked.');
    return fail(
      hits.length + ' sensitive file(s) are committed to git.',
      'Run git rm --cached on each file, add it to .gitignore, rotate every secret inside, and purge it from history (git filter-repo).',
      hits.slice(0, 25).map((f) => ({ file: f, line: 0, text: 'tracked by git' }))
    );
  },
};

const gitignoreEnv = {
  id: 'gitignore-env',
  title: '.gitignore covers .env files',
  category: 'Secrets',
  level: 'basic',
  severity: 'high',
  kind: 'static',
  owasp: 'A02:2021 Cryptographic Failures',
  applies: null,
  run(ctx) {
    const real = (ctx.envFiles || []).filter((f) => !SAFE_NAME.test(f));
    if (!real.length) return na('No .env files were found.');
    const gi = readText(path.join(ctx.repoPath, '.gitignore'));
    if (gi === null) return fail('There is no .gitignore while .env files exist.', 'Create a .gitignore with a line .env*', real.map((f) => ({ file: f, line: 0, text: 'not covered by .gitignore' })));
    if (/^\/?\.env/m.test(gi)) return pass('.gitignore covers .env files.');
    return fail('.gitignore does not mention .env.', 'Add .env* (and !.env.example) to .gitignore.', real.map((f) => ({ file: f, line: 0, text: 'not covered by .gitignore' })));
  },
};

const npmAudit = {
  id: 'npm-audit',
  title: 'Dependencies have no known vulnerabilities (npm audit)',
  category: 'Dependencies',
  level: 'basic',
  severity: 'high',
  kind: 'static',
  owasp: 'A06:2021 Vulnerable and Outdated Components',
  applies: null,
  async run(ctx) {
    const dirs = findLockDirs(ctx.repoPath);
    if (!dirs.length) return skip('No package-lock.json was found, and npm audit needs one.');
    const total = { critical: 0, high: 0, moderate: 0, low: 0 };
    const evidence = [];
    let ran = 0;
    let lastError = '';
    for (const dir of dirs) {
      const res = await runAudit(dir);
      if (!res.ok) {
        lastError = res.error;
        continue;
      }
      ran += 1;
      for (const k of Object.keys(total)) total[k] += Number(res.vul[k] || 0);
      const rel = path.relative(ctx.repoPath, dir).split(path.sep).join('/') || '.';
      evidence.push({
        file: rel + '/package.json',
        line: 0,
        text: 'critical ' + (res.vul.critical || 0) + ', high ' + (res.vul.high || 0) + ', moderate ' + (res.vul.moderate || 0) + ', low ' + (res.vul.low || 0),
      });
    }
    if (!ran) return skip('npm audit could not run (' + lastError + '). It needs internet access to the npm registry.');
    const sum = total.critical + total.high + total.moderate + total.low;
    if (!sum) return pass('npm audit found no known vulnerabilities.');
    const severity = total.critical ? 'critical' : total.high ? 'high' : total.moderate ? 'medium' : 'low';
    return fail(sum + ' known vulnerabilities in dependencies.', 'Run npm audit fix, review breaking upgrades for the rest, and update the listed packages.', evidence, severity);
  },
};

const checks = [envTracked, gitignoreEnv, npmAudit];

module.exports = { checks };