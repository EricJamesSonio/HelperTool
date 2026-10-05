const https = require('https');
const micromatch = require('micromatch');

const BINARY_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|icns|wasm|zip|gz|tar|7z|rar|pdf|mp3|mp4|mov|avi|woff2?|ttf|otf|eot|exe|dll|so|dylib|node|db|sqlite)$/i;
const MAX_FILE_BYTES = 300 * 1024;
const CONCURRENCY = 8;
const PATH_SEP = '\\'; // matches local generator output (path.relative on win32)
const MAX_RETRY_AFTER = 30000;
const REQUEST_TIMEOUT = 30000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function fatal(message) {
  return Object.assign(new Error(message), { fatal: true });
}

function rawGetOnce(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'HelperTool/1.0',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers || {},
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/** Parse Retry-After (delta-seconds), clamped to MAX_RETRY_AFTER. null when absent/invalid. */
function retryAfterMs(headers) {
  const raw = headers && (headers['retry-after'] || headers['Retry-After']);
  if (raw === undefined || raw === null || raw === '') return null;
  const secs = parseInt(raw, 10);
  if (Number.isNaN(secs) || secs < 0) return null;
  return Math.min(secs * 1000, MAX_RETRY_AFTER);
}

/**
 * Status policy:
 *   200            -> body
 *   404            -> fatal (missing, or private repo without token)
 *   401 / 422      -> fatal (bad token / unprocessable)
 *   403 + Retry-After  -> RATE LIMIT: wait it out, retry
 *   403 no header       -> fatal (token lacks access); retrying only wastes requests
 *   429 / 5xx      -> retry, honoring Retry-After when present
 */
async function fetchRaw(url, token, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    let waitMs = null;
    try {
      const { status, headers, body } = await rawGetOnce(url, token);
      if (status === 200) return body;
      if (status === 404) throw fatal('404 (not found, or private repo without token)');
      if (status === 401) throw fatal('401 (bad or expired token)');
      if (status === 422) throw fatal('422 (GitHub could not process the request)');

      const wait = retryAfterMs(headers);
      if (status === 403) {
        if (wait === null) throw fatal('403 (token lacks access to this repo)');
        waitMs = wait;
      } else if (wait !== null) {
        waitMs = wait;
      }

      lastErr = new Error(`HTTP ${status}`);
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
    }
    await sleep(waitMs !== null ? waitMs : 500 * (i + 1));
  }
  throw lastErr;
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/**
 * files: [{ path, size }]
 * returns { content, fileCount, skipped: [{path, reason}], failed: [{path, reason}] }
 */
async function fetchBundle({ owner, repo, branch, files, token, ignoreRules, onProgress }) {
  const matchers = (ignoreRules || []).map(p => micromatch.matcher(p, { dot: true }));
  const skipped = [];
  const queue = [];

  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (matchers.some(fn => fn(f.path))) skipped.push({ path: f.path, reason: 'docignore' });
    else if (BINARY_EXT.test(f.path)) skipped.push({ path: f.path, reason: 'binary extension' });
    else if ((f.size || 0) > MAX_FILE_BYTES) skipped.push({ path: f.path, reason: 'too large' });
    else queue.push(f);
  }

  const enc = (s) => s.split('/').map(encodeURIComponent).join('/');
  const results = new Array(queue.length);
  const failed = [];
  let next = 0, done = 0;

  async function worker() {
    while (next < queue.length) {
      const i = next++;
      const p = queue[i].path;
      try {
        const buf = await fetchRaw(
          `https://raw.githubusercontent.com/${owner}/${repo}/${enc(branch)}/${enc(p)}`, token);
        if (looksBinary(buf)) { skipped.push({ path: p, reason: 'binary content' }); results[i] = null; }
        else results[i] = buf.toString('utf-8');
      } catch (e) {
        failed.push({ path: p, reason: e.message });
        results[i] = null;
      }
      onProgress?.(++done, queue.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  let content = '';
  let fileCount = 0;
  queue.forEach((f, i) => {
    if (results[i] === null) return;
    content += `\n// ===== File: ${f.path.split('/').join(PATH_SEP)} =====\n${results[i]}\n`;
    fileCount++;
  });

  return { content, fileCount, skipped, failed };
}

module.exports = { fetchBundle };
