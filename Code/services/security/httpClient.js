'use strict';

const http = require('http');
const https = require('https');
const { isLocalHost } = require('./targetGuard');

const MAX_BODY = 262144;

function createClient(options) {
  const opts = Object.assign({ maxRequests: 70, timeoutMs: 6000 }, options);
  let used = 0;

  function failure(message, url) {
    return { status: 0, headers: {}, body: '', ms: 0, error: message, url: url || '' };
  }

  function request(urlString, init) {
    const o = init || {};
    return new Promise((resolve) => {
      if (used >= opts.maxRequests) {
        resolve(failure('request cap reached', urlString));
        return;
      }
      let url;
      try {
        url = new URL(urlString);
      } catch (e) {
        resolve(failure('invalid URL', urlString));
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        resolve(failure('unsupported protocol', urlString));
        return;
      }
      used += 1;

      const lib = url.protocol === 'https:' ? https : http;
      const hostname = url.hostname.replace(/^\[|\]$/g, '');
      const started = Date.now();
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const req = lib.request(
        {
          protocol: url.protocol,
          hostname,
          port: url.port || undefined,
          path: url.pathname + url.search,
          method: o.method || 'GET',
          headers: Object.assign({ 'User-Agent': 'HelperTool-SecurityCheck/1.0', Accept: '*/*' }, o.headers || {}),
          timeout: opts.timeoutMs,
          rejectUnauthorized: !isLocalHost(hostname),
        },
        (res) => {
          const chunks = [];
          let size = 0;
          const finish = () =>
            done({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf8'),
              ms: Date.now() - started,
              error: null,
              url: urlString,
            });
          res.on('data', (chunk) => {
            size += chunk.length;
            if (size <= MAX_BODY) chunks.push(chunk);
            else res.destroy();
          });
          res.on('end', finish);
          res.on('close', finish);
          res.on('error', finish);
        }
      );

      req.on('timeout', () => {
        req.destroy();
        done(failure('timed out', urlString));
      });
      req.on('error', (e) => {
        const code = e && (e.code || e.message) ? e.code || e.message : 'request failed';
        if (code === 'ECONNREFUSED' && url.hostname === 'localhost' && !o.retried) {
          used -= 1;
          const alt = urlString.replace('//localhost', '//127.0.0.1');
          request(alt, Object.assign({}, o, { retried: true })).then(done);
          return;
        }
        done(failure(code, urlString));
      });
      req.end();
    });
  }

  return { request, count: () => used };
}

module.exports = { createClient };