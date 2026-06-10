const http = require('http');
const PIPES = [
  '//./pipe/docker_engine',
  '//./pipe/docker_desktopLinuxEngine',
];

let _workingPipe = null;

function _pickPipe() {
  if (_workingPipe) return _workingPipe;
  return PIPES[0];
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const pipe = _pickPipe();
    const opts = {
      socketPath: pipe,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body != null) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, (res) => {
      let chunk = '';
      res.on('data', (d) => { chunk += d; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Docker API error ${res.statusCode}: ${chunk}`));
          return;
        }
        try { resolve(JSON.parse(chunk)); }
        catch { resolve(chunk); }
      });
    });
    req.on('error', (err) => {
      if (pipe === _workingPipe) _workingPipe = null;
      if (!_workingPipe) {
        const idx = PIPES.indexOf(pipe);
        if (idx >= 0 && idx < PIPES.length - 1) {
          _workingPipe = PIPES[idx + 1];
          request(method, path, body).then(resolve, reject);
          return;
        }
      }
      reject(err);
    });
    if (body != null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function ping() {
  return request('GET', '/_ping');
}

async function listContainers(all = true) {
  return request('GET', `/containers/json?all=${all ? 1 : 0}`);
}

async function startContainer(id) {
  return request('POST', `/containers/${id}/start`);
}

async function stopContainer(id) {
  return request('POST', `/containers/${id}/stop`);
}

async function restartContainer(id) {
  return request('POST', `/containers/${id}/restart`);
}

async function removeContainer(id, force = false) {
  return request('DELETE', `/containers/${id}?force=${force ? 1 : 0}&v=1`);
}

async function listImages() {
  return request('GET', '/images/json');
}

async function removeImage(id, force = false) {
  return request('DELETE', `/images/${id}?force=${force ? 1 : 0}`);
}

async function getStats(id) {
  return request('GET', `/containers/${id}/stats?stream=false`);
}

async function getLogs(id, tail = 200) {
  return request('GET', `/containers/${id}/logs?stdout=true&stderr=true&tail=${tail}&timestamps=true`);
}

async function getVersion() {
  return request('GET', '/version');
}

module.exports = {
  request, ping, listContainers, startContainer, stopContainer,
  restartContainer, removeContainer, listImages, removeImage,
  getStats, getLogs, getVersion,
};
