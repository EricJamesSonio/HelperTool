function lazy(mod) {
  let _mod = null;
  return (...args) => {
    if (!_mod) _mod = require(mod);
    return _mod(...args);
  };
}

// Lazy-loading task modules — only require()d on first use
const tasks = {
  'loc:scan':       lazy('./tasks/loc'),
  'gitGraph':       lazy('./tasks/gitGraph'),
  'profileData':    lazy('./tasks/profileData'),
  'teamActivity':   lazy('./tasks/teamActivity'),
  'portManager':    lazy('./tasks/portManager'),
  'gitBranches':    lazy('./tasks/gitBranches'),
  'gitOperations':  lazy('./tasks/gitOperations'),
  'walkDir':        lazy('./tasks/walkDir'),
  'folderTree':     lazy('./tasks/folderTree'),
  'profileSync':    lazy('./tasks/profileSync'),
};

const multiTypeTasks = {
  db:       lazy('./tasks/dbInspector'),
};

const progressTasks = {
  generate:         lazy('./tasks/generate'),
  'video:compress': lazy('./tasks/videoCompress'),
  'image:toIco':    lazy('./tasks/imageToIco'),
  'video:gif':      lazy('./tasks/videoToGif'),
  'video:render':   lazy('./tasks/videoRender'),
  'image:compress': lazy('./tasks/imageCompress'),
  'video:preview':  lazy('./tasks/videoPreview'),
};

process.send({ id: 'bootstrap', type: 'ready' });

process.on('message', async (msg) => {
  const { id, type, payload } = msg;

  const onProgress = (data) => {
    if (process.send) {
      const progressData = typeof data === 'object' ? data : { percent: data };
      process.send({ id, type: 'progress', data: progressData });
    }
  };

  try {
    let result;

    const simpleTask = tasks[type];
    if (simpleTask) {
      result = await simpleTask(payload);
    } else if (type === 'db:testConnection' || type === 'db:scan' || type === 'db:executeQuery') {
      result = await multiTypeTasks.db(type, payload);
    } else {
      const progressTask = progressTasks[type];
      if (progressTask) {
        result = await progressTask(payload, onProgress);
      } else {
        throw new Error('Unknown task type: ' + type);
      }
    }

    process.send({ id, type: 'result', data: result });
  } catch (err) {
    const message = err.message || String(err);
    console.error('[Worker] Task error:', type, message);
    process.send({ id, type: 'error', message });
  }
});

process.on('disconnect', () => {
  process.exit(0);
});
