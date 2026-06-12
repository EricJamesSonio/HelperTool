const generateTask = require('./tasks/generate');
const locTask = require('./tasks/loc');
const dbInspectorTask = require('./tasks/dbInspector');

process.send({ id: 'bootstrap', type: 'ready' });

process.on('message', async (msg) => {
  const { id, type, payload } = msg;

  const onProgress = (percent) => {
    if (process.send) process.send({ id, type: 'progress', data: { percent } });
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
