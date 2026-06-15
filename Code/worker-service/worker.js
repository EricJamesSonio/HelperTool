const generateTask = require('./tasks/generate');
const locTask = require('./tasks/loc');
const dbInspectorTask = require('./tasks/dbInspector');
const gitGraphTask = require('./tasks/gitGraph');
const profileDataTask = require('./tasks/profileData');
const teamActivityTask = require('./tasks/teamActivity');
const portManagerTask = require('./tasks/portManager');
const gitBranchesTask = require('./tasks/gitBranches');
const gitOperationsTask = require('./tasks/gitOperations');
const walkDirTask = require('./tasks/walkDir');
const folderTreeTask = require('./tasks/folderTree');
const profileSyncTask = require('./tasks/profileSync');
const videoCompressTask = require('./tasks/videoCompress');

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

    switch (type) {
      case 'generate':
        result = await generateTask(payload, onProgress);
        break;

      case 'loc:scan':
        result = await locTask(payload);
        break;

      case 'db:testConnection':
      case 'db:scan':
      case 'db:executeQuery':
        result = await dbInspectorTask(type, payload);
        break;

      case 'gitGraph':
        result = await gitGraphTask(payload);
        break;

      case 'profileData':
        result = await profileDataTask(payload);
        break;

      case 'teamActivity':
        result = await teamActivityTask(payload);
        break;

      case 'portManager':
        result = await portManagerTask(payload);
        break;

      case 'gitBranches':
        result = await gitBranchesTask(payload);
        break;

      case 'gitOperations':
        result = await gitOperationsTask(payload);
        break;

      case 'walkDir':
        result = await walkDirTask(payload);
        break;

      case 'folderTree':
        result = await folderTreeTask(payload);
        break;

      case 'profileSync':
        result = await profileSyncTask(payload);
        break;

      case 'video:compress':
        result = await videoCompressTask(payload, onProgress);
        break;

      default:
        throw new Error('Unknown task type: ' + type);
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
