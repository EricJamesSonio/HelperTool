const http = require('http');
const URL = require('url').URL;

class UrlTracker {
  constructor() {
    this._urls = new Map();
  }

  register({ port, url, framework, sessionId, source }) {
    if (!port) return;
    const key = `port:${port}`;
    if (this._urls.has(key)) return;
    this._urls.set(key, {
      port,
      url: url || `http://localhost:${port}`,
      framework: framework || 'Unknown',
      sessionId: sessionId || null,
      source: source || 'unknown',
      detectedAt: new Date().toISOString(),
      alive: null,
      lastCheckedAt: null,
    });
  }

  getAll() {
    return Array.from(this._urls.values());
  }

  getByPort(port) {
    return this._urls.get(`port:${port}`) || null;
  }

  remove(port) {
    this._urls.delete(`port:${port}`);
  }

  healthCheck(port, timeout = 5000) {
    return new Promise((resolve) => {
      const entry = this._urls.get(`port:${port}`);
      if (!entry) {
        resolve({ alive: false, error: 'Port not found in tracker' });
        return;
      }

      const req = http.get(entry.url, { timeout }, (res) => {
        entry.alive = true;
        entry.lastCheckedAt = new Date().toISOString();
        res.resume();
        resolve({
          alive: true,
          port,
          url: entry.url,
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: {
            'content-type': res.headers['content-type'],
            'content-length': res.headers['content-length'],
          },
        });
      });

      req.on('error', (err) => {
        entry.alive = false;
        entry.lastCheckedAt = new Date().toISOString();
        resolve({ alive: false, port, url: entry.url, error: err.message || err.code || 'connection failed' });
      });

      req.on('timeout', () => {
        req.destroy();
        entry.alive = false;
        entry.lastCheckedAt = new Date().toISOString();
        resolve({ alive: false, port, url: entry.url, error: 'timeout' });
      });
    });
  }

  fetchTest(port, timeout = 5000) {
    return new Promise((resolve) => {
      const entry = this._urls.get(`port:${port}`);
      if (!entry) {
        resolve({ success: false, error: 'Port not found in tracker' });
        return;
      }

      const req = http.get(entry.url, { timeout }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk.toString(); });
        res.on('end', () => {
          entry.alive = true;
          entry.lastCheckedAt = new Date().toISOString();
          resolve({
            success: true,
            port,
            url: entry.url,
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            contentType: res.headers['content-type'],
            bodyPreview: body.slice(0, 5000),
            bodyLength: body.length,
            truncated: body.length > 5000,
          });
        });
      });

      req.on('error', (err) => {
        entry.alive = false;
        entry.lastCheckedAt = new Date().toISOString();
        resolve({ success: false, port, url: entry.url, error: err.message || err.code || 'connection failed' });
      });

      req.on('timeout', () => {
        req.destroy();
        entry.alive = false;
        entry.lastCheckedAt = new Date().toISOString();
        resolve({ success: false, port, url: entry.url, error: 'timeout' });
      });
    });
  }

  waitForReady(port, { timeout = 30000, interval = 1000 } = {}) {
    return new Promise((resolve) => {
      const start = Date.now();
      const poll = () => {
        this.healthCheck(port, 3000).then((result) => {
          if (result.alive) {
            resolve(result);
            return;
          }
          if (Date.now() - start >= timeout) {
            resolve({ alive: false, error: 'timeout waiting for server', port });
            return;
          }
          setTimeout(poll, interval);
        });
      };
      poll();
    });
  }
}

module.exports = { UrlTracker };
