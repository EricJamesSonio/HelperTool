const { ipcMain } = require('electron');
const https = require('https');
const simpleGit = require('simple-git');

const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 12;
const cache = new Map();

function norm(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function stripCredentials(url) {
  return String(url || '').replace(/\/\/[^@/\s]+@/, '//');
}

function parseRemote(url) {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(String(url || '').trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

function request(pathname, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'ES Code/1.0',
      'Accept': 'application/vnd.github+json',
    };
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = https.get({ hostname: 'api.github.com', path: pathname, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let body = null;
        try { body = data ? JSON.parse(data) : null; } catch (_) { body = null; }
        resolve({ status: res.statusCode, body, headers: res.headers || {} });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('Request timed out')); });
  });
}

async function ghGet(pathname, token) {
  let res = await request(pathname, token);
  if (res.status === 401 && token) res = await request(pathname, '');
  return res;
}

async function activeToken() {
  try {
    const accounts = require('./gitAccounts_ipc.js');
    if (typeof accounts.getActiveToken === 'function') return await accounts.getActiveToken();
  } catch (_) {
    return '';
  }
  return '';
}

function failText(res) {
  const h = res.headers || {};
  if (res.status === 404) {
    return 'GitHub could not find this repository. If it is private, select an account with access in the GitHub accounts menu.';
  }
  if (res.status === 429 || (res.status === 403 && String(h['x-ratelimit-remaining']) === '0')) {
    return 'GitHub rate limit reached. Select a GitHub account in the GitHub accounts menu for a higher limit, or try again later.';
  }
  if (res.status === 403) return 'GitHub refused the request (HTTP 403).';
  return 'GitHub answered with status ' + res.status + '.';
}

async function localInfo(repoPath) {
  const git = simpleGit(repoPath);
  const out = { path: repoPath, isRepo: false, remote: '', branch: '', commitCount: null };
  try {
    out.isRepo = await git.checkIsRepo();
  } catch (_) {
    out.isRepo = false;
  }
  if (!out.isRepo) return out;
  try {
    out.remote = stripCredentials(String(await git.raw(['remote', 'get-url', 'origin'])).trim());
  } catch (_) {
    out.remote = '';
  }
  try {
    out.branch = String(await git.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  } catch (_) {
    out.branch = '';
  }
  try {
    const n = parseInt(String(await git.raw(['rev-list', '--count', 'HEAD'])).trim(), 10);
    out.commitCount = isNaN(n) ? null : n;
  } catch (_) {
    out.commitCount = null;
  }
  return out;
}

function mapRepo(info) {
  const owner = info.owner || {};
  let license = '';
  if (info.license) {
    license = info.license.spdx_id && info.license.spdx_id !== 'NOASSERTION' ? info.license.spdx_id : (info.license.name || '');
  }
  return {
    fullName: info.full_name,
    name: info.name,
    description: info.description || '',
    htmlUrl: info.html_url,
    cloneUrl: info.clone_url || (info.html_url ? info.html_url + '.git' : ''),
    homepage: info.homepage && /^https?:\/\//i.test(info.homepage) ? info.homepage : '',
    private: !!info.private,
    visibility: info.visibility ? info.visibility.charAt(0).toUpperCase() + info.visibility.slice(1) : (info.private ? 'Private' : 'Public'),
    fork: !!info.fork,
    archived: !!info.archived,
    defaultBranch: info.default_branch || '',
    language: info.language || '',
    license,
    topics: Array.isArray(info.topics) ? info.topics : [],
    stars: Number(info.stargazers_count) || 0,
    forks: Number(info.forks_count) || 0,
    watchers: Number(info.subscribers_count != null ? info.subscribers_count : info.watchers_count) || 0,
    openIssues: Number(info.open_issues_count) || 0,
    size: Number(info.size) || 0,
    createdAt: info.created_at || '',
    pushedAt: info.pushed_at || '',
    updatedAt: info.updated_at || '',
    parent: info.parent ? { fullName: info.parent.full_name, htmlUrl: info.parent.html_url } : null,
    owner: {
      login: owner.login || '',
      avatarUrl: owner.avatar_url || '',
      htmlUrl: owner.html_url || '',
      type: owner.type || 'User',
    },
  };
}

function mapContributors(res) {
  if (!res || res.status !== 200 || !Array.isArray(res.body)) return { list: [], more: false };
  const link = res.headers && res.headers.link ? String(res.headers.link) : '';
  return {
    more: link.indexOf('rel="next"') !== -1,
    list: res.body.map((c) => ({
      login: c.login || '',
      avatarUrl: c.avatar_url || '',
      htmlUrl: c.html_url || '',
      contributions: Number(c.contributions) || 0,
      type: c.type || 'User',
    })),
  };
}

function mapLanguages(res) {
  if (!res || res.status !== 200 || !res.body || typeof res.body !== 'object') return [];
  const entries = Object.keys(res.body).map((name) => ({ name, bytes: Number(res.body[name]) || 0 }));
  const total = entries.reduce((sum, e) => sum + e.bytes, 0);
  if (!total) return [];
  return entries
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10)
    .map((e) => ({ name: e.name, bytes: e.bytes, pct: Math.round((e.bytes / total) * 1000) / 10 }));
}

function mapCommits(res) {
  if (!res || res.status !== 200 || !Array.isArray(res.body)) return [];
  return res.body.map((c) => {
    const commit = c.commit || {};
    const author = commit.author || {};
    const msg = String(commit.message || '').split('\n')[0].slice(0, 200);
    return {
      sha: c.sha || '',
      message: msg,
      author: author.name || '',
      login: c.author && c.author.login ? c.author.login : '',
      avatarUrl: c.author && c.author.avatar_url ? c.author.avatar_url : '',
      date: author.date || '',
      htmlUrl: c.html_url || '',
    };
  });
}

async function load(repoPath, force) {
  const key = norm(repoPath);
  if (!force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  }
  const local = await localInfo(repoPath);
  const data = {
    local,
    repo: null,
    contributors: [],
    contributorsMore: false,
    languages: [],
    commits: [],
    notes: [],
    reason: '',
    error: '',
    ref: null,
    fetchedAt: Date.now(),
  };
  if (!local.isRepo) {
    data.reason = 'not-repo';
    return data;
  }
  if (!local.remote) {
    data.reason = 'no-remote';
    return data;
  }
  const parsed = parseRemote(local.remote);
  if (!parsed) {
    data.reason = 'not-github';
    return data;
  }
  const token = await activeToken();
  const base = '/repos/' + encodeURIComponent(parsed.owner) + '/' + encodeURIComponent(parsed.repo);
  const results = await Promise.all([
    ghGet(base, token),
    ghGet(base + '/contributors?per_page=30', token),
    ghGet(base + '/languages', token),
    ghGet(base + '/commits?per_page=10', token),
  ]);
  const info = results[0];
  if (info.status !== 200 || !info.body) {
    data.reason = 'error';
    data.error = failText(info);
    data.ref = { owner: parsed.owner, repo: parsed.repo, htmlUrl: 'https://github.com/' + parsed.owner + '/' + parsed.repo };
    return data;
  }
  data.repo = mapRepo(info.body);
  const contribs = mapContributors(results[1]);
  data.contributors = contribs.list;
  data.contributorsMore = contribs.more;
  data.languages = mapLanguages(results[2]);
  data.commits = mapCommits(results[3]);
  if (results[1].status === 403 || results[1].status === 429) {
    data.notes.push('Some details could not be loaded because of the GitHub rate limit. Select a GitHub account for a higher limit.');
  }
  if (!token) {
    data.notes.push('No GitHub account is selected, so only public data is shown and the request limit is low.');
  }
  cache.delete(key);
  cache.set(key, { at: Date.now(), data });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return data;
}

function register() {
  ipcMain.handle('repoDetails:get', async (_event, payload) => {
    try {
      const repoPath = payload && typeof payload.repoPath === 'string' ? payload.repoPath : '';
      if (!repoPath) return { success: false, error: 'No repository selected.' };
      const data = await load(repoPath, !!(payload && payload.force));
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : 'Could not load repository details.' };
    }
  });
}

module.exports = { register };