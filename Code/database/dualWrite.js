let _proxy = null;
let _enabled = false;
let _verifyReads = false;
let _readFromProxy = false;
let _discrepancyCount = 0;

function init(indexerProxy) {
  _proxy = indexerProxy;
  _enabled = !!process.env.DUAL_WRITE;
  _verifyReads = !!process.env.VERIFY_READS;
  _readFromProxy = !!process.env.READ_FROM_PROXY;
  if (_enabled) console.log('[DualWrite] dual-write mode enabled');
  if (_verifyReads) console.log('[DualWrite] read verification enabled');
  if (_readFromProxy) console.log('[DualWrite] reading from indexer-service (primary)');
  return api;
}

function setEnabled(v) { _enabled = v; }
function setVerifyReads(v) { _verifyReads = v; }
function setReadFromProxy(v) { _readFromProxy = v; }

function _proxySend(type, payload) {
  if (!_enabled || !_proxy) return Promise.resolve();
  return _proxy.send(type, payload).catch(err => {
    console.warn('[DualWrite] proxy error:', err?.message || err);
  });
}

async function _proxyRead(description, localFn, proxyType, proxyPayload, transform) {
  if (!_proxy) return localFn();
  if (_readFromProxy) {
    try {
      const proxyResult = await _proxy.send(proxyType, proxyPayload);
      if (proxyResult != null) {
        if (_verifyReads) {
          try {
            const localResult = localFn();
            const proxyStr = JSON.stringify(proxyResult);
            const localStr = JSON.stringify(localResult);
            if (localStr !== proxyStr) {
              _discrepancyCount++;
              console.warn('[DualWrite] DISCREPANCY:', description);
            }
          } catch (_) {}
        }
        return transform ? transform(proxyResult) : proxyResult;
      }
    } catch (err) {
      console.warn('[DualWrite] proxy read failed, falling back to local:', description, err?.message);
    }
    return localFn();
  }
  const localResult = localFn();
  if (_verifyReads) {
    try {
      const proxyResult = await _proxy.send(proxyType, proxyPayload);
      const proxyStr = JSON.stringify(proxyResult);
      const localStr = JSON.stringify(localResult);
      if (localStr !== proxyStr) {
        _discrepancyCount++;
        console.warn('[DualWrite] DISCREPANCY:', description);
      }
    } catch (_) {}
  }
  return localResult;
}

function _proxyReadSync(description, localFn, proxyType, proxyPayload, transform) {
  const localResult = localFn();
  if (_verifyReads && _proxy) {
    _proxy.send(proxyType, proxyPayload).then(proxyResult => {
      if (proxyResult == null) return;
      const proxyStr = JSON.stringify(transform ? transform(proxyResult) : proxyResult);
      const localStr = JSON.stringify(localResult);
      if (localStr !== proxyStr) {
        _discrepancyCount++;
        console.warn('[DualWrite] DISCREPANCY:', description);
      }
    }).catch(() => {});
  }
  if (_readFromProxy) {
    console.warn('[DualWrite] sync read cannot use proxy, falling back to local:', description);
  }
  return localResult;
}

const api = {
  init, setEnabled, setVerifyReads, setReadFromProxy,

  get discrepancyCount() { return _discrepancyCount; },

  wrapAll(dbs) {
    return {
      repoDb: this.wrapRepoDb(dbs.repoDb),
      fileDb: this.wrapFileDb(dbs.fileDb),
      symbolDb: this.wrapSymbolDb(dbs.symbolDb),
      importDb: dbs.importDb,
    };
  },

  wrapRepoDb(repoDb) {
    const wrapped = { ...repoDb };
    const _origUpsert = repoDb.upsert;
    wrapped.upsert = (repoPath, name, configJson) => {
      const id = _origUpsert(repoPath, name, configJson);
      _proxySend('db:upsertRepo', { repoPath, name, config: configJson || {} });
      return id;
    };
    const _origMarkIndexed = repoDb.markIndexed;
    wrapped.markIndexed = (repoId, totalFiles, totalSymbols) => {
      _origMarkIndexed(repoId, totalFiles, totalSymbols);
      _proxySend('db:markIndexed', { repoId, totalFiles, totalSymbols });
    };
    const _origMarkUnindexed = repoDb.markUnindexed;
    wrapped.markUnindexed = (repoId) => {
      _origMarkUnindexed(repoId);
      _proxySend('db:reset', { repoId });
    };
    const _origRemove = repoDb.remove;
    wrapped.remove = (repoPath) => {
      _origRemove(repoPath);
      _proxySend('db:delete', { repoPath });
    };
    const _origGetByPath = repoDb.getByPath;
    wrapped.getByPath = (repoPath) => {
      return _proxyReadSync('repoDb.getByPath', () => _origGetByPath(repoPath), 'db:getStatus', { repoPath }, (r) => r.exists ? r : null);
    };
    const _origGetAll = repoDb.getAll;
    wrapped.getAll = () => {
      return _proxyReadSync('repoDb.getAll', () => _origGetAll(), 'db:getManaged', {}, (r) => Array.isArray(r) ? r : []);
    };
    return wrapped;
  },

  wrapFileDb(fileDb) {
    const wrapped = { ...fileDb };
    const _origInsert = fileDb.insert;
    wrapped.insert = (repoId, filePath, language, fileHash, lastModified) => {
      const id = _origInsert(repoId, filePath, language, fileHash, lastModified);
      _proxySend('db:insertFile', { repoId, filePath, language, fileHash, lastModified });
      return id;
    };
    const _origMarkDirty = fileDb.markDirty;
    wrapped.markDirty = (repoId, filePath) => {
      _origMarkDirty(repoId, filePath);
      _proxySend('db:markDirty', { repoId, filePath });
    };
    const _origGetByRepoAndPath = fileDb.getByRepoAndPath;
    wrapped.getByRepoAndPath = (repoId, filePath) => {
      return _proxyReadSync('fileDb.getByRepoAndPath', () => _origGetByRepoAndPath(repoId, filePath), 'db:getFileByPathAndRepo', { repoId, filePath });
    };
    const _origGetDirtyByRepo = fileDb.getDirtyByRepo;
    wrapped.getDirtyByRepo = (repoId) => {
      return _proxyReadSync('fileDb.getDirtyByRepo', () => _origGetDirtyByRepo(repoId), 'db:getDirtyFiles', { repoId });
    };
    return wrapped;
  },

  wrapSymbolDb(symbolDb) {
    const wrapped = { ...symbolDb };
    const _origGetByFile = symbolDb.getByFile;
    wrapped.getByFile = (fileId) => {
      return _proxyReadSync('symbolDb.getByFile', () => _origGetByFile(fileId), 'symbols:get', { fileId });
    };
    return wrapped;
  },
};

module.exports = { init, api };
